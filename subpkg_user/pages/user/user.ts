// pages/user/index.ts
import { wxGetWindowInfo } from '../../../utils/wx-promise';
import type { UserProfileInfo } from '../../../types/business';
import { createLogger } from '../../../utils/logger';
import { TARGET_TYPES } from '../../../utils/constants';
import { usePostActions } from '../../../behaviors/usePostActions';
import { useListLoad } from '../../../behaviors/useListLoad';
import * as userAction from '../../../actions/user';
import { getProfileErrorMessage } from '../../../services/user';
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
  _loadGeneration: 0,
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
    profileError: '',
    postsError: '',
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
    let userId = '';
    try {
      userId = decodeURIComponent(query.userId || '');
    } catch {
      // Malformed route input follows the same missing-user recovery path.
    }
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

    if (!userId) {
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

    this._userId = userId;
    this._offProfile = watchCurrentProfile((profile) => {
      if (profile?.userId === this._userId) this.setData({ userInfo: profile });
    });
    void this._loadUserProfile(userId, 'initial');

    // if (query.userId === getUserInfo('id')) {
    //   void wxSwitchTab({
    //     url: '/pages/me/me',
    //   });
    // }
  },

  onUnload() {
    this._loadGeneration++;
    this._offProfile?.();
    if (this._navigateBackTimer !== null) {
      clearTimeout(this._navigateBackTimer);
      this._navigateBackTimer = null;
    }
  },

  async onPullDownRefresh() {
    if (!this._userId || !this._listLoadCanRefresh()) {
      void wx.stopPullDownRefresh();
      return;
    }
    try {
      await this._loadUserProfile(this._userId, 'refresh');
    } finally {
      void wx.stopPullDownRefresh();
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
    const generation = ++this._loadGeneration;
    if (scene === 'initial') {
      this._listLoadBeginInitial();
    } else {
      this._listLoadBeginRefresh();
    }

    try {
      const result = await userAction.getUserPageData(userId, { force: scene === 'refresh' });

      if (generation !== this._loadGeneration) return;
      const patch: Record<string, unknown> = {
        userInfo: result.userInfo,
        profileError: '',
        postsCache: result.posts,
        postsError: result.postsError ?? '',
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
      const hasContent = !!result.userInfo.userId || result.posts.length > 0;

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
      if (generation !== this._loadGeneration) return;
      this.setData({ profileError: getProfileErrorMessage(err) });
      log.error('_loadUserProfile', '加载用户主页失败', err);

      const hasContent =
        !!this.data.userInfo.userId ||
        this.data.postsCache.length > 0 ||
        this.data.posts.length > 0;

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
    if (e.detail.tab !== 'posts') return;
    this.setData({ activeTab: 'posts', posts: this.data.postsCache });
  },

  retryInitial() {
    if (!this._userId) return;
    void this._loadUserProfile(this._userId, 'refresh');
  },

  retryLoadMore() {
    this._listLoadResetMoreError();
    // 如果后面接分页接口，这里调用 this._loadMorePosts()
  },
});
