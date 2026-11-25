import { HttpError } from '../../../utils/error';
import { community } from '../../../services/post-community';
import { getErrorMessage } from '../../../utils/notify';
import { useSharePoster } from '../../../behaviors/useSharePoster';
// subpkg_community/pages/detail/detail.ts

import { POST_CAPABILITIES } from '../../../config/post-capabilities';
import { TARGET_TYPES } from '../../../utils/constants';
import {
  wxGetWindowInfo,
  wxNavigateBack,
  wxNavigateTo,
  wxReLaunch,
  wxShowActionSheet,
  wxShowModal,
} from '../../../utils/wx-promise';
import { createLogger } from '../../../utils/logger';
import type { PostDetail } from '../../../types/business';
import { drawPostPoster } from '../../../utils/share_poster/postPoster';
import { showErrorToast } from '../../../utils/notify';
import * as postAction from '../../../actions/post';
import { useAsyncLoad } from '../../behaviors/useAsyncLoad';
import definePage from '../../../utils/definePage';
import { watchCurrentIdentity, getCurrentIdentity } from '../../../actions/current-user';
import { openUserProfile } from '../../../utils/user-profile-navigation';

const log = createLogger('PostDetailPage');

// ─────────────────────────────────────────────────────────

// 改成项目真实的首页路径。无论首页是不是 tabBar，reLaunch 都可以打开。
const HOME_PAGE_URL = '/pages/index/index';

