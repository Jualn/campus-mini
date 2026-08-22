import {
  wxGetWindowInfo,
  wxHideKeyboard,
  wxHideLoading,
  wxNavigateTo,
  wxPageScrollTo,
  wxShowLoading,
} from '../../utils/wx-promise';
import { TARGET_TYPES } from '../../utils/constants';
import { createLogger } from '../../utils/logger';
import type { SelectedMediaFile } from '../../actions/media';
import type { AttachmentItemRequest } from '../../types/api';
import type { IndexActivityCard, IndexExamCardItem, PostCardItem } from '../../types/business';
import { getCustomTabBar } from '../../utils/tabbar';
import { scrollStore } from '../../stores/scrollStore';
import { getUserInfo } from '../../stores/helper';
import { authReady } from '../../actions/auth';
import { usePostActions } from '../../behaviors/usePostActions';
import { useListLoad } from '../../behaviors/useListLoad';
import definePage from '../../utils/definePage';
import { notifyToast, showErrorToast } from '../../utils/notify';
import { examAction, mediaAction, postAction } from '../../actions/index';

const log = createLogger('IndexPage');

type LoadScene = 'initial' | 'refresh';

interface IndexPageExtraThis {
  _tabBarHidden: boolean;
  _setPopupTabBarHidden: (hidden: boolean) => void;
  _prependPostCard: (post: PostCardItem) => void;
}

