import defineBehavior from '../utils/defineBehavior';
import { wxHideKeyboard, wxShowActionSheet, wxShowModal, wxShowToast } from '../utils/wx-promise';
import { interactService, postService } from '../services/index';
import { TARGET_TYPES } from '../utils/constants';
import type { PostCardItem } from '../types/business';
import createLogger from '../utils/logger';
import eventBus, { EVENTS } from '../utils/event-bus';
import { postSyncStore } from '../store/postSyncStore';
import { type PostUpdatePayload } from '../events/post-event';
import { getUserInfo } from '../store/helper';

const log = createLogger('usePostActions');

export type PostActionsPopupType = '' | 'comment' | 'share' | 'report' | 'post-edit';

export type PostListKey = 'posts' | 'postsCache' | 'likesCache';

export interface PostActionsData {
  /**
   * 当前实际展示的帖子列表。
   *
   * 首页直接使用 posts；
   * 用户主页会根据当前 Tab，把 postsCache 或 likesCache 赋给 posts。
   */
  posts: PostCardItem[];

  /** 用户发布的帖子缓存，主要由 me / user 页面使用。 */
  postsCache: PostCardItem[];

  /** 用户点赞的帖子缓存，主要由 me / user 页面使用。 */
  likesCache: PostCardItem[];

  /** page-container 是否打开。 */
  showPopup: boolean;
  /** 当前展示的面板类型；post-edit 由首页发布入口使用。 */
  popupType: PostActionsPopupType;

  /** comment-panel 入参。 */
  commentTargetId: string;
  commentTargetType: string;
  commentTotalCount: number;

  /** share-panel 入参。 */
  currentShareImage: string;
  currentSharePath: string;

  /** report-panel 入参。 */
  reportTargetType: string;
  reportTargetId: string;

  /**
   * 举报是否从评论面板进入。
   * 值为 comment 时，关闭举报面板后返回评论面板，而不是关闭整个 page-container。
   */
  previousPopupType: '' | 'comment';
}

interface PostActionsPrivate {
  /**
   * 当前页面注册的事件取消函数。
   *
   * eventBus.on 返回取消订阅函数，统一存入该数组，
   * 页面销毁时依次执行，避免遗漏某个监听器。
   */
  _behaviorDisposers: (() => void)[];

  /** 当前页面生命周期内已经上报过浏览的帖子，避免重复计数。 */
  _postActionsViewedPostIds: Set<string>;

  /** 独立记录弹窗状态，避免 leave / close 重复触发宿主回调。用于判断 page-container 是否已经处于打开状态。 */
  _postActionsPopupVisible: boolean;
}

/**
 * 只用于需要通过 this 访问宿主页面成员的配置回调。
 *
 * Behavior 注入的 data 和私有字段需要显式加入实例类型。
 * TExtraThis 用于补充宿主页面自己的字段或方法，例如
 * 首页和 me 页提供的 _setTabBarHidden。
 *
 * 没有配置回调访问 this 时，不需要传入 TExtraThis。
 */
export type PostActionsThis<TExtraThis extends object = object> =
  WechatMiniprogram.Behavior.TrivialInstance &
    PostActionsPrivate &
    TExtraThis & {
      data: PostActionsData;
    };

export interface UsePostActionsOptions<TExtraThis extends object = object> {
  /**
   * 帖子状态发生变化时，需要同步更新的列表。
   *
   * 首页：
   * ['posts']
   *
   * me / user：
   * ['posts', 'postsCache', 'likesCache']
   */
  postListKeys?: readonly PostListKey[];

  /**
   * page-container 从关闭变为打开，或从打开变为关闭时触发。
   *
   * 适合由宿主页面处理 TabBar、页面头部等与帖子操作无关的 UI。
   * 面板之间切换（例如 comment -> report）不会重复触发。
   */
  onPopupVisibleChange?: (this: PostActionsThis<TExtraThis>, visible: boolean) => void;
}

function toSafeCount(value: number | undefined): number {
  return Math.max(0, typeof value === 'number' ? value : 0);
}

/**
 * 将 postSyncStore 中的增量状态合并进服务端返回的帖子列表。
 *
 * 这是纯函数，页面加载数据时也可以直接调用，避免必须依赖 Behavior 注入方法
 * 才能完成首屏数据整理。
 */
