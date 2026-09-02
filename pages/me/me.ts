import { wxPageScrollTo } from '../../utils/wx-promise';
import type { PostCardItem, UserProfileInfo } from '../../types/business';
import { getCustomTabBar } from '../../utils/tabbar';
import { scrollStore } from '../../stores/scrollStore';
import { createLogger } from '../../utils/logger';
import { TARGET_TYPES } from '../../utils/constants';
import { usePostActions } from '../../behaviors/usePostActions';
import { useListLoad } from '../../behaviors/useListLoad';
import * as postAction from '../../actions/post';
import * as userAction from '../../actions/user';
import definePage from '../../utils/definePage';
import { notifyToast } from '../../utils/notify';
import { getCurrentProfile, watchCurrentProfile } from '../../actions/current-user';

const log = createLogger('MePage');

interface MePageExtraThis {
  _setTabBarHidden: (hidden: boolean) => void;
  _prependPost: (post: PostCardItem) => void;
}

definePage({
  _currentScrollTop: 0,
  /** 存储当前是否正在预览图片 */
  _isPreviewingImage: false,
  _previewRestoreTimer: null as number | null,
  _pullDownRefreshEnabled: false,
  _tabBarHidden: false,
  _offProfile: null as (() => void) | null,

  behaviors: [
    useListLoad({
      skeletonDelay: 120,
      minSkeletonDuration: 260,
      defaultHasMore: false,
    }),

    usePostActions<MePageExtraThis>({
      postListKeys: ['posts', 'postsCache', 'likesCache'],
      onPopupVisibleChange(visible) {
        this._setTabBarHidden(visible);
      },
      onPostCreated(post) {
        this._prependPost(post);
      },
    }),
  ],
  data: {
    // 骨架屏相关
    likesLoading: false,
    likesError: false,

    statusBarHeight: 20,
    activeTab: 'posts',

    userInfo: {} as UserProfileInfo,

    likesLoaded: false,

    targetType: TARGET_TYPES.POST.value, // 默认目标类型为 post
  },

  onShareAppMessage(options): WechatMiniprogram.Page.ICustomShareContent {
    if (options.from === 'button') return this._getShareContent();
    return {
      title: '发现校园里的新鲜事',
      path: '/pages/index/index',
      imageUrl: 'https://cos.jualn.cn/share/index-share.jpg',
    };
  },

  onLoad() {
    this._offProfile = watchCurrentProfile((profile) => {
      this.setData({ userInfo: profile ?? ({} as UserProfileInfo) });
      if (!profile) this.setData({ posts: [], postsCache: [], likesCache: [], likesLoaded: false });
    });
    this._currentScrollTop = 0;

    const systemInfo = wx.getWindowInfo();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight,
    });
    void this._loadProfileAndPosts('initial');
  },

  onShow() {
    void getCurrentProfile({ allowStale: true }).catch((err: unknown) => {
      log.warn('onShow', '资料校验失败，保留现有展示', err);
    });
    // 初始化tabbar，确保在onLoad时就能获取到实例并调用方法
    if (typeof this.getTabBar === 'function') {
      getCustomTabBar(this).init();
    }

    // 恢复滚动位置
    this._restoreScrollPosition();
  },

  onUnload() {
    this._offProfile?.();
    if (this._previewRestoreTimer !== null) {
      clearInterval(this._previewRestoreTimer);
      this._previewRestoreTimer = null;
    }
    this._saveCurrentPosition();
  },

  onHide() {
    // 当预览图片时会触发页面隐藏，不保存位置，会回到顶部，等预览结束再恢复位置
    this._saveCurrentPosition();
  },

  onPageScroll(e: WechatMiniprogram.Page.IPageScrollOption) {
    if (this.data.showPopup) return;

    this._currentScrollTop = e.scrollTop;
  },

  /**  ==== 封装方法，统一控制 TabBar 显示/隐藏，避免重复调用 ==== */
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

  async onPullDownRefresh() {
    if (this.data.showPopup) {
      void wx.stopPullDownRefresh();
      return;
    }

    if (!this._listLoadCanRefresh()) {
      void wx.stopPullDownRefresh();
      return;
    }

    try {
      if (this.data.activeTab === 'likes') {
        await Promise.all([this._loadProfileAndPosts('refresh'), this._loadLikes({ force: true })]);
      } else {
        await this._loadProfileAndPosts('refresh');
      }
    } finally {
      void wx.stopPullDownRefresh();
    }
  },

  async _loadProfileAndPosts(scene: 'initial' | 'refresh' = 'initial') {
    if (scene === 'initial') {
      this._listLoadBeginInitial();
    } else {
      this._listLoadBeginRefresh();
    }

    try {
      const result = await userAction.getMePageData({ force: scene === 'refresh' });

      const patch: Record<string, unknown> = {
        userInfo: result.userInfo,
        postsCache: result.posts,
      };

      // 只有当前在 posts tab 才把结果渲染到列表，避免覆盖其他 tab 的数据
      if (this.data.activeTab === 'posts') {
        patch.posts = result.posts;
      }

      this.setData(patch);

      const maybeHasMore = (result as { hasMore?: boolean }).hasMore;
      const hasMore = typeof maybeHasMore === 'boolean' ? maybeHasMore : false;
      const hasContent = !!result.userInfo.id || result.posts.length > 0;

      if (scene === 'initial') {
        this._listLoadEndInitial({
          success: true,
          hasContent,
          hasMore,
        });
      } else {
        this._listLoadEndRefresh({
          success: true,
          hasContent,
          hasMore,
        });
      }
    } catch (err) {
      log.error('_loadProfileAndPosts', '加载我的主页失败', err);

      const hasContent =
        !!this.data.userInfo.id || this.data.postsCache.length > 0 || this.data.posts.length > 0;

      if (scene === 'initial') {
        this._listLoadEndInitial({
          success: false,
          hasContent,
          hasMore: false,
        });
      } else {
        this._listLoadEndRefresh({
          success: false,
          hasContent,
        });

        if (hasContent) {
          notifyToast({
            title: '刷新失败，请稍后再试',
            icon: 'none',
          });
        }
      }
    }
  },

  _prependPost(post: PostCardItem) {
    const existingIndex = this.data.postsCache.findIndex((item) => item.id === post.id);
    if (existingIndex === 0 && this.data.activeTab === 'posts') return;

    const nextCache =
      existingIndex > 0
        ? [post, ...this.data.postsCache.filter((_, idx) => idx !== existingIndex)]
        : [post, ...this.data.postsCache];

    const patch: Record<string, unknown> = {
      postsCache: nextCache,
    };

    if (this.data.activeTab === 'posts') {
      patch.posts = nextCache;
    }

    this.setData(patch);
  },

  async _loadLikes(options: { force?: boolean } = {}) {
    if (this.data.likesLoading) return;

    if (this.data.likesLoaded && !options.force) {
      if (this.data.activeTab === 'likes') {
        this.setData({
          posts: this.data.likesCache,
        });
      }
      return;
    }

    this.setData({
      likesLoading: true,
      likesError: false,
    });

    try {
      const userId = this.data.userInfo.id ?? '';
      if (!userId) throw new Error('missing user id');

      const result = await postAction.getUserLikedPosts(userId);
      if (this.data.userInfo.id !== userId) return;

      const patch: Record<string, unknown> = {
        likesCache: result.list,
        likesLoaded: true,
        likesError: false,
      };

      if (this.data.activeTab === 'likes') {
        patch.posts = result.list;
      }

      this.setData(patch);
    } catch (err) {
      log.error('_loadLikes', '加载我点赞的帖子失败', err);

      const patch: Record<string, unknown> = {
        likesLoaded: false,
        likesError: true,
      };

      if (this.data.activeTab === 'likes') {
        patch.posts = [];
      }

      this.setData(patch);

      notifyToast({
        title: '加载失败，请稍后再试',
        icon: 'none',
      });
    } finally {
      this.setData({
        likesLoading: false,
      });
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
  _saveCurrentPosition() {
    const key = scrollStore.genKey(this.route, this.options);
    scrollStore.set(key, this._currentScrollTop || 0);
  },

  // grid-image 组件预览图片时调用，通知页面正在预览图片
  notifyPreviewImage() {
    this._isPreviewingImage = true;
  },

  /**
   * user-profile -> bind:switchtab 事件回调，切换帖子/点赞列表
   *
   * posts tab 使用 postsCache；
   * likes tab 首次进入时先切 tab，再请求点赞列表，避免使用未加载的 likesCache 造成字段缺失。
   */
  onSwitchTab(e: WechatMiniprogram.CustomEvent<{ tab: string }>) {
    const tab = e.detail.tab;
    if (tab === this.data.activeTab) return;

    // 合并为一次 setData，避免中间帧数据不一致
    const posts = tab === 'posts' ? this.data.postsCache : this.data.likesCache;
    this.setData({ activeTab: tab, posts });

    if (tab === 'likes') {
      void this._loadLikes();
    }
  },

  retryInitial() {
    void this._loadProfileAndPosts('refresh');
  },

  retryLikes() {
    void this._loadLikes({ force: true });
  },

  retryLoadMore() {
    this._listLoadResetMoreError();
    // 如果后面接分页接口，这里调用 this._loadMorePosts()
  },
});