definePage({
  _currentScrollTop: 0,
  _lastScrollTop: 0,
  /** 当前真实应用到 custom-tabbar 的隐藏状态 */
  _tabBarHidden: false,
  /** tabbar 是否因为页面滚动而隐藏 */
  _tabBarHiddenByScroll: false,
  /** tabbar 是否因为弹窗打开而隐藏 */
  _tabBarHiddenByPopup: false,
  /** 存储当前是否正在预览图片 */
  _isPreviewingImage: false,
  _previewRestoreTimer: null as number | null,
  _pullDownRefreshEnabled: false,
  // _viewedPostIds: new Set<string>(),
  /** 记录最后一篇文章的ID */
  _lastPostId: '',
  /** 标记是否正在提交, 防止重复提交 */
  _submitting: false,
  _disposers: [] as (() => void)[],

  behaviors: [
    useListLoad({
      skeletonDelay: 150,
      minSkeletonDuration: 300,
      defaultHasMore: true,
    }),
    usePostActions<IndexPageExtraThis>({
      postListKeys: ['posts'],
      onPopupVisibleChange(visible) {
        // 同步页面的 showPopup 状态，保持一致
        this._setPopupTabBarHidden(visible);
      },
      onPostCreated(post) {
        this._prependPostCard(post);
      },
    }),
  ],

  data: {
    statusBarHeight: 20,
    navHeight: 64,
    /** 骨架循环数据写在 data 中，避免在 WXML 里创建临时数组 */
    skeletonExamList: [0, 1],
    skeletonQuickNavList: [0, 1],

    /** post-card 传递的数据列表 */
    posts: [] as PostCardItem[],

    activities: [] as IndexActivityCard[],
    examList: [] as IndexExamCardItem[],

    isScrolled: false, // 新增：是否页面发生滚动

    // FAB
    fabOpen: false,
    canPublishActivity: false, // 后端返回权限后设置
    fabBottomDock: 0,
    fabMenuBottom: 0,

    /** 给FAB同步，tabbar隐藏，FAB也隐藏 */
    tabBarHidden: false,
    /** 给最新发布的tab同步，tabbar隐藏，tab也隐藏, 虽然目前只有一个，但后续可能新增*/
    homeHeaderHidden: false,
  },

  async onLoad() {
    // 监听帖子更新事件，更新对应帖子的点赞、评论数等信息，保持与用户操作一致
    this._loadListeners();

    const sys = wxGetWindowInfo();
    const safeBottom = sys.screenHeight - sys.safeArea.bottom;

    const rpxRatio = sys.windowWidth / 750;
    const tabBarHeight = Math.round(120 * rpxRatio);
    const tabBarBottom = safeBottom + 16;

    const fabBottomDock = tabBarBottom + tabBarHeight + 16;
    const fabSize = 50;
    const fabMenuBottom = fabBottomDock + fabSize + 16;

    const menuButton = wx.getMenuButtonBoundingClientRect();
    this.setData({
      fabBottomDock,
      fabMenuBottom,
      canPublishActivity: getUserInfo('role') !== 1,
      statusBarHeight: sys.statusBarHeight,
      navHeight: menuButton.top + 10,
      // 考试数据为本地同步数据，先准备好；即使动态接口失败，顶部内容也能正常展示。
      examList: examAction.getExamSimpleList(),
    });

    this._listLoadBeginInitial();

    try {
      await authReady;
      await this._loadData({ scene: 'initial' });
    } catch (err) {
      // authReady 异常也必须结束骨架，否则页面会永久停在加载态。
      log.error('onLoad', '认证初始化失败', err);
      this._listLoadEndInitial({
        success: false,
        hasContent: this.data.posts.length > 0,
      });
    }
  },

  onUnload() {
    if (this._previewRestoreTimer !== null) {
      clearInterval(this._previewRestoreTimer);
      this._previewRestoreTimer = null;
    }

    // 卸载页面时移除事件监听，避免内存泄漏
    this._disposers.forEach((off: () => void) => {
      off();
    });
    this._disposers = [];

    // 记录当前滚动位置，供下次进入页面时恢复
    this._saveCurrentScrollTop();
  },

  onHide() {
    this._saveCurrentScrollTop();
  },

  async onPullDownRefresh() {
    // 弹窗、首屏加载或重复刷新期间不再发起新请求，避免状态相互覆盖。
    if (!this._listLoadCanRefresh(this.data.showPopup)) {
      void wx.stopPullDownRefresh();
      return;
    }

    try {
      await this._loadData({ scene: 'refresh' });
    } finally {
      void wx.stopPullDownRefresh();
    }
  },

  onShow() {
    // 初始化tabbar，确保在onLoad时就能获取到实例并调用方法
    if (typeof this.getTabBar === 'function') {
      getCustomTabBar(this).init();
    }

    // 页面展示时隐藏tabbar，保持与弹窗打开时一致的状态，避免切后台再切回来时tabbar状态异常。
    this._syncTabBarHidden(true);

    // 恢复上次滚动位置
    this._restoreScrollPosition();

    // 同步可能的帖子数据变更（如点赞、评论数等），确保数据与用户操作保持一致
    this._syncPostsFromCache();

    // this._loadData(); 不能全量刷新数据，否则会导致评论区关闭后帖子列表闪烁,后面设计有监听需求按监听实现刷新
  },

  onShareAppMessage(options): WechatMiniprogram.Page.ICustomShareContent {
    let imageUrl: string;
    let path: string;

    if (options.from === 'button') {
      imageUrl = this.data.currentShareImage || '';
      path = this.data.currentSharePath;
    } else {
      imageUrl = 'https://cos.jualn.cn/share/index-share.jpg';
      path = '/pages/index/index';
    }

    return {
      imageUrl,
      path,
    };
  },

  onShareTimeline(): WechatMiniprogram.Page.ICustomTimelineContent {
    const imageUrl = 'https://cos.jualn.cn/share/index-share.jpg';
    return {
      imageUrl,
    };
  },

  onPageScroll(e) {
    if (this.data.showPopup) return;

    this._currentScrollTop = e.scrollTop;
    this._handleTabbarByScroll(e.scrollTop);

    const isScrolled = e.scrollTop > 40;
    if (isScrolled !== this.data.isScrolled) {
      this.setData({ isScrolled });
    }
  },

  onReachBottom() {
    void this._loadMorePosts();
  },

  noop() {
    /* empty */
  },

  _loadListeners() {
    if (this._disposers.length > 0) return;

    // 监听事件
    this._disposers.push();
  },

  _prependPostCard(post: PostCardItem) {
    if (!post.id) return;
    const existingIndex = this.data.posts.findIndex((item) => item.id === post.id);
    if (existingIndex === 0) return;

    const nextPosts =
      existingIndex > 0
        ? [post, ...this.data.posts.filter((_, idx) => idx !== existingIndex)]
        : [post, ...this.data.posts];

    this.setData({ posts: nextPosts });
  },

  /**
   * 加载首页数据。
   * initial：显示整页骨架，失败时进入页面级错误态。
   * refresh：保留现有列表，失败时仅提示，不破坏用户正在浏览的内容。
   */
  async _loadData({ scene }: { scene: LoadScene }): Promise<boolean> {
    const isInitial = scene === 'initial';

    if (isInitial) {
      if (this.data.listLoad.phase !== 'initial') {
        this._listLoadBeginInitial();
      }
    } else {
      if (!this._listLoadCanRefresh(this.data.showPopup)) return false;
      this._listLoadBeginRefresh();
    }

    try {
      const post = await postAction.fetchPostList({});

      // 游标属于页面实例字段，不能通过 setData 写入，否则 _loadMorePosts 读取不到。
      this._lastPostId = post.nextCursor ?? '';

      this.setData({
        posts: post.list,
      });

      if (isInitial) {
        this._listLoadEndInitial({
          success: true,
          hasContent: post.list.length > 0,
          hasMore: post.hasMore,
        });
      } else {
        this._listLoadEndRefresh({
          success: true,
          hasContent: post.list.length > 0,
          hasMore: post.hasMore,
        });
      }

      return true;
    } catch (err) {
      const hasVisiblePosts = this.data.posts.length > 0;
      log.error('_loadData', `${isInitial ? '首次' : '刷新'}加载数据失败`, err);

      if (isInitial) {
        this._listLoadEndInitial({
          success: false,
          hasContent: hasVisiblePosts,
        });
      } else {
        this._listLoadEndRefresh({
          success: false,
          hasContent: hasVisiblePosts,
        });

        if (hasVisiblePosts) {
          showErrorToast(err, {
            fallback: '刷新失败，已保留当前内容',
          });
        }
      }

      return false;
    }
  },

  /** 页面级错误态的重试入口 */
  onRetryInitialLoad() {
    if (this.data.listLoad.phase === 'initial') return;
    void this._loadData({ scene: 'initial' });
  },

  async _loadMorePosts(forceRetry = false) {
    const extraBlock = this.data.showPopup;

    if (forceRetry) {
      this._listLoadResetMoreError();
    }

    if (!this._listLoadCanMore(extraBlock)) return;

    const lastId = this._lastPostId || undefined;
    this._listLoadBeginMore();

    try {
      const res = await postAction.fetchPostList({ lastId });

      // 防止后端游标边界重复返回同一条内容，避免列表出现重复卡片。
      const existingIds = new Set(this.data.posts.map((item) => item.id));
      const uniqueAppendList = res.list.filter((item) => !existingIds.has(item.id));
      const nextList = [...this.data.posts, ...uniqueAppendList];

      this._lastPostId = res.nextCursor ?? '';
      this.setData({
        posts: nextList,
      });

      this._listLoadEndMore({
        success: true,
        hasMore: res.hasMore,
      });
    } catch (err) {
      log.error('_loadMorePosts', '加载更多失败', err);
      // 使用列表内联错误态，不弹 Toast 打断阅读；并暂停自动触底重试。
      this._listLoadEndMore({
        success: false,
      });
    }
  },

  /** 分页失败后的显式重试入口 */
  onRetryLoadMore() {
    this._listLoadResetMoreError();
    void this._loadMorePosts(true);
  },

  _setPopupTabBarHidden(hidden: boolean) {
    if (this._tabBarHiddenByPopup === hidden) return;

    this._tabBarHiddenByPopup = hidden;
    this._syncTabBarHidden();
  },

  _setScrollTabBarHidden(hidden: boolean) {
    if (this._tabBarHiddenByScroll === hidden) return;

    this._tabBarHiddenByScroll = hidden;
    this._syncTabBarHidden();
  },

  _syncTabBarHidden(force = false) {
    const shouldHidden = this._tabBarHiddenByPopup || this._tabBarHiddenByScroll;
    this._applyTabBarHidden(shouldHidden, force);
  },

  _applyTabBarHidden(hidden: boolean, force = false) {
    const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();

    if (!force && this._tabBarHidden === hidden && this.data.tabBarHidden === hidden) {
      return;
    }

    this._tabBarHidden = hidden;

    if (tabBar) {
      getCustomTabBar(this).toggleVisible(!hidden);
    }

    if (this.data.tabBarHidden !== hidden) {
      this.setData({
        tabBarHidden: hidden,
      });
    }
  },

  // ==== 新增：封装方法，统一控制 TabBar 显示/隐藏，避免重复调用 ====
  // _setTabBarHidden(hidden: boolean) {
  //   const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
  //   if (!tabBar) {
  //     // 没有 tabbar （比如子包/调试环境）则跳过
  //     this._tabBarHidden = hidden;
  //     this.setData({
  //       tabBarHidden: hidden,
  //     });
  //     return;
  //   }
  //   // 避免重复调用同样的状态
  //   if (this._tabBarHidden === hidden) return;

  //   this._tabBarHidden = hidden;
  //   getCustomTabBar(this).toggleVisible(!hidden);
  //   this.setData({
  //     tabBarHidden: hidden,
  //   });
  // },

  _setHomeHeaderHidden(hidden: boolean) {
    this.setData({
      homeHeaderHidden: hidden,
    });
  },

  _handleTabbarByScroll(current: number) {
    if (this.data.showPopup) return;

    if (typeof this._lastScrollTop === 'undefined' || this._lastScrollTop === 0) {
      this._lastScrollTop = current;
      return;
    }

    if (current < 400) {
      this._setHomeHeaderHidden(false);
    }

    if (current <= 20) {
      this._setScrollTabBarHidden(false);
      this._setHomeHeaderHidden(false);
    }

    const SCROLL_THRESHOLD = 20;
    const delta = current - this._lastScrollTop;

    this._lastScrollTop = current;

    if (Math.abs(delta) < SCROLL_THRESHOLD) return;

    if (delta > 0 && current > 50) {
      this._setScrollTabBarHidden(true);

      if (current > 350) {
        this._setHomeHeaderHidden(true);
      }

      return;
    }

    if (delta < 0) {
      this._setScrollTabBarHidden(false);
      this._setHomeHeaderHidden(false);
    }
  },

  /** 通过scrollStore管理，恢复滚动位置 */
  _restoreScrollPosition() {
    // 恢复滚动位置
    const key = scrollStore.genKey(this.route, this.options);
    const savedScrollTop = scrollStore.get(key) || 0;
    this._currentScrollTop = savedScrollTop;

    if (this._isPreviewingImage) {
      // 如果正在预览图片，等预览结束再恢复滚动位置 （预览图片会改变页面结构，直接恢复滚动位置可能不准确）
      if (this._previewRestoreTimer !== null) clearInterval(this._previewRestoreTimer);
      this._previewRestoreTimer = setInterval(() => {
        if (!this._isPreviewingImage) {
          if (this._previewRestoreTimer !== null) clearInterval(this._previewRestoreTimer);
          this._previewRestoreTimer = null;
          wxPageScrollTo({ scrollTop: savedScrollTop }).catch((err: unknown) => {
            log.error('_restoreScrollPosition', '恢复滚动位置失败', err);
          });
        }
      }, 300);
    } else {
      wxPageScrollTo({ scrollTop: savedScrollTop }).catch((err: unknown) => {
        log.error('_restoreScrollPosition', '恢复滚动位置失败', err);
      });
    }
  },
  /** 通过scrollStore，保存当前滚动位置 */
  _saveCurrentScrollTop() {
    const key = scrollStore.genKey(this.route, this.options);
    scrollStore.set(key, this._currentScrollTop || 0);
  },

  _navigateTo(url: string) {
    this._saveCurrentScrollTop();
    wxNavigateTo({ url }).catch((err: unknown) => {
      log.error('_navigateTo', '导航失败', err);
      notifyToast({ title: '导航失败', icon: 'error' });
    });
  },

  /** 截取去除杂乱字符的content，前10个字符作为标题 */
  _generateTitle(content: string, maxLength = 10): string {
    if (!content) return '无标题';

    // 去掉首尾空格和换行
    let text = content.trim().replace(/\r?\n/g, ' ');

    // 可选：去掉 HTML 标签
    text = text.replace(/<[^>]+>/g, '');

    // 截取前 maxLength 个字符
    if (text.length > maxLength) {
      text = text.slice(0, maxLength) + '...';
    }

    return text || '无标题';
  },

  onTapFab() {
    const { canPublishActivity, fabOpen } = this.data;
    if (!canPublishActivity) {
      this.onPublishPost();
      return;
    }
    this.setData({ fabOpen: !fabOpen });
  },

  onCloseFab() {
    this.setData({ fabOpen: false });
  },

  // grid-image 组件预览图片时调用，通知页面正在预览图片
  notifyPreviewImage() {
    this._isPreviewingImage = true;
  },

  /**
   * FAB -> catchtap 发布按钮事件回调，打开发布帖子弹窗
   */
  onPublishPost() {
    void wxHideKeyboard();
    this._openPopup({
      fabOpen: false,
      popupType: 'post-edit',
    });
  },

  // post-edit-panel 组件绑定的事件回调

  /**
   * post-edit-panel -> bind:submit 事件回调，发布帖子
   * detail 需要传递 content 和 selectedFiles，content 用于帖子内容，selectedFiles 用于附件文件列表
   * @param e 事件对象，包含 detail.content 和 detail.selectedFiles，用于发布帖子内容和附件文件列表
   */
  async onPostSubmit(
    e: WechatMiniprogram.CustomEvent<{
      content: string;
      selectedFiles?: SelectedMediaFile[];
    }>,
  ) {
    if (this._submitting) return;
    this._submitting = true;

    const { content, selectedFiles } = e.detail;

    void wxShowLoading({
      title: '发布中...',
      mask: true,
    });

    try {
      let attachmentItems: AttachmentItemRequest[] = [];

      // 只有用户最终点击发布时才上传 COS
      // 用户选择图片、取消图片、关闭弹窗时，不上传 COS
      if (selectedFiles && selectedFiles.length > 0) {
        attachmentItems = await mediaAction.uploadAndSaveFiles(
          TARGET_TYPES.POST.value,
          selectedFiles,
        );
      }

      // TODO:
      // 当前未做 COS 孤儿文件回收。
      // 如果 COS 上传成功但 publishPost 失败，可能产生少量无业务引用文件。
      // 现阶段先观察 COS 存储情况，后续如有必要再增加 objectKey 生命周期记录和定时清理。
      await postAction.publishPostAndSync({
        title: this._generateTitle(content),
        content,
        attachmentItems,
      });

      this._closePopup(true);

      notifyToast({
        title: '发布成功',
        icon: 'success',
      });
    } catch (err) {
      showErrorToast(err, {
        fallback: '发布帖子失败，请稍后重试',
      });

      log.error('onPostSubmit', '发布帖子异常', err);
    } finally {
      this._submitting = false;
      void wxHideLoading();
    }
  },
  /**
   * post-edit-panel -> bind:close 事件回调，关闭发布帖子弹窗
   */
  onPostEditClose() {
    this._closePopup();
  },

  onPublishActivity() {
    this.setData({ fabOpen: false });
    this._navigateTo('/subpkg_activity/pages/publish/publish');
  },

  goToActivityList() {
    this._navigateTo('/subpkg_activity/pages/list/list');
  },

  toSearch() {
    this._navigateTo('/subpkg_community/pages/search/search');
  },

  goToExamList() {
    this._navigateTo('/subpkg_exam/pages/list/list');
  },

  goToExamDetail(e: WechatMiniprogram.TouchEvent) {
    const examId = e.currentTarget.dataset.id as string;
    this._navigateTo(`/subpkg_exam/pages/detail/detail?examId=${examId}`);
  },
});