definePage({
  behaviors: [useAsyncLoad(), useSharePoster()],

  _owner: '',
  _currentScrollTop: 0,
  _enteredFromShare: false,
  _likePending: false,
  _postGeneration: 0,
  _discussionRead: 0,
  _lastDiscussion: null as { id: string; count: number; answers?: number } | null,
  _reloadOnShow: false,
  _offIdentity: null as (() => void) | null,
  /** 浏览数上报定时器 */
  _viewTimer: 0,
  /**  */
  _viewScheduled: false,

  data: {
    communityEnabled: POST_CAPABILITIES.communityV1,
    favorited: false,
    favoriteReady: false,
    favoritePending: false,
    favoriteError: '',
    focusCommentId: '',
    targetId: '',
    targetType: TARGET_TYPES.POST.value,
    statusBarHeight: 20,
    post: {} as PostDetail,
    myAvatar: '',
    currentCommentCount: 0,
    inputFocused: false,
    inputValue: '',
    replyTarget: '',
    replyCommentId: '',
    isShareEntry: false,

    showPopup: false,
    popupType: '',
    reportTargetType: '',
    reportTargetId: '',
  },

  onLoad(query: { postId: string; from?: string; commentId?: string }) {
    this._owner = getCurrentIdentity().id;
    this._offIdentity = watchCurrentIdentity(() => {
      if (this._owner !== getCurrentIdentity().id) {
        this._owner = getCurrentIdentity().id;
        ++this._postGeneration;
        this._clearViewTimer();
        this._viewScheduled = false;
        this.setData({
          post: {} as PostDetail,
          favorited: false,
          favoriteReady: false,
          favoritePending: false,
        });
        if (this.data.targetId) this._loadPost(this.data.targetId);
        return;
      }
      this.setData({
        post: postAction.syncPostAuthor(this.data.post),
        myAvatar: getCurrentIdentity().avatarUrl,
      });
    });
    const sys = wxGetWindowInfo();
    const isShareEntry = query.from === 'share' || getCurrentPages().length <= 1;
    this._enteredFromShare = isShareEntry;

    this.setData({
      statusBarHeight: sys.statusBarHeight,
      isShareEntry,
    });

    this.setData({
      targetId: query.postId || '',
      focusCommentId: query.commentId ?? '',
    });

    this._loadPost(query.postId);
  },

  onShow() {
    // Returning from a mentor profile must re-read current server permissions.
    if (this._reloadOnShow && this.data.targetId) this._loadPost(this.data.targetId);
    this._reloadOnShow = false;
  },

  onHide() {
    this._reloadOnShow = true;
    this._clearViewTimer();
    this._viewScheduled = false;
    ++this._postGeneration;
    this.setData({ favoritePending: false, favoriteReady: false });
    if (this.data.post.postType === 'MENTOR_QA') {
      this.setData({ 'post.commentPermission': null });
    }
  },

  onUnload() {
    ++this._postGeneration;
    this._offIdentity?.();
    this._clearViewTimer();
  },

  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    return this._getShareContent();
  },

  onShareTimeline(): WechatMiniprogram.Page.ICustomTimelineContent {
    const { id } = this.data.post;
    return {
      query: `postId=${id}&from=share`,
      imageUrl: this._getShareContent().imageUrl,
    };
  },

  onShare() {
    if (!this.data.post.id) return;
    this._preparePostShare();
    this._openPopup({
      popupType: 'share',
    });
  },

  _preparePostShare() {
    if (!this.data.post.id) return;
    const post = this.data.post;

    const postData = {
      avatarUrl: post.avatar || '',
      avatarChar: post._avatarChar || '',
      avatarBg: post._avatarBg || '',
      name: post.nickname || '',
      content: post.content || '',
      images: post.images ?? [],
      time: post.createdAtText || '',
    };

    this._prepareShare({
      key: JSON.stringify([post.id, postData]),
      postId:
        post.postType === 'NORMAL' || (post.postType === 'MENTOR_QA' && POST_CAPABILITIES.mentorQa)
          ? post.id
          : undefined,
      path: `/subpkg_community/pages/detail/detail?postId=${post.id}&from=share`,
      render: (scope) => drawPostPoster(scope, postData),
    });
  },

  _loadPost(id: string, options: { preserveError?: boolean } = {}) {
    const generation = ++this._postGeneration;
    if (!id) {
      this._asyncLoadFail('帖子不存在');
      return;
    }

    if (!this.data.post.id) this._asyncLoadBegin(options);
    this.setData({ favoriteReady: false, favoritePending: false });

    postAction
      .getPostDetail(id)
      .then((res) => {
        if (generation !== this._postGeneration) return;
        if (!['NORMAL', 'MENTOR_QA'].includes(res.postType ?? ''))
          throw new HttpError(422, 'Unsupported post type', {
            userMessage: '暂不支持此帖子类型，请返回列表',
          });
        const merged = { ...res };

        const safeLikeCount = typeof merged.likeCount === 'number' ? merged.likeCount : 0;
        const safeCommentCount = typeof merged.commentCount === 'number' ? merged.commentCount : 0;
        const safeViewCount = typeof merged.viewCount === 'number' ? merged.viewCount : 0;

        merged.likeCount = Math.max(0, safeLikeCount);
        merged.commentCount = Math.max(0, safeCommentCount);
        merged.viewCount = Math.max(0, safeViewCount);

        this.setData({
          post: merged,
          myAvatar: getCurrentIdentity().avatarUrl,
          currentCommentCount: merged.commentCount,
          targetId: merged.id,
        });

        this._asyncLoadSuccess();
        this._publishDiscussionChange(merged);
        if (
          (merged.postType === 'NORMAL' ||
            (merged.postType === 'MENTOR_QA' && POST_CAPABILITIES.mentorQa)) &&
          POST_CAPABILITIES.communityV1
        )
          void this.loadFavorite();
        this._scheduleViewReport(merged.id);
        this._preparePostShare();
      })
      .catch((err: unknown) => {
        if (generation !== this._postGeneration) return;
        if (err instanceof HttpError && err.statusCode === 404) {
          this.setData({ post: {} as PostDetail, favoriteReady: false, favorited: false });
          this._asyncLoadFail('帖子已不可访问，请返回列表');
        } else if (this.data.post.id)
          showErrorToast(err, { fallback: '最新问题读取失败，草稿已保留，请重试' });
        else this._asyncLoadFail(getErrorMessage(err, '帖子加载失败，请重试'));
        log.error('_loadPost', '加载帖子失败', err);
      });
  },

  onRetryLoad() {
    this._loadPost(this.data.targetId, { preserveError: true });
  },

  _emitPostUpdate(patch: {
    id?: string;
    isLiked?: boolean;
    likeCount?: number;
    commentCount?: number;
    viewCount?: number;
  }) {
    const postId = patch.id ?? this.data.post.id;
    if (!postId) return;
    postAction.syncPostPatch({
      id: postId,
      ...(typeof patch.isLiked === 'boolean' ? { isLiked: patch.isLiked } : {}),
      ...(typeof patch.likeCount === 'number' ? { likeCount: patch.likeCount } : {}),
      ...(typeof patch.commentCount === 'number' ? { commentCount: patch.commentCount } : {}),
      ...(typeof patch.viewCount === 'number' ? { viewCount: patch.viewCount } : {}),
    });
  },

  _scheduleViewReport(postId: string) {
    if (!postId || this._viewScheduled || this._viewTimer) return;

    this._viewScheduled = true;

    this._viewTimer = setTimeout(() => {
      this._viewTimer = 0;
      this._recordDetailView(postId);
    }, 1200);
  },

  _clearViewTimer() {
    if (!this._viewTimer) return;

    clearTimeout(this._viewTimer);
    this._viewTimer = 0;
  },

  _recordDetailView(postId: string) {
    if (!postId) return;

    const currentViewCount =
      typeof this.data.post.viewCount === 'number' ? this.data.post.viewCount : 0;

    postAction.recordPostView(postId, currentViewCount, this.data.post.postType);
  },

  // comment-panel 回调：评论数变化时同步到帖子数据
  onCommentCountChange(
    e: WechatMiniprogram.CustomEvent<{
      count: number;
    }>,
  ) {
    const nextCount = e.detail.count;
    this.setData({
      'post.commentCount': nextCount,
      currentCommentCount: nextCount,
    });
    if (this._lastDiscussion?.id === this.data.post.id) this._lastDiscussion.count = nextCount;
    this._emitPostUpdate({ commentCount: nextCount });
  },

  onCommentReport(
    e: WechatMiniprogram.CustomEvent<{
      targetType: string;
      targetId: string;
      sourceType: 'comment' | 'reply';
      parentId?: string;
    }>,
  ) {
    const { targetType, targetId } = e.detail;
    if (!targetId) return;

    this._openPopup({
      popupType: 'report',
      reportTargetType: targetType,
      reportTargetId: targetId,
    });
  },

  async refreshQuestion() {
    const generation = this._postGeneration;
    const request = ++this._discussionRead;
    try {
      const post = await postAction.getPostDetail(this.data.targetId);
      if (generation !== this._postGeneration || request !== this._discussionRead) return;
      const { isLiked, likeCount, viewCount } = this.data.post;
      this.setData({
        post: { ...post, isLiked, likeCount, viewCount },
        currentCommentCount: post.commentCount,
      });
      this._publishDiscussionChange(post);
    } catch (error) {
      if (generation !== this._postGeneration || request !== this._discussionRead) return;
      if (error instanceof HttpError && error.statusCode === 404) {
        this.setData({ post: {} as PostDetail, favoriteReady: false, favorited: false });
        this._asyncLoadFail('问题已不可访问，请返回列表');
      } else showErrorToast(error, { fallback: '问题重读失败，回答草稿已保留，请重试' });
    }
  },
  _publishDiscussionChange(post: PostDetail) {
    const previous = this._lastDiscussion;
    const next = { id: post.id, count: post.commentCount, answers: post.qaSummary?.publicAnswerCount };
    this._lastDiscussion = next;
    if (
      previous?.id === next.id &&
      (previous.count !== next.count || previous.answers !== next.answers)
    )
      this._emitPostUpdate({ commentCount: next.count });
  },
  async loadFavorite() {
    if (!this.data.post.id || this.data.favoritePending) return;
    const generation = this._postGeneration,
      owner = getCurrentIdentity().id;
    this.setData({ favoriteReady: false, favoriteError: '' });
    try {
      const result = await community.favorite(this.data.targetId);
      if (generation === this._postGeneration && owner === getCurrentIdentity().id)
        this.setData({ favorited: result.favorited, favoriteReady: true });
    } catch (error) {
      if (generation === this._postGeneration)
        this.setData({ favoriteError: getErrorMessage(error, '收藏状态查询失败') });
    }
  },
  async toggleFavorite() {
    if (!this.data.favoriteReady || this.data.favoritePending || !POST_CAPABILITIES.communityV1)
      return;
    const generation = this._postGeneration,
      owner = getCurrentIdentity().id;
    this.setData({ favoritePending: true });
    try {
      const result = await community.setFavorite(this.data.targetId, !this.data.favorited);
      if (generation === this._postGeneration && owner === getCurrentIdentity().id)
        this.setData({ favorited: result.favorited });
    } catch (error) {
      if (generation === this._postGeneration)
        this.setData({ favoriteReady: false, favoriteError: '收藏结果未确认，请重新查询状态' });
      showErrorToast(error, { fallback: '收藏失败，请重新查询状态' });
    } finally {
      if (generation === this._postGeneration) this.setData({ favoritePending: false });
    }
  },

  // ─── 帖子操作 ────────────────────────────────────────────

  async onLike() {
    const { id, isLiked, likeCount } = this.data.post;
    if (!id || !['NORMAL', 'MENTOR_QA'].includes(this.data.post.postType ?? '')) return;
    if (this._likePending) return;
    this._likePending = true;

    const safeLikeCount = typeof likeCount === 'number' ? likeCount : 0;
    const currentIsLiked = isLiked;
    const nextIsLiked = !currentIsLiked;
    const nextLikeCount = Math.max(0, safeLikeCount + (currentIsLiked ? -1 : 1));

    // 先本地更新 UI
    this.setData({
      'post.isLiked': nextIsLiked,
      'post.likeCount': nextLikeCount,
    });

    try {
      await postAction.togglePostLikeAndSync({
        postId: id,
        currentLiked: currentIsLiked,
        currentLikeCount: safeLikeCount,
      });
    } catch (err) {
      log.error('onLike', '点赞操作失败', err);
      // 恢复状态
      this.setData({
        'post.isLiked': currentIsLiked,
        'post.likeCount': safeLikeCount,
      });
      showErrorToast(err, {
        fallback: '操作失败，请稍后再试',
      });
    } finally {
      this._likePending = false;
    }
  },

  onComment() {
    const navHeight = this.data.statusBarHeight + (wxGetWindowInfo().windowWidth * 88) / 750;
    void wx.pageScrollTo({ selector: '#discussion-section', offsetTop: -navHeight, duration: 250 });
  },

  goToUser(e: WechatMiniprogram.TouchEvent) {
    const userId = e.currentTarget.dataset.id as string;
    void openUserProfile(userId);
  },

  // ─── 分享 & 更多 ─────────────────────────────────────────

  onTopicTap(e: WechatMiniprogram.TouchEvent) {
    if (!POST_CAPABILITIES.organization) return;
    void wxNavigateTo({
      url: `/subpkg_community/pages/post-list/list?topicId=${encodeURIComponent(String(e.currentTarget.dataset.id))}&postType=${this.data.post.postType === 'MENTOR_QA' ? 'MENTOR_QA' : 'NORMAL'}`,
    });
  },
  async onMore() {
    if (!['NORMAL', 'MENTOR_QA'].includes(this.data.post.postType ?? '')) return;
    const { isSelf } = this.data.post;

    let res;
    try {
      res = await wxShowActionSheet({
        itemList: isSelf
          ? POST_CAPABILITIES.organization &&
            (this.data.post.postType === 'NORMAL' ||
              (this.data.post.postType === 'MENTOR_QA' && POST_CAPABILITIES.mentorQa))
            ? ['删除帖子', '编辑']
            : ['删除帖子']
          : ['举报'],
      });
    } catch {
      // 用户取消操作或出现错误都不做处理
    }

    if (!res) return;

    try {
      if (isSelf && res.tapIndex === 1) {
        void wxNavigateTo({
          url: `/subpkg_community/pages/post-edit/post-edit?postId=${encodeURIComponent(this.data.post.id)}`,
          events: {
            postEdited: () => {
              this._loadPost(this.data.post.id);
            },
          },
        });
        return;
      }
      if (isSelf && res.tapIndex === 0) {
        const r = await wxShowModal({
          title: '删除帖子',
          content: '确认删除这条动态？',
          confirmText: '删除',
          confirmColor: '#FF3B30',
        });

        if (r.confirm) {
          await postAction.deletePostAndSync(this.data.post.id);
          this.onBack();
        }
      } else if (!isSelf && res.tapIndex === 0) {
        this._openPopup({
          popupType: 'report',
          reportTargetType: TARGET_TYPES.POST.value,
          reportTargetId: this.data.post.id,
        });
      }
    } catch (err) {
      log.error('onMore', '更多操作失败', err);
      showErrorToast(err, { fallback: '操作失败，请重试' });
    }
  },

  _goHome() {
    wxReLaunch({
      url: HOME_PAGE_URL,
    }).catch((err: unknown) => {
      log.error('_goHome', '返回首页失败，请检查 HOME_PAGE_URL', err);
      showErrorToast(err, { fallback: '返回首页失败' });
    });
  },

  onBack() {
    const pages = getCurrentPages();

    // 从普通页面进入：正常退回上一页。
    if (!this._enteredFromShare && pages.length > 1) {
      void wxNavigateBack();
      return;
    }

    // 分享卡片 / 外部直达：当前详情页就是根页面，没有上一页可退，直接重建首页。
    this._goHome();
  },

  /**
   * 统一打开 page-container。
   * 宿主 UI 回调只在“关闭 -> 打开”时执行，面板内部切换不会重复执行。
   */
  _openPopup(patch: Record<string, unknown>) {
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
  },

  onPopupLeave() {
    this.setData({
      showPopup: false,
      popupType: '',

      reportTargetType: '',
      reportTargetId: '',
    });
  },

  onShareClose() {
    this._closePopup();
  },

  onCloseReport() {
    this._closePopup(true);
  },
});