export function mergePostSyncCache(list: PostCardItem[]) {
  let changed = false;

  const merged = list.map((post) => {
    const cached = postSyncStore.get(post.id);
    if (!cached) return post;

    const nextIsLiked = typeof cached.isLiked === 'boolean' ? cached.isLiked : post.isLiked;
    const nextLikeCount =
      typeof cached.likeCount === 'number' ? Math.max(0, cached.likeCount) : post.likeCount;
    const nextCommentCount =
      typeof cached.commentCount === 'number'
        ? Math.max(0, cached.commentCount)
        : post.commentCount;
    const nextViewCount =
      typeof cached.viewCount === 'number' ? Math.max(0, cached.viewCount) : post.viewCount;

    const hasDiff =
      nextIsLiked !== post.isLiked ||
      nextLikeCount !== post.likeCount ||
      nextCommentCount !== post.commentCount ||
      nextViewCount !== post.viewCount;

    if (!hasDiff) return post;

    changed = true;
    return {
      ...post,
      isLiked: nextIsLiked,
      likeCount: nextLikeCount,
      commentCount: nextCommentCount,
      viewCount: nextViewCount,
    };
  });

  return { merged, changed };
}

/**
 * 使用帖子操作行为
 * 包括浏览记录、点赞、删除等操作的本地状态更新和事件同步。
 * 适合帖子列表页和用户主页使用，首页和用户主页的帖子状态同步需求类似，且都需要记录浏览。
 *
 * 使用的页面不需要再注册的事件包括：
 * - POSTS_UPDATED：帖子局部更新，包含点赞、评论数、浏览数等变更，页面内所有列表同步。
 * - POST_DELETED：帖子删除，页面内所有列表同步。
 *
 * @param options
 * @returns
 */
