// pages/user/index.ts
import { wxGetWindowInfo } from '../../../utils/wx-promise';
import type { UserProfileInfo } from '../../../types/business';
import { createLogger } from '../../../utils/logger';
import { TARGET_TYPES } from '../../../utils/constants';
import { usePostActions } from '../../../behaviors/usePostActions';
import { useListLoad } from '../../../behaviors/useListLoad';
import * as postAction from '../../../actions/post';
import * as userAction from '../../../actions/user';
import definePage from '../../../utils/definePage';
import { notifyToast } from '../../../utils/notify';
import { navigateBackOrHome } from '../../utils/navigation';
import { watchCurrentProfile } from '../../../actions/current-user';

const log = createLogger('UserPage');

definePage({
  _currentScrollTop: 0,
  _isPreviewingImage: false,
  _pullDownRefreshEnabled: false,
  _userId: '',
  _offProfile: null as (() => void) | null,
  _navigateBackTimer: null as number | null,
  // _viewedPostIds: new Set<string>(),
  behaviors: [
    useListLoad({
      skeletonDelay: 120,
      minSkeletonDuration: 260,
      defaultHasMore: false,
    }),

    usePostActions({
      postListKeys: ['posts', 'postsCache', 'likesCache'],
    }),
  ],
  data: {
    // 骨架屏相关, 其中包含 posts 数据，避免重复定义
    // isFollowing: false,
    likesLoading: false,
    likesError: false,

    statusBarHeight: 20,
    activeTab: 'posts',

    userInfo: {} as UserProfileInfo,
    // posts: [] as PostCardItem[],
    // postsCache: [] as PostCardItem[],
    // likesCache: [] as PostCardItem[],
    likesLoaded: false,

    // page-container popup相关
    // showPopup: false,
    /** 弹窗类型 'comment' | 'share' | 'report' | 'post-edit' */
    // popupType: '',

    // comment-panel 传递的数据
    // commentTargetId: '',
    // commentTargetType: TARGET_TYPES.POST.value,
    // commentTotalCount: 0,

    // share-panel 传递的数据
    // currentShareImage: '',
    // currentSharePath: '',

    // report-panel 传递的数据
    // reportTargetType: 0,
    // reportTargetId: '',
    // 用于举报来源追踪，记录用户是从哪个页面/入口进入的举报流程，避免直接关闭举报弹窗而是返回comment-panel
    // reportSourceType: '',
    // reportParentId: '',
    // previousPopupType: '',
  },

  onLoad(query: { userId: string }) {
    this._currentScrollTop = 0;

    this.setData({
      count: 1,
      behaviorLoading: true,
      behaviorTitle: '修改后',
    });

    const systemInfo = wxGetWindowInfo();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight,
    });

    if (!query.userId) {
      this._listLoadEndInitial({
        success: false,
        hasContent: false,
        hasMore: false,
      });

      notifyToast({
        title: '加载失败，请重试',
        icon: 'none',
      });

      this._navigateBackTimer = setTimeout(() => {
        this._navigateBackTimer = null;
        navigateBackOrHome();
      }, 1000);
      return;
    }

    this._userId = query.userId;
    this._offProfile = watchCurrentProfile((profile) => {
      if (profile?.id === this._userId) this.setData({ userInfo: profile });
    });
    void this._loadUserProfile(query.userId, 'initial');

    // if (query.userId === getUserInfo('id')) {
    //   void wxSwitchTab({
    //     url: '/pages/me/me',
    //   });
    // }
  },

  onUnload() {
    this._offProfile?.();
    if (this._navigateBackTimer !== null) {
      clearTimeout(this._navigateBackTimer);
      this._navigateBackTimer = null;
    }
  },

  onPageScroll(e) {
    // 弹窗打开时不更新，避免 fixed 定位触发的滚动干扰
    if (!this.data.showPopup) {
      this._currentScrollTop = e.scrollTop;
    }
  },

  onShareAppMessage(options): WechatMiniprogram.Page.ICustomShareContent {
    if (options.from === 'button') return this._getShareContent();
    return {
      title: '发现校园里的新鲜事',
      imageUrl: 'https://cos.jualn.cn/share/index-share.jpg',
      path: '/pages/index/index',
    };
  },

  async _loadUserProfile(userId: string, scene: 'initial' | 'refresh' = 'initial') {
    if (scene === 'initial') {
      this._listLoadBeginInitial();
    } else {
      this._listLoadBeginRefresh();
    }

    try {
      const result = await userAction.getUserPageData(userId, { force: scene === 'refresh' });

      const patch: Record<string, unknown> = {
        userInfo: result.userInfo,
        postsCache: result.posts,
      };

      // if (typeof (result as { isFollowing?: boolean }).isFollowing === 'boolean') {
      //   patch.isFollowing = (result as { isFollowing: boolean }).isFollowing;
      // }

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
      log.error('_loadUserProfile', '加载用户主页失败', err);

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
      const userId = this.data.userInfo.id ?? this._userId;
      if (!userId) throw new Error('missing user id');

      const result = await postAction.getUserLikedPosts(userId);

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
      log.error('_loadLikes', '加载用户点赞的帖子失败', err);

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
  notifyPreviewImage() {
    this._isPreviewingImage = true;
  },

  // user-profile 绑定的发布活动事件

  /**
   * user-profile -> bind:back 事件回调，返回上一页
   */
  onBack() {
    navigateBackOrHome();
  },
  /**
   * user-profile -> bind:more 事件回调，打开更多操作弹窗
   * detail 需要传递 action，action 用于确定用户选择的操作（如查看消息、举报、拉黑等）
   * @param e 事件对象，包含 detail.action 用于确定用户选择的操作
   */
  onMore(e: WechatMiniprogram.CustomEvent<{ action: number; userId: string }>) {
    const { action, userId } = e.detail;
    if (action === 0) {
      this._openPopup({
        popupType: 'report',
        reportTargetType: TARGET_TYPES.USER.value,
        reportTargetId: userId,
      });
    }
  },
  /**
   * user-profile -> bind:switchTab 事件回调，切换 Tab
   * detail 需要传递 tab，tab 用于确定当前激活的 Tab（如帖子、活动、考试等）
   * @param e 事件对象，包含 detail.tab 用于更新当前激活的 Tab
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
    if (!this._userId) return;
    void this._loadUserProfile(this._userId, 'refresh');
  },

  retryLikes() {
    void this._loadLikes({ force: true });
  },

  retryLoadMore() {
    this._listLoadResetMoreError();
    // 如果后面接分页接口，这里调用 this._loadMorePosts()
  },
});
