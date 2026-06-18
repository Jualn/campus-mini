import {
  wxGetWindowInfo,
  wxHideKeyboard,
  wxHideLoading,
  wxNavigateTo,
  wxPageScrollTo,
  wxShowLoading,
  wxShowToast,
} from '../../utils/wx-promise';
import { examService, mediaService, postService } from '../../services/index';
import { TARGET_TYPES } from '../../utils/constants';
import createLogger from '../../utils/logger';
import type { SelectedMediaFile } from '../../services/media';
import type { AttachmentItemRequest } from '../../types/api';
import type { IndexActivityCard, IndexExamCardItem, PostCardItem } from '../../types/business';
import { getCustomTabBar } from '../../utils/tabbar';
import { scrollStore } from '../../store/scrollStore';
import { emitPostCreated } from '../../events/post-event';
import { getUserInfo } from '../../store/helper';
import { authReady } from '../../services/auth';
import { usePostActions } from '../../behaviors/usePostActions';
import { useListLoad } from '../../behaviors/useListLoad';

const log = createLogger('IndexPage');

type LoadScene = 'initial' | 'refresh';

interface IndexPageExtraThis {
  _tabBarHidden: boolean;
  _setTabBarHidden: (hidden: boolean) => void;
}

Page({
  _currentScrollTop: 0,
  _lastScrollTop: 0,
  /** 存储当前tabbar状态避免多次调用 */
  _tabBarHidden: false,
  /** 存储当前是否正在预览图片 */
  _isPreviewingImage: false,
  _pullDownRefreshEnabled: false,
  // _viewedPostIds: new Set<string>(),
  /** 记录最后一篇文章的ID */
  _lastPostId: '',
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
        this._setTabBarHidden(visible);
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

    // page-container popup相关
    // showPopup: false,
    /** 弹窗类型 'comment' | 'share' | 'report' | 'post-edit' */
    // popupType: '',

    // comment-panel 传递的数据
    // targetType: TARGET_TYPES.POST.value, // 默认目标类型为 post
    // currentPostId: '',
    // currentCommentCount: 0,

    // share-panel 传递的数据
    // currentShareImage: '',
    // currentSharePath: '',

    // report-panel 传递的数据
    // reportTargetType: 0,
    // reportTargetId: '',

    // activePostId: '',
    // activePostCommentCount: 0,

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
      examList: examService.getExamSimpleList(),
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
    // 卸载页面时移除事件监听，避免内存泄漏
    this._disposers.forEach((off) => {
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

  // _applyPostSyncCache(list: PostCardItem[]) {
  //   let changed = false;
  //   const merged = list.map((post) => {
  //     const cached = postSyncStore.get(post.id);
  //     if (!cached) return post;

  //     const nextIsLiked = typeof cached.isLiked === 'boolean' ? cached.isLiked : post.isLiked;
  //     const nextLikeCount =
  //       typeof cached.likeCount === 'number' ? Math.max(0, cached.likeCount) : post.likeCount;
  //     const nextCommentCount =
  //       typeof cached.commentCount === 'number'
  //         ? Math.max(0, cached.commentCount)
  //         : post.commentCount;
  //     const nextViewCount =
  //       typeof cached.viewCount === 'number' ? Math.max(0, cached.viewCount) : post.viewCount;

  //     const hasDiff =
  //       nextIsLiked !== post.isLiked ||
  //       nextLikeCount !== post.likeCount ||
  //       nextCommentCount !== post.commentCount ||
  //       nextViewCount !== post.viewCount;

  //     if (!hasDiff) return post;
  //     changed = true;
  //     return {
  //       ...post,
  //       isLiked: nextIsLiked,
  //       likeCount: nextLikeCount,
  //       commentCount: nextCommentCount,
  //       viewCount: nextViewCount,
  //     };
  //   });

  //   return { merged, changed };
  // },

  // _syncPostsFromCache() {
  //   if (!this.data.posts.length) return;
  //   const { merged, changed } = this._applyPostSyncCache(this.data.posts);
  //   if (changed) {
  //     this.setData({ posts: merged });
  //   }
  // },

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

  // _recordPostView(postId: string) {
  //   if (!postId) return;
  //   if (this._viewedPostIds.has(postId)) return;
  //   this._viewedPostIds.add(postId);

  //   this._bumpPostViewCount(postId);
  //   interactService
  //     .reportView({ targetType: TARGET_TYPES.POST.value, targetId: postId })
  //     .catch((err: unknown) => {
  //       log.warn('_recordPostView', '上报浏览失败', err);
  //     });
  // },

  // _bumpPostViewCount(postId: string) {
  //   const idx = this.data.posts.findIndex((p) => p.id === postId);
  //   const cached = postSyncStore.get(postId);
  //   const baseCount =
  //     idx !== -1
  //       ? (this.data.posts[idx]?.viewCount ?? 0)
  //       : typeof cached?.viewCount === 'number'
  //         ? cached.viewCount
  //         : 0;
  //   const nextCount = Math.max(0, baseCount + 1);

  //   if (idx !== -1) {
  //     this.setData({
  //       [`posts[${String(idx)}].viewCount`]: nextCount,
  //     });
  //   }

  //   postSyncStore.set({ id: postId, viewCount: nextCount });
  //   eventBus.emit(EVENTS.POST_UPDATED, { id: postId, viewCount: nextCount });
  // },

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
      const post = await postService.fetchPostList({});
      const { merged } = this._applyPostSyncCache(post.list);

      // 游标属于页面实例字段，不能通过 setData 写入，否则 _loadMorePosts 读取不到。
      this._lastPostId = post.nextCursor ?? '';

      this.setData({
        posts: merged,
      });

      if (isInitial) {
        this._listLoadEndInitial({
          success: true,
          hasContent: merged.length > 0,
          hasMore: post.hasMore,
        });
      } else {
        this._listLoadEndRefresh({
          success: true,
          hasContent: merged.length > 0,
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
          void wxShowToast({
            title: '刷新失败，已保留当前内容',
            icon: 'none',
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
      const res = await postService.fetchPostList({ lastId });

      // 防止后端游标边界重复返回同一条内容，避免列表出现重复卡片。
      const existingIds = new Set(this.data.posts.map((item) => item.id));
      const uniqueAppendList = res.list.filter((item) => !existingIds.has(item.id));
      const nextList = [...this.data.posts, ...uniqueAppendList];
      const { merged } = this._applyPostSyncCache(nextList);

      this._lastPostId = res.nextCursor ?? '';
      this.setData({
        posts: merged,
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

  /** 打开弹窗，确保 TabBar的状态是隐藏 */
  // _openPopup(patch: Record<string, unknown>) {
  //   this._setTabBarHidden(true);
  //   this.setData({
  //     ...patch,
  //     showPopup: true,
  //   });
  // },

  /** 关闭弹窗, 如果tabbar是隐藏的保持原本隐藏，是显示的则恢复显示 */
  // _closePopup(resetType = false) {
  //   const patch: Record<string, unknown> = {
  //     showPopup: false,
  //   };
  //   if (resetType) patch.popupType = '';
  //   // 保持原本隐藏状态，如果之前是显示的则恢复显示
  //   if (!this._tabBarHidden) this._setTabBarHidden(false);
  //   this.setData(patch);
  // },

  // ==== 新增：封装方法，统一控制 TabBar 显示/隐藏，避免重复调用 ====
  _setTabBarHidden(hidden: boolean) {
    const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
    if (!tabBar) {
      // 没有 tabbar （比如子包/调试环境）则跳过
      this._tabBarHidden = hidden;
      this.setData({
        tabBarHidden: hidden,
      });
      return;
    }
    // 避免重复调用同样的状态
    if (this._tabBarHidden === hidden) return;

    this._tabBarHidden = hidden;
    getCustomTabBar(this).toggleVisible(!hidden);
    this.setData({
      tabBarHidden: hidden,
    });
  },

  _setHomeHeaderHidden(hidden: boolean) {
    this.setData({
      homeHeaderHidden: hidden,
    });
  },

  /** 通过scrollStore管理，恢复滚动位置 */
  _restoreScrollPosition() {
    // 恢复滚动位置
    const key = scrollStore.genKey(this.route, this.options);
    const savedScrollTop = scrollStore.get(key) || 0;
    this._currentScrollTop = savedScrollTop;

    if (this._isPreviewingImage) {
      // 如果正在预览图片，等预览结束再恢复滚动位置 （预览图片会改变页面结构，直接恢复滚动位置可能不准确）
      const checkPreviewEnd = setInterval(() => {
        if (!this._isPreviewingImage) {
          clearInterval(checkPreviewEnd);
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
      void wxShowToast({ title: '导航失败', icon: 'error' });
    });
  },

  _handleTabbarByScroll(current: number) {
    if (typeof this._lastScrollTop === 'undefined' || this._lastScrollTop === 0) {
      this._lastScrollTop = current;
      return;
    }
    if (current < 400) this._setHomeHeaderHidden(false);
    const SCROLL_THRESHOLD = 20;
    const delta = current - this._lastScrollTop;

    this._lastScrollTop = current;
    if (Math.abs(delta) < SCROLL_THRESHOLD) return;

    if (delta > 0 && current > 50) {
      this._setTabBarHidden(true);
      if (current > 350) this._setHomeHeaderHidden(true);
      return;
    }

    if (delta < 0) {
      this._setTabBarHidden(false);
      this._setHomeHeaderHidden(false);
      return;
    }
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

  // async onReportSubmit(
  //   e: WechatMiniprogram.CustomEvent<{
  //     targetType: TargetType;
  //     targetId: string;
  //     reason: ReportReason;
  //     mark: string;
  //   }>,
  // ) {
  //   const { targetType, targetId, reason, mark } = e.detail;
  //   try {
  //     await reportService.report({
  //       targetType,
  //       targetId,
  //       reason: reason,
  //       mark: mark.trim(),
  //     });
  //     void wxShowToast({
  //       title: '举报成功',
  //       icon: 'success',
  //     });
  //     this._closePopup(true);
  //   } catch (err: unknown) {
  //     log.error('onReportSubmit', '举报失败', err);
  //     void wxShowToast({
  //       title: '举报失败，请稍后再试',
  //       icon: 'none',
  //     });
  //   }
  // },

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

  // // 触发 page-container 弹窗事件

  // /**
  //  * page-container -> bind:leave 事件回调，关闭所有弹窗
  //  */
  // onPopupLeave() {
  //   this.setData({
  //     showPopup: false,
  //     popupType: '',
  //   });
  // },
  // // onOpenComment, onOpenShare, onPostCardMore

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

  // // post-card 绑定的发布活动事件

  // /**
  //  * post-card -> bind:comment 事件回调，打开评论区弹窗
  //  * detail 需要传递 postId 和 commentCount，postId 用于打开对应的评论区，commentCount 用于显示当前评论数量
  //  * @param e 事件对象，包含 detail.postId 和 detail.commentCount
  //  */
  // onOpenComment(e: WechatMiniprogram.CustomEvent<{ postId: string; commentCount: number }>) {
  //   const { postId, commentCount } = e.detail;
  //   this._recordPostView(postId);
  //   if (typeof this.getTabBar === 'function') {
  //     getCustomTabBar(this).toggleVisible(false);
  //   }

  //   void wxHideKeyboard();
  //   this._pullDownRefreshEnabled = true;

  //   this.setData({
  //     currentPostId: postId,
  //     activePostId: postId,
  //     currentCommentCount: commentCount,
  //     activePostCommentCount: commentCount,
  //     popupType: 'comment',
  //     showPopup: true,
  //   });
  // },
  // /**
  //  * post-card -> bind:view 事件回调，记录文章浏览，避免重复记录
  //  * detail 需要传递 postId 用于记录浏览
  //  * @param e 事件对象，包含 detail.postId
  //  */
  // onPostView(e: WechatMiniprogram.CustomEvent<{ postId: string }>) {
  //   const postId = e.detail.postId;
  //   this._recordPostView(postId);
  // },
  // /**
  //  * post-card -> bind:share 事件回调，打开分享弹窗
  //  * detail 需要传递 sharePath 和 shareImage，sharePath 用于设置分享路径，shareImage 用于设置分享图片
  //  * @param e 事件对象，包含 detail.sharePath 和 detail.shareImage
  //  */
  // onOpenShare(e: WechatMiniprogram.CustomEvent<{ sharePath: string; shareImage: string }>) {
  //   const { sharePath, shareImage } = e.detail;
  //   this._openPopup({
  //     activePostId: this.data.currentPostId,
  //     popupType: 'share',
  //     currentSharePath: sharePath,
  //     currentShareImage: shareImage,
  //   });
  // },
  // /**
  //  * post-card -> bind:shareImageReady 事件回调，分享图片生成完成后更新分享图片地址
  //  * detail 需要传递 shareImage，用于更新分享图片地址
  //  * @param e 事件对象，包含 detail.shareImage
  //  */
  // onShareImageReady(e: WechatMiniprogram.CustomEvent<{ shareImage: string }>) {
  //   this.setData({
  //     currentShareImage: e.detail.shareImage,
  //   });
  // },
  // /**
  //  * post-card -> bind:more 事件回调，打开更多操作弹窗
  //  * detail 需要传递 targetType 和 targetId，targetType 用于确定举报的目标类型（如帖子、评论等），targetId 用于确定举报的目标ID
  //  * @param e 事件对象，包含 detail.targetType 和 detail.targetId，用于确定举报的目标类型和目标ID
  //  */
  // onPostCardMore(e: WechatMiniprogram.CustomEvent<{ targetType: number; targetId: string }>) {
  //   const { targetType, targetId } = e.detail;
  //   this._openPopup({
  //     popupType: 'report',
  //     reportTargetType: targetType,
  //     reportTargetId: targetId,
  //   });
  // },

  // // comment-panel 组件绑定的事件回调

  // /**
  //  * comment-panel -> bind:close 事件回调，关闭评论区弹窗
  //  */
  // onCommentClose() {
  //   this.setData({ showPopup: false });
  // },
  // /**
  //  * comment-panel -> bind:countChange 事件回调，更新当前文章的评论数量
  //  * detail 需要传递 count，表示当前文章的最新评论数量
  //  * @param e 事件对象，包含 detail.count，用于更新当前文章的评论数量
  //  */
  // onCommentCountChange(
  //   e: WechatMiniprogram.CustomEvent<{
  //     count: number;
  //     delta: number;
  //     targetId: string;
  //     targetType: string;
  //   }>,
  // ) {
  //   const { count } = e.detail;
  //   const targetPostId = this.data.activePostId || this.data.currentPostId;
  //   const idx = this.data.posts.findIndex((p: PostCardItem) => p.id === targetPostId);
  //   const safeCount = Math.max(0, count);
  //   const patch: Record<string, unknown> = {
  //     activePostCommentCount: safeCount,
  //   };
  //   if (idx !== -1) {
  //     patch[`posts[${String(idx)}].commentCount`] = safeCount;
  //   }
  //   this.setData(patch);
  //   if (targetPostId) {
  //     postSyncStore.set({ id: targetPostId, commentCount: safeCount });
  //   }
  // },

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
    const { content, selectedFiles } = e.detail;
    void wxShowLoading({
      title: '发布中...',
    });
    try {
      let attachmentItems: AttachmentItemRequest[] = [];

      if (selectedFiles && selectedFiles.length > 0) {
        attachmentItems = await mediaService.uploadAndSaveFiles(
          TARGET_TYPES.POST.value,
          selectedFiles,
        );
      }

      const postCard = await postService.publishPost({
        title: this._generateTitle(content),
        content,
        attachmentItems,
      });

      void wxHideLoading();
      this._closePopup(true);
      this._prependPostCard(postCard);
      emitPostCreated(postCard);
      void wxShowToast({
        title: '发布成功',
        icon: 'success',
      });
    } catch (err) {
      void wxHideLoading();
      void wxShowToast({
        title: '发布帖子失败，请稍后重试',
        icon: 'none',
      });
      log.error('onPostSubmit', '发布帖子异常', err);
    }
  },
  /**
   * post-edit-panel -> bind:close 事件回调，关闭发布帖子弹窗
   */
  onPostEditClose() {
    this._closePopup();
  },

  // // share-panel 组件绑定的事件回调

  // /**
  //  * share-panel -> bind:close 事件回调，关闭分享弹窗
  //  */
  // onShareClose() {
  //   this._closePopup();
  // },

  // // report-panel 组件绑定的事件回调

  // /**
  //  * report-panel -> bind:close 事件回调，关闭举报弹窗
  //  */
  // onCloseReport() {
  //   this._closePopup();
  // },

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
