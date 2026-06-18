import { wxPageScrollTo, wxShowToast } from '../../utils/wx-promise';
import { postService, userService } from '../../services/index';
import type { PostCardItem, UserProfileInfo } from '../../types/business';
import { getCustomTabBar } from '../../utils/tabbar';
import { scrollStore } from '../../store/scrollStore';
import createLogger from '../../utils/logger';
import eventBus, { EVENTS } from '../../utils/event-bus';
import { TARGET_TYPES } from '../../utils/constants';
import { usePostActions } from '../../behaviors/usePostActions';
import { useListLoad } from '../../behaviors/useListLoad';

const log = createLogger('MePage');

interface MePageExtraThis {
  _setTabBarHidden: (hidden: boolean) => void;
}

Page({
  _currentScrollTop: 0,
  /** 存储当前是否正在预览图片 */
  _isPreviewingImage: false,
  _pullDownRefreshEnabled: false,
  // _postCreatedHandler: null as ((...args: unknown[]) => void) | null,
  // _postUpdateHandler: null as ((...args: unknown[]) => void) | null,
  // _viewedPostIds: new Set<string>(),
  _tabBarHidden: false,
  _disposers: [] as (() => void)[],

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
    }),
  ],
  data: {
    // 骨架屏相关
    likesLoading: false,
    likesError: false,

    statusBarHeight: 20,
    activeTab: 'posts',

    userInfo: {} as UserProfileInfo,
    // posts: [] as PostCardItem[],
    // postsCache: [] as PostCardItem[],
    // likesCache: [] as PostCardItem[],
    likesLoaded: false,

    targetType: TARGET_TYPES.POST.value, // 默认目标类型为 post

    // page-container popup相关
    // showPopup: false,
    // /** 弹窗类型 'comment' | 'share' | 'report' | 'post-edit' */
    // popupType: '',

    // // comment-panel 传递的数据
    // commentTargetId: '',
    // commentTargetType: TARGET_TYPES.POST.value,
    // commentTotalCount: 0,

    // // share-panel 传递的数据
    // currentShareImage: '',
    // currentSharePath: '',

    // // report-panel 传递的数据
    // reportTargetType: 0,
    // reportTargetId: '',
    // // 用于举报来源追踪，记录用户是从哪个页面/入口进入的举报流程，避免直接关闭举报弹窗而是返回comment-panel
    // reportSourceType: '',
    // reportParentId: '',
    // previousPopupType: '',
  },

  onLoad() {
    this._currentScrollTop = 0;

    this._disposers.push(
      eventBus.on(EVENTS.POST_CREATED, (post) => {
        if (!post.id) return;
        this._prependPost(post);
      }),
    );

    // if (!this._postUpdateHandler) {
    //   this._postUpdateHandler = (...args: unknown[]) => {
    //     const payload = args[0] as {
    //       id?: string;
    //       isLiked?: boolean;
    //       likeCount?: number;
    //       commentCount?: number;
    //       viewCount?: number;
    //     };
    //     if (!payload.id) return;
    //     this._applyPostPatch(payload);
    //   };
    //   eventBus.on(EVENTS.POST_UPDATED, this._postUpdateHandler);
    // }

    const systemInfo = wx.getWindowInfo();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight,
    });
    void this._loadProfileAndPosts('initial');
  },

  onShow() {
    // 初始化tabbar，确保在onLoad时就能获取到实例并调用方法
    if (typeof this.getTabBar === 'function') {
      getCustomTabBar(this).init();
    }

    // 恢复滚动位置
    this._restoreScrollPosition();
  },

  onUnload() {
    this._disposers.forEach((off) => {
      off();
    });
    this._disposers = [];

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

  // /** 打开弹窗，确保 TabBar的状态是隐藏 */
  // _openPopup(patch: Record<string, unknown>) {
  //   this._setTabBarHidden(true);
  //   this.setData({
  //     ...patch,
  //     showPopup: true,
  //   });
  // },

  // /**
  //  * 关闭当前弹窗。
  //  * 统一恢复 TabBar，并按需清空 popupType，避免下次打开旧组件状态残留。
  //  */
  // _closePopup(resetType = false) {
  //   const patch: Record<string, unknown> = {
  //     showPopup: false,
  //   };

  //   if (resetType) patch.popupType = '';

  //   // 保持原本隐藏状态，如果之前是显示的则恢复显示
  //   this._setTabBarHidden(false);
  //   this.setData(patch);
  // },

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
      const result = await userService.getMePageData();
      const { merged } = this._applyPostSyncCache(result.posts);

      const patch: Record<string, unknown> = {
        userInfo: result.userInfo,
        postsCache: merged,
      };

      // 只有当前在 posts tab 才把结果渲染到列表，避免覆盖其他 tab 的数据
      if (this.data.activeTab === 'posts') {
        patch.posts = merged;
      }

      this.setData(patch);

      const maybeHasMore = (result as { hasMore?: boolean }).hasMore;
      const hasMore = typeof maybeHasMore === 'boolean' ? maybeHasMore : false;
      const hasContent = !!result.userInfo.id || merged.length > 0;

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

        void wxShowToast({
          title: '刷新失败，请稍后再试',
          icon: 'none',
        });
      }
    }
  },

  /**
   * 合并帖子本地同步缓存。
   *
   * 用于 posts / likes 两类列表，保证点赞、评论数、浏览数在切 tab、刷新、返回页面时保持一致。
   */
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

  // _applyPostPatch(payload: {
  //   id?: string;
  //   isLiked?: boolean;
  //   likeCount?: number;
  //   commentCount?: number;
  //   viewCount?: number;
  // }) {
  //   if (!payload.id) return;
  //   const patch: Record<string, unknown> = {};

  //   const applyToList = (listKey: 'posts' | 'postsCache' | 'likesCache', list: PostCardItem[]) => {
  //     const idx = list.findIndex((item) => item.id === payload.id);
  //     if (idx === -1) return;

  //     if (typeof payload.isLiked === 'boolean') {
  //       patch[`${listKey}[${String(idx)}].isLiked`] = payload.isLiked;
  //     }
  //     if (typeof payload.likeCount === 'number') {
  //       patch[`${listKey}[${String(idx)}].likeCount`] = Math.max(0, payload.likeCount);
  //     }
  //     if (typeof payload.commentCount === 'number') {
  //       patch[`${listKey}[${String(idx)}].commentCount`] = Math.max(0, payload.commentCount);
  //     }
  //     if (typeof payload.viewCount === 'number') {
  //       patch[`${listKey}[${String(idx)}].viewCount`] = Math.max(0, payload.viewCount);
  //     }
  //   };

  //   applyToList('posts', this.data.posts);
  //   applyToList('postsCache', this.data.postsCache);
  //   applyToList('likesCache', this.data.likesCache);

  //   if (Object.keys(patch).length > 0) {
  //     this.setData(patch);
  //   }
  // },

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
  //   const cached = postSyncStore.get(postId);
  //   const list = this.data.postsCache;
  //   const idx = list.findIndex((item) => item.id === postId);
  //   const baseCount =
  //     idx !== -1
  //       ? (list[idx]?.viewCount ?? 0)
  //       : typeof cached?.viewCount === 'number'
  //         ? cached.viewCount
  //         : 0;
  //   const nextCount = Math.max(0, baseCount + 1);

  //   this._applyPostPatch({ id: postId, viewCount: nextCount });
  //   postSyncStore.set({ id: postId, viewCount: nextCount });
  //   eventBus.emit(POST_UPDATED_EVENT, { id: postId, viewCount: nextCount });
  // },

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

      const result = await postService.getUserLikedPosts(userId);
      const { merged } = this._applyPostSyncCache(result.list);

      const patch: Record<string, unknown> = {
        likesCache: merged,
        likesLoaded: true,
        likesError: false,
      };

      if (this.data.activeTab === 'likes') {
        patch.posts = merged;
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

      void wxShowToast({
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
    void this._loadProfileAndPosts('initial');
  },

  retryLikes() {
    void this._loadLikes({ force: true });
  },

  retryLoadMore() {
    this._listLoadResetMoreError();
    // 如果后面接分页接口，这里调用 this._loadMorePosts()
  },

  // // 触发 page-container 弹窗事件

  // /**
  //  * page-container -> bind:leave 事件回调，关闭所有弹窗,
  //  * 兜底关闭弹窗状态，避免 popupType 残留导致下次打开复用旧组件实例。
  //  */
  // onPopupLeave() {
  //   this.setData({
  //     showPopup: false,
  //     popupType: '',
  //     previousPopupType: '',
  //     reportTargetType: 0,
  //     reportTargetId: '',
  //     reportSourceType: '',
  //     reportParentId: '',
  //   });

  //   this._setTabBarHidden(false);
  //   // this._closePopup(true);
  //   // this.setData({
  //   //   showPopup: false,
  //   //   popupType: '',
  //   // });
  // },

  // // post-card 绑定的发布活动事件

  // /**
  //  * post-card -> bind:comment
  //  * 打开指定帖子的评论面板。
  //  *
  //  * 父页面只负责传入 targetId / targetType / 初始评论数；
  //  * 评论列表、回复列表、发送、删除等交互由 comment-panel 内部处理。
  //  * @param e 事件对象，包含 detail.postId 和 detail.commentCount
  //  */
  // onOpenComment(e: WechatMiniprogram.CustomEvent<{ postId: string; commentCount: number }>) {
  //   const { postId, commentCount } = e.detail;
  //   if (!postId) return;

  //   this._recordPostView(postId);
  //   void wxHideKeyboard();

  //   this._openPopup({
  //     popupType: 'comment',
  //     commentTargetId: postId,
  //     commentTargetType: TARGET_TYPES.POST.value,
  //     commentTotalCount: Math.max(0, commentCount || 0),
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
  // onOpenShare(
  //   e: WechatMiniprogram.CustomEvent<{
  //     sharePath: string;
  //     shareImage: string;
  //     shareTitle?: string;
  //     targetId?: string;
  //   }>,
  // ) {
  //   const { sharePath, shareImage } = e.detail;
  //   this._openPopup({
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
  //  * 用户关闭评论面板时触发。
  //  */
  // onCommentClose() {
  //   this._closePopup(true);
  // },
  // /**
  //  * comment-panel -> bind:countChange
  //  * 评论总数变化时触发。
  //  *
  //  * 这里只处理父页面关心的展示同步：
  //  * 1. 更新当前 comment-panel 的 total-count 入参；
  //  * 2. 更新 posts / postsCache / likesCache 中对应帖子的 commentCount；
  //  * 3. 写入 postSyncStore，保证返回列表或重新加载时仍能拿到最新值；
  //  * 4. 通过 eventBus 通知其他已打开页面同步该帖子数据。
  //  * @param e 事件对象，包含 detail.count，用于更新当前文章的评论数量
  //  */
  // onCommentCountChange(
  //   e: WechatMiniprogram.CustomEvent<{
  //     count: number;
  //     delta?: number;
  //     targetId?: string;
  //     targetType?: string;
  //   }>,
  // ) {
  //   const { count, targetId } = e.detail;

  //   const targetPostId = (targetId ?? this.data.commentTargetId) || '';
  //   if (!targetPostId) return;

  //   const safeCount = Math.max(0, count || 0);

  //   this.setData({
  //     commentTotalCount: safeCount,
  //   });

  //   this._applyPostPatch({
  //     id: targetPostId,
  //     commentCount: safeCount,
  //   });

  //   postSyncStore.set({
  //     id: targetPostId,
  //     commentCount: safeCount,
  //   });

  //   eventBus.emit(EVENTS.POST_UPDATED, {
  //     id: targetPostId,
  //     commentCount: safeCount,
  //   });
  // },
  // /**
  //  * comment-panel -> bind:report
  //  * 从评论区发起举报。
  //  *
  //  * 这里不销毁 comment-panel，只切换当前 page-container 内展示的面板类型。
  //  * 如果希望举报关闭后回到评论区，可以记录 previousPopupType = 'comment'。
  //  */
  // onCommentReport(
  //   e: WechatMiniprogram.CustomEvent<{
  //     targetType: number;
  //     targetId: string;
  //     sourceType: 'comment' | 'reply';
  //     parentId?: string;
  //   }>,
  // ) {
  //   const { targetType, targetId, sourceType, parentId = '' } = e.detail;

  //   if (!targetId) return;

  //   this._openPopup({
  //     previousPopupType: 'comment',
  //     popupType: 'report',
  //     reportTargetType: targetType,
  //     reportTargetId: targetId,
  //     reportSourceType: sourceType,
  //     reportParentId: parentId,
  //   });
  // },

  // // share-panel 组件绑定的事件回调

  // /**
  //  * share-panel -> bind:close 事件回调，关闭分享弹窗
  //  */
  // onShareClose() {
  //   this._closePopup();
  // },

  // // report-panel 组件绑定的事件回调

  // /**
  //  * report-panel -> bind:close
  //  * 关闭举报面板。
  //  *
  //  * 如果举报来自评论区，则回到评论区；
  //  * 否则关闭整个 page-container。
  //  */
  // onCloseReport() {
  //   if (this.data.previousPopupType === 'comment') {
  //     this.setData({
  //       popupType: 'comment',
  //       previousPopupType: '',
  //       reportTargetType: 0,
  //       reportTargetId: '',
  //       reportSourceType: '',
  //       reportParentId: '',
  //       showPopup: true,
  //     });
  //     return;
  //   }

  //   this._closePopup(true);
  // },
});