export function usePostActions<TExtraThis extends object = object>(
  options: UsePostActionsOptions<TExtraThis> = {},
) {
  const { postListKeys: configuredPostListKeys = ['posts'], onPopupVisibleChange } = options;

  // 去重，避免同一个列表被重复生成 setData patch。
  const postListKeys = [...new Set(configuredPostListKeys)];

  return defineBehavior<PostActionsPrivate>()({
    data: {
      posts: [] as PostCardItem[],
      postsCache: [] as PostCardItem[],
      likesCache: [] as PostCardItem[],

      showPopup: false,
      popupType: '' as PostActionsPopupType,

      commentTargetId: '',
      commentTargetType: TARGET_TYPES.POST.value,
      commentTotalCount: 0,

      // share-panel 传递的数据
      currentShareImage: '',
      currentSharePath: '',

      // report-panel 传递的数据
      reportTargetType: '',
      reportTargetId: '',
      previousPopupType: '' as PostActionsData['previousPopupType'],
      // 用于举报来源追踪，记录用户是从哪个页面/入口进入的举报流程，避免直接关闭举报弹窗而是返回comment-panel
      reportSourceType: '',
      reportParentId: '',
    },

    lifetimes: {
      attached() {
        // 私有属性初始化, 私有字段未初始化会导致页面重新进入时状态异常，例如已经上报过浏览的帖子再次上报，或弹窗状态丢失。
        this._behaviorDisposers = [];
        this._postActionsViewedPostIds = new Set<string>();
        this._postActionsPopupVisible = this.data.showPopup;

        this._behaviorDisposers.push(
          eventBus.on(EVENTS.POST_UPDATED, (payload) => {
            if (!payload.id) return;
            this._applyPostPatch(payload);
          }),

          eventBus.on(EVENTS.POST_DELETED, (postId) => {
            if (!postId) return;
            this._removePostFromLists(postId);
          }),
        );
      },

      detached() {
        this._behaviorDisposers.forEach((off) => {
          off();
        });

        // 清理私有属性，避免页面重新进入时状态异常
        this._behaviorDisposers = [];
        this._postActionsViewedPostIds.clear();
        this._postActionsPopupVisible = false;
      },
    },

    methods: {
      /**
       * 合并帖子本地同步缓存。
       *
       * 用于 posts / likes 两类列表，保证点赞、评论数、浏览数在切 tab、刷新、返回页面时保持一致。
       * 保留为 Behavior 方法，兼容页面中已有的 this._applyPostSyncCache 调用。
       * 新代码也可以直接使用导出的 mergePostSyncCache 纯函数。
       */
      _applyPostSyncCache(list: PostCardItem[]) {
        return mergePostSyncCache(list);
      },

      /**
       * 将同步缓存重新合并到当前页面配置的所有帖子列表。
       * 适合页面 onShow 时调用。
       */
      _syncPostsFromCache() {
        const patch: Record<string, unknown> = {};

        postListKeys.forEach((listKey) => {
          const list = this.data[listKey];
          if (!Array.isArray(list) || list.length === 0) return;

          const { merged, changed } = mergePostSyncCache(list);
          if (changed) patch[listKey] = merged;
        });

        if (Object.keys(patch).length > 0) {
          this.setData(patch);
        }
      },

      /**
       * 把帖子增量同步到当前页面持有的全部列表。
       *
       * me / user 页面同时维护 posts、postsCache、likesCache；
       * 首页只维护 posts。由 postListKeys 决定需要更新哪些列表。
       */
      _applyPostPatch(payload: PostUpdatePayload) {
        if (!payload.id) return;

        const patch: Record<string, unknown> = {};

        postListKeys.forEach((listKey) => {
          const list = this.data[listKey];
          if (!Array.isArray(list)) return;

          const idx = list.findIndex((item) => item.id === payload.id);
          if (idx === -1) return;

          if (typeof payload.isLiked === 'boolean') {
            patch[`${listKey}[${String(idx)}].isLiked`] = payload.isLiked;
          }
          if (typeof payload.likeCount === 'number') {
            patch[`${listKey}[${String(idx)}].likeCount`] = Math.max(0, payload.likeCount);
          }
          if (typeof payload.commentCount === 'number') {
            patch[`${listKey}[${String(idx)}].commentCount`] = Math.max(0, payload.commentCount);
          }
          if (typeof payload.viewCount === 'number') {
            patch[`${listKey}[${String(idx)}].viewCount`] = Math.max(0, payload.viewCount);
          }
        });

        if (Object.keys(patch).length > 0) {
          this.setData(patch);
        }
      },

      _removePostFromLists(postId: string) {
        if (!postId) return;

        const patch: Record<string, unknown> = {};

        postListKeys.forEach((listKey) => {
          const list = this.data[listKey];
          if (!Array.isArray(list)) return;

          const nextList = list.filter((item) => item.id !== postId);
          if (nextList.length !== list.length) {
            patch[listKey] = nextList;
          }
        });

        if (Object.keys(patch).length > 0) {
          this.setData(patch);
        }
      },

      /**
       * 记录帖子浏览，避免重复上报。
       * 包括用户主动点击帖子进入详情，或在帖子卡片上触发的 view 事件（例如曝光后自动上报）。
       *
       * 上报成功后会触发 post-updated 事件，更新浏览数。
       * 上报失败不回滚 UI，避免列表数字来回跳动。
       *
       * @param postId 帖子 ID
       * @returns Promise<void>
       */
      _recordPostView(postId: string) {
        if (!postId || this._postActionsViewedPostIds.has(postId)) return;

        this._postActionsViewedPostIds.add(postId);
        this._bumpPostViewCount(postId);

        interactService
          .reportView({
            targetType: TARGET_TYPES.POST.value,
            targetId: postId,
          })
          .catch((err: unknown) => {
            // 浏览数采用乐观更新：上报失败不回滚 UI，避免列表数字来回跳动。
            log.warn('_recordPostView', '上报浏览失败', err);
          });
      },

      /**
       * 浏览数 +1 的本地增量更新。
       *
       * @param postId 帖子 ID
       */
      _bumpPostViewCount(postId: string) {
        const cached = postSyncStore.get(postId);

        let currentCount: number | undefined;

        for (const listKey of postListKeys) {
          const list = this.data[listKey];
          if (!Array.isArray(list)) continue;

          const post = list.find((item) => item.id === postId);
          if (post) {
            currentCount = post.viewCount ? post.viewCount : 0;
            break;
          }
        }

        const baseCount =
          currentCount ??
          (typeof cached?.viewCount === 'number' ? Math.max(0, cached.viewCount) : 0);
        const nextCount = Math.max(0, baseCount + 1);

        this._applyPostPatch({
          id: postId,
          viewCount: nextCount,
        });

        postSyncStore.set({
          id: postId,
          viewCount: nextCount,
        });

        eventBus.emit(EVENTS.POST_UPDATED, {
          id: postId,
          viewCount: nextCount,
        });
      },

      async _deletePostFromCard(postId: string) {
        if (!postId) return;

        const confirmed = await wxShowModal({
          title: '确认删除',
          content: '删除后无法恢复，确定要删除吗？',
          confirmColor: '#e02020',
        })
          .catch()
          .then((res) => res.confirm);

        if (!confirmed) return;

        try {
          await postService.deletePost(postId);

          const patch: Record<string, unknown> = {};

          postListKeys.forEach((listKey) => {
            const list = this.data[listKey];
            if (!Array.isArray(list)) return;

            const nextList = list.filter((item) => item.id !== postId);
            if (nextList.length !== list.length) {
              patch[listKey] = nextList;
            }
          });

          if (Object.keys(patch).length > 0) {
            this.setData(patch);
          }

          void wxShowToast({
            title: '已删除',
            icon: 'success',
          });
        } catch (err) {
          log.error('_deletePostFromCard', '删除帖子失败', err);

          void wxShowToast({
            title: '删除失败，请稍后再试',
            icon: 'none',
          });
        }
      },

      /**
       * 统一打开 page-container。
       * 宿主 UI 回调只在“关闭 -> 打开”时执行，面板内部切换不会重复执行。
       */
      _openPopup(patch: Record<string, unknown>) {
        if (!this._postActionsPopupVisible) {
          this._postActionsPopupVisible = true;
          onPopupVisibleChange?.call(this as unknown as PostActionsThis<TExtraThis>, true);
        }

        this.setData({
          ...patch,
          showPopup: true,
        });
      },

      /**
       * 关闭 page-container。
       *
       * 默认保留 popupType，等 page-container 的 leave 事件结束后再清空，
       * 避免离场过程中提前卸载当前面板。
       */
      _closePopup(resetType = false) {
        const patch: Record<string, unknown> = {
          showPopup: false,
        };

        if (resetType) patch.popupType = '';

        this.setData(patch);

        if (this._postActionsPopupVisible) {
          this._postActionsPopupVisible = false;
          onPopupVisibleChange?.call(this as unknown as PostActionsThis<TExtraThis>, false);
        }
      },

      /**
       * page-container -> bind:leave
       * 离场完成后统一清理面板参数，避免下一次打开复用旧状态。
       */
      onPopupLeave() {
        this.setData({
          showPopup: false,
          popupType: '',

          commentTargetId: '',
          commentTargetType: TARGET_TYPES.POST.value,
          commentTotalCount: 0,

          currentShareImage: '',
          currentSharePath: '',

          reportTargetType: '',
          reportTargetId: '',
          previousPopupType: '',
        });

        // 兜底处理外部直接改变 showPopup、未经过 _closePopup 的情况。
        if (this._postActionsPopupVisible) {
          this._postActionsPopupVisible = false;
          onPopupVisibleChange?.call(this as unknown as PostActionsThis<TExtraThis>, false);
        }
      },

      /**
       * post-card -> bind:comment
       * * 打开指定帖子的评论面板。
       *
       * 父页面只负责传入 targetId / targetType / 初始评论数；
       * 评论列表、回复列表、发送、删除等交互由 comment-panel 内部处理。
       * @param e 事件对象，包含 detail.postId 和 detail.commentCount
       */
      onOpenComment(
        e: WechatMiniprogram.CustomEvent<{
          postId: string;
          commentCount: number;
        }>,
      ) {
        const { postId, commentCount } = e.detail;
        if (!postId) return;

        this._recordPostView(postId);
        void wxHideKeyboard();

        this._openPopup({
          popupType: 'comment',
          commentTargetId: postId,
          commentTargetType: TARGET_TYPES.POST.value,
          commentTotalCount: toSafeCount(commentCount),
          previousPopupType: '',
        });
      },

      /**
       * post-card -> bind:view
       *
       *  detail 需要传递 postId 用于记录浏览
       * @param e 事件对象，包含 detail.postId
       */
      onPostView(e: WechatMiniprogram.CustomEvent<{ postId: string }>) {
        this._recordPostView(e.detail.postId);
      },

      /**
       * post-card -> bind:share
       *
       * detail 需要传递 sharePath 和 shareImage，sharePath 用于设置分享路径，shareImage 用于设置分享图片
       * @param e 事件对象，包含 detail.sharePath 和 detail.shareImage
       */
      onOpenShare(
        e: WechatMiniprogram.CustomEvent<{
          sharePath: string;
          shareImage: string;
          shareTitle?: string;
          targetId?: string;
        }>,
      ) {
        const { sharePath, shareImage } = e.detail;

        this._openPopup({
          popupType: 'share',
          currentSharePath: sharePath || '',
          currentShareImage: shareImage || '',
          previousPopupType: '',
        });
      },

      /**
       * post-card -> bind:shareImageReady
       *
       * detail 需要传递 shareImage，用于更新分享图片地址
       * @param e 事件对象，包含 detail.shareImage
       */
      onShareImageReady(
        e: WechatMiniprogram.CustomEvent<{
          shareImage: string;
        }>,
      ) {
        this.setData({
          currentShareImage: e.detail.shareImage || '',
        });
      },

      /**
       * post-card -> bind:more
       *
       * detail 需要传递 targetType 和 targetId，targetType 用于确定举报的目标类型（如帖子、评论等），targetId 用于确定举报的目标ID
       * @param e 事件对象，包含 detail.targetType 和 detail.targetId，用于确定举报的目标类型和目标ID
       */
      async onPostCardMore(
        e: WechatMiniprogram.CustomEvent<{
          post?: PostCardItem;
          targetType?: string | number;
          targetId?: string;
        }>,
      ) {
        const { post, targetType, targetId } = e.detail;

        const postId = post?.id ?? targetId;
        if (!postId) return;

        const currentUserId = getUserInfo('id');
        const isOwner = !!post?.userId && post.userId === currentUserId;

        const itemList = isOwner ? ['删除'] : ['举报'];

        const res = await wxShowActionSheet({ itemList })
          .catch(() => null)
          .then((result) => result ?? { tapIndex: -1 });

        if (res.tapIndex === -1) return;

        if (isOwner) {
          await this._deletePostFromCard(postId);
          return;
        }

        this._openPopup({
          popupType: 'report',
          reportTargetType: String(targetType ?? TARGET_TYPES.POST.value),
          reportTargetId: postId,
          previousPopupType: '',
        });
      },

      /**
       * comment-panel -> bind:close
       *
       * 关闭评论面板，回到帖子列表。评论面板内的返回按钮和页面右上角的关闭按钮都可以触发该事件。
       */
      onCommentClose() {
        this._closePopup();
      },

      /**
       * comment-panel -> bind:countchange
       * 评论总数变化时触发。
       *
       * 这里只处理父页面关心的展示同步：
       * 1. 更新当前 comment-panel 的 total-count 入参；
       * 2. 更新 posts / postsCache / likesCache 中对应帖子的 commentCount；
       * 3. 写入 postSyncStore，保证返回列表或重新加载时仍能拿到最新值；
       * 4. 通过 eventBus 通知其他已打开页面同步该帖子数据。
       */
      onCommentCountChange(
        e: WechatMiniprogram.CustomEvent<{
          count: number;
          delta?: number;
          targetId?: string;
          targetType?: string | number;
        }>,
      ) {
        const targetPostId = e.detail.targetId ?? this.data.commentTargetId;
        if (!targetPostId) return;

        const safeCount = toSafeCount(e.detail.count);

        this.setData({
          commentTotalCount: safeCount,
        });

        this._applyPostPatch({
          id: targetPostId,
          commentCount: safeCount,
        });

        postSyncStore.set({
          id: targetPostId,
          commentCount: safeCount,
        });

        eventBus.emit(EVENTS.POST_UPDATED, {
          id: targetPostId,
          commentCount: safeCount,
        });
      },

      /**
       * comment-panel -> bind:report
       *
       * 这里不销毁 comment-panel，只切换当前 page-container 内展示的面板类型。
       * 如果希望举报关闭后回到评论区，可以记录 previousPopupType = 'comment'。
       */
      onCommentReport(
        e: WechatMiniprogram.CustomEvent<{
          targetType: string;
          targetId: string;
          sourceType: 'comment' | 'reply';
          parentId?: string;
        }>,
      ) {
        const { targetType, targetId, sourceType, parentId = '' } = e.detail;
        if (!targetId) return;

        this._openPopup({
          previousPopupType: 'comment',
          popupType: 'report',
          reportTargetType: targetType,
          reportTargetId: targetId,

          reportSourceType: sourceType,
          reportParentId: parentId,
        });
      },

      /**
       * report-panel -> bind:close
       * 关闭举报面板。
       *
       * 如果举报来自评论区，则回到评论区；
       * 否则关闭整个 page-container。
       */
      onCloseReport() {
        if (this.data.previousPopupType === 'comment') {
          this.setData({
            popupType: 'comment',
            previousPopupType: '',
            reportTargetType: '',
            reportTargetId: '',

            reportSourceType: '',
            reportParentId: '',
            showPopup: true,
          });
          return;
        }

        this._closePopup(true);
      },

      /**
       * share-panel -> bind:close
       */
      onShareClose() {
        this._closePopup();
      },
    },
  });
}
