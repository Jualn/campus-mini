import { createBusinessSubscription } from '../../services/business-subscriptions';
/**
 * comment-panel 评论面板组件
 *
 * 设计定位：
 * - 只负责评论列表、回复列表、发送、删除、点赞等评论域内部交互；
 * - 不直接修改帖子 card，不直接操作 postSyncStore/eventBus；
 * - 评论数量变化通过 countchange 事件交给父页面处理。
 *
 * Properties:
 *   mode         'sheet' | 'inline'
 *                sheet：作为底部弹窗使用，由 visible 控制显示
 *                inline：作为页面内评论区使用，targetId 就绪后自动加载
 *
 *   targetId     string
 *                被评论对象 id，例如帖子 id、活动 id、考试 id
 *
 *   targetType   number
 *                被评论对象类型，需要和后端 commentService 约定一致
 *
 *   totalCount   number
 *                父级传入的初始评论总数，组件内部会维护 currentTotalCount
 *
 *   inlineTitle  string
 *                inline 模式标题，默认“评论”
 *
 *   visible      boolean
 *                sheet 模式下是否显示
 *
 * Events:
 *   close
 *     用户关闭 sheet 面板时触发
 *
 *   countchange
 *     评论总数变化时触发
 *     detail: { count, delta, targetId, targetType }
 *
 *   report      → { targetType, targetId, sourceType, parentId } 请求父页面打开举报面板
 */

// comment-panel.ts

import { api } from '../../services/api';
import { community } from '../../services/post-community';
import { getCertifiedMentorProfile } from '../../services/mentor-certification';
import { mapThreadRoot, transformReplyItem } from '../../services/comment';
import { createCommunityComment, pendingPostCreation } from '../../actions/post-creation';
import { POST_CAPABILITIES } from '../../config/post-capabilities';
import { HttpError } from '../../utils/error';
import { storage, STORAGE_KEYS } from '../../utils/storage';
import defineComponent from '../../utils/defineComponent';
import {
  wxHideLoading,
  wxPreviewImage,
  wxShowLoading,
  wxShowModal,
} from '../../utils/wx-promise';
import { TARGET_TYPES, type TargetType } from '../../utils/constants';
import type { CommentItem, ReplyItem, ReplyTarget } from '../../types/business';
import { createLogger } from '../../utils/logger';
import { useSheet } from '../../behaviors/sheet-mixin';
import { type SelectedMediaFile } from '../../actions/media';
import * as commentAction from '../../actions/comment';
import * as mediaAction from '../../actions/media';
import { getCurrentIdentity, watchCurrentIdentity } from '../../actions/current-user';
import { openUserProfile } from '../../utils/user-profile-navigation';
import { watchPersonBinding, personBindingEpoch } from '../../services/person-binding';
import { notifyToast, showErrorToast } from '../../utils/notify';
import { postWriteFeedback, readPostPermission } from '../../utils/post-policy';
import type { PostWritePermission } from '../../types/post-contract';
import {
  buildCommentUpdatePatch,
  calculateCommentCount,
  createCommentAuthor,
  createOptimisticComment,
  createOptimisticReply,
  isCurrentUser,
  mergeUniqueReplies,
} from './comment-model';

// ==================== 类型 ======================

// 私有属性定义
interface Private {
  _businessSubscription?: ReturnType<typeof createBusinessSubscription>;
  _answerSubscription?: ReturnType<typeof createBusinessSubscription>;
  _commentPreviews?: Map<string, { root?: CommentItem; reply?: ReplyItem; parentId?: string; parent?: CommentItem; credit?: boolean }>;
  _commentRevision?: number;
  _serverCount?: number;
  _lastEmittedCount?: number;
  _mentorNameRequest?: number;
  _mentorProfilePending?: boolean;
  _formalDraft?: { text: string; image: string; files: SelectedMediaFile[] };
  _answerQuestionVersion?: string;
  _alive?: boolean;
  _requestGeneration?: number;
  _loading: boolean;
  _offIdentity: (() => void) | null;
  _offBinding: (() => void) | null;
  _draftOwner: string;
  _draftValue: string;
  _composerReady: boolean;
  _composerMeasurePending: boolean;
  _lastTargetId?: string;
  _locatedCommentId?: string;
  _commentLikePendingMap: Record<string, boolean>;
  _replyLikePendingMap: Record<string, boolean>;
  _selectedFiles: SelectedMediaFile[];
}

// ===================== 常量 =====================

const log = createLogger('CommentPanel');

const currentAuthor = () => {
  const user = getCurrentIdentity();
  return createCommentAuthor({
    userId: user.id,
    nickName: user.nickname,
    avatarUrl: user.avatarUrl,
  });
};

// ===================== Component =====================

defineComponent<Private>()({
  behaviors: [useSheet()],

  properties: {
    questionVersion: { type: String, value: '' },
    questionAuthorId: { type: String, value: '' },
    focusCommentId: { type: String, value: '' },
    postType: { type: String, value: 'NORMAL' },
    commentPermission: { type: Object, value: null as PostWritePermission | null },
    mode: { type: String, value: 'sheet' },
    targetId: { type: String },
    targetType: { type: String },
    totalCount: {
      type: Number,
      value: 0,
      observer(newVal: number) {
        if (this._usesPostThread()) {
          if (newVal === this._lastEmittedCount) return;
          // Page reads may have started before a local mutation. A fresh count
          // read owned by the panel reconciles them after the mutation.
          if (this._commentPreviews?.size) return;
          this._serverCount = Math.max(0, newVal || 0);
        }
        this.setData({
          currentTotalCount: Math.max(0, newVal || 0),
        });
      },
    },
    inlineTitle: { type: String, value: '评论' },
    visible: {
      type: Boolean,
      value: false,
      observer(newVal: boolean) {
        if (this.properties.mode !== 'sheet') return;
        if (newVal) this._onSheetOpen();
      },
    },
  },

  data: {
    questionConflict: false,
    canAnswer: false,
    mentorName: '',
    mentorProfileLoading: false,
    mentorProfileError: false,
    mentorAvatarChar: '',
    mentorAvatarBg: '',
    replyAuthor: null as ReturnType<typeof createCommentAuthor> | null,
    failedAvatars: {},
    questionNeedsReload: false,
    contextNotice: '',
    submissionNotice: '',
    submittedCommentId: '',
    commentsError: '',
    writeFeedback: '',
    sending: false,
    loading: false,
    hasInit: false,
    firstLoading: true,
    loadingMore: false,
    panelRatio: 0.8,
    currentTotalCount: 0,
    commentList: [] as CommentItem[],
    page: 0,
    hasMoreComments: true,
    canSend: false,
    inputValue: '',
    inputHeightRpx: 44,
    composerHeight: 0,
    inputFocused: false,
    inputAutoFocus: false,
    previewImage: '',
    replyTarget: {} as ReplyTarget,
    keyboardOpen: false,
    keyboardBottom: 0,
    selfAvatarBg: '',
    selfAvatarChar: '',
    selfAvatarUrl: '',
    _lastCommentId: '',
    /** 更多操作面板状态 */
    _menu: {
      visible: false,
      type: '' as 'comment' | 'reply',
      commentId: '', // 一级评论 id（两种类型都需要）
      replyId: '', // 仅 type=reply 时有值
      isOwn: false, // 是否是当前用户自己的内容
    },
  },

  observers: {
    questionVersion(version: string) {
      if (this._answerQuestionVersion && version !== this._answerQuestionVersion)
        this.setData({ questionConflict: true, questionNeedsReload: !version });
      this._refreshWriteFeedback();
    },
    'postType, commentPermission, replyTarget'() {
      this._refreshWriteFeedback();
    },
    /**
     * targetId 变化时重置评论列表。
     * sheet 模式：只有面板可见时才加载；
     * inline 模式：targetId 就绪后立即加载。
     */
    targetId(id: string) {
      if (!id || id === '0') return;
      if (id === this._lastTargetId) return;

      this._lastTargetId = id;
      this._commentPreviews?.clear();
      this._serverCount = undefined;
      this._lastEmittedCount = undefined;
      this._commentRevision = (this._commentRevision ?? 0) + 1;
      this._formalDraft = undefined;
      this._mentorNameRequest = (this._mentorNameRequest ?? 0) + 1;
      this._mentorProfilePending = false;
      this._locatedCommentId = '';
      this._requestGeneration = (this._requestGeneration ?? 0) + 1;
      this._loading = false;
      this._draftValue = '';
      this._answerQuestionVersion = '';

      this.setData({
        questionConflict: false,
        mentorName: '',
        mentorProfileLoading: false,
        mentorProfileError: false,
        replyAuthor: null,
        questionNeedsReload: false,
        submissionNotice: '',
        submittedCommentId: '',
        sending: false,
        contextNotice: '',
        hasInit: true,
        firstLoading: true,
        loadingMore: false,
        commentList: [],
        commentsError: '',
        page: 0,
        hasMoreComments: true,
        _lastCommentId: '',
        replyTarget: { commentId: '', nickName: '', userId: '' },
        inputValue: '',
        inputHeightRpx: 44,
        previewImage: '',
        canSend: false,
        currentTotalCount: Math.max(0, this.properties.totalCount || 0),
      });

      if (this.properties.mode === 'inline' || this.properties.visible) {
        void this._loadComments(true);
      }
    },
    'inputHeightRpx, previewImage, replyTarget.nickName, keyboardOpen'() {
      this._queueComposerMeasure();
    },
    'writeFeedback, submissionNotice, questionConflict, questionNeedsReload, canAnswer, mentorName, mentorProfileLoading, mentorProfileError, replyTarget.commentId'() {
      this._queueComposerMeasure();
    },
  },

  lifetimes: {
    attached() {
      this._businessSubscription = createBusinessSubscription(() => this._alive !== false);
      this._answerSubscription = createBusinessSubscription(() => this._alive !== false);
      void this._businessSubscription.prepare('COMMENT_PUBLISH');
      if (this.properties.postType === 'MENTOR_QA') void this._answerSubscription.prepare('MENTOR_ANSWER_PUBLISH');
      this._alive = true;
      this._draftOwner = getCurrentIdentity().id;
      this._offBinding = watchPersonBinding(() => {
        if (this.properties.postType === 'MENTOR_QA') {
          this._mentorNameRequest = (this._mentorNameRequest ?? 0) + 1;
          this._mentorProfilePending = false;
          this.setData({ mentorName: '', canAnswer: false, mentorProfileLoading: false, mentorProfileError: false });
          this.triggerEvent('refreshquestion');
        }
      });
      this._requestGeneration ??= 0;
      // 私有字段初始化
      this._loading = false;
      this._draftValue = this.data.inputValue;
      this._composerReady = false;
      this._composerMeasurePending = false;
      this._lastTargetId = undefined;
      this._commentLikePendingMap = {};
      this._replyLikePendingMap = {};
      this._selectedFiles = [];
      this._offIdentity = watchCurrentIdentity(() => {
        if (this._draftOwner !== getCurrentIdentity().id) {
          this._draftOwner = getCurrentIdentity().id;
          this._clearAccountDraft();
        }
        const author = currentAuthor();
        const patch: Record<string, unknown> = {
          selfAvatarBg: author.avatarBg,
          selfAvatarChar: author.avatarChar,
          selfAvatarUrl: author.avatarUrl,
        };
        const next = this.data.commentList.map(commentAction.syncCommentAuthor);
        if (next.some((item, index) => item !== this.data.commentList[index]))
          patch.commentList = next;
        if (this.properties.postType !== 'MENTOR_QA' && this.data.replyTarget.userId === author.userId) {
          patch['replyTarget.nickName'] = author.nickName;
        }
        this.setData(patch);
      });
      this.setData({
        currentTotalCount: Math.max(0, this.properties.totalCount || 0),
      });
    },

    ready() {
      this._composerReady = true;
      this._queueComposerMeasure();
    },

    detached() {
      this._businessSubscription?.dispose();
      this._answerSubscription?.dispose();
      this._alive = false;
      this._requestGeneration = (this._requestGeneration ?? 0) + 1;
      this._mentorNameRequest = (this._mentorNameRequest ?? 0) + 1;
      this._mentorProfilePending = false;
      this._offIdentity?.();
      this._offBinding?.();
      this._offIdentity = null;
      // 私有字段重置（以防万一，虽然下次 attached 会重新赋值）
      this._loading = false;
      this._composerReady = false;
      this._composerMeasurePending = false;
      this._draftValue = '';
      this._lastTargetId = undefined;
      this._commentLikePendingMap = {};
      this._replyLikePendingMap = {};
      this._selectedFiles = [];
    },
  },

  pageLifetimes: {
    show() {
      if (
        (this.properties.postType === 'MENTOR_QA' || this._usesPostThread()) &&
        this.properties.targetId &&
        (this.properties.mode === 'inline' || this.properties.visible)
      )
        void this._loadComments(true);
    },
    hide() {
      if (this.properties.postType !== 'MENTOR_QA') return;
      this._requestGeneration = (this._requestGeneration ?? 0) + 1;
      this._loading = false;
      this._mentorNameRequest = (this._mentorNameRequest ?? 0) + 1;
      this._mentorProfilePending = false;
      this.setData({ firstLoading: true, canAnswer: false, mentorName: '', mentorProfileLoading: false, mentorProfileError: false, writeFeedback: '正在重新确认回答资格' });
    },
  },

  methods: {
    _clearAccountDraft() {
      this._requestGeneration = (this._requestGeneration ?? 0) + 1;
      this._loading = false;
      this._draftValue = '';
      this._locatedCommentId = '';
      this._answerQuestionVersion = '';
      this._selectedFiles = [];
      this._commentPreviews?.clear();
      this._serverCount = undefined;
      this._lastEmittedCount = undefined;
      this._commentRevision = (this._commentRevision ?? 0) + 1;
      this._formalDraft = undefined;
      this._mentorNameRequest = (this._mentorNameRequest ?? 0) + 1;
      this._mentorProfilePending = false;
      this.setData({
        questionConflict: false,
        questionNeedsReload: false,
        submissionNotice: '',
        submittedCommentId: '',
        contextNotice: '',
        mentorName: '',
        mentorProfileLoading: false,
        mentorProfileError: false,
        replyAuthor: null,
        canAnswer: false,
        failedAvatars: {},
        sending: false,
        commentList: [],
        firstLoading: false,
        inputValue: '',
        previewImage: '',
        canSend: false,
        replyTarget: { commentId: '', nickName: '', userId: '' },
        writeFeedback: '身份已变化，请刷新后重新填写',
      });
    },
    _permissionForTarget() {
      const target = this.data.replyTarget;
      if (!target.commentId) return readPostPermission(this.properties.commentPermission);
      const root = this.data.commentList.find((x) => x.commentId === target.commentId);
      if (target.replyToCommentId && target.replyToCommentId !== target.commentId) {
        return [...(root?.replyList ?? []), ...(root?.replyPreview ?? [])].find(
          (x) => x.replyId === target.replyToCommentId,
        )?.replyPermission;
      }
      return root?.replyPermission;
    },
    _refreshWriteFeedback(prepareFormalComposer = true) {
      if (this.properties.targetType !== TARGET_TYPES.POST.value) {
        this.setData({ writeFeedback: '' });
        return '';
      }
      const qa = this.properties.postType === 'MENTOR_QA';
      const canAnswer =
        qa && !this.data.firstLoading && !!this.properties.questionVersion &&
        POST_CAPABILITIES.communityV1 &&
        !postWriteFeedback(this.properties.postType, readPostPermission(this.properties.commentPermission));
      const message =
        this.properties.postType === 'MENTOR_QA' && this.data.firstLoading
          ? '正在重新确认回答资格'
          : postWriteFeedback(
              this.properties.postType,
              this._permissionForTarget(),
              !!this.data.replyTarget.commentId,
            );
      if (
        this.properties.postType === 'MENTOR_QA' &&
        !this.data.replyTarget.commentId &&
        (this.data.questionConflict ||
          !this.properties.questionVersion ||
          !POST_CAPABILITIES.communityV1)
      ) {
        const feedback = this.data.questionConflict
          ? '问题已更新，请核对后继续回答'
          : '问题版本或答疑服务暂不可确认';
        this.setData({ writeFeedback: feedback, canAnswer });
        return feedback;
      }
      this.setData({ writeFeedback: message, canAnswer });
      if (prepareFormalComposer) this._prepareFormalComposer();
      return message;
    },
    _prepareFormalComposer() {
      if (
        this.properties.mode === 'inline' &&
        this.properties.postType === 'MENTOR_QA' &&
        this.data.canAnswer &&
        !this.data.replyTarget.commentId &&
        !this.data.mentorName &&
        !this._mentorProfilePending
      )
        void this._loadMentorProfile();
    },
    /** 空事件占位，阻止冒泡或用于模板中绑定无操作事件。 */
    noop() {
      /* empty */
    },

    /** sheet 模式打开时触发，负责初始化加载评论列表。 */
    _onSheetOpen() {
      wx.nextTick(() => {
        this.setData({ inputAutoFocus: true });
      });
      if (this.data.commentList.length === 0) void this._loadComments(true);
    },

    /** 评论滚动到底部时触发，加载下一页一级评论。 */
    onScrollToLower() {
      this.loadMoreComments();
    },

    /**
     * 加载一级评论列表。
     * @param isFirst 是否为首次加载/刷新加载；true 时会清空旧列表并重置分页游标。
     */
    async _loadComments(isFirst = false) {
      if (this._loading && !isFirst) return;
      const generation = isFirst
        ? (this._requestGeneration = (this._requestGeneration ?? 0) + 1)
        : (this._requestGeneration ?? 0);
      this._loading = true;
      this.setData({ commentsError: '', ...(isFirst ? { contextNotice: '' } : {}) });

      const { targetId, targetType } = this.properties;
      if (!targetId || targetId === '0' || targetId === '') {
        this._loading = false;
        return;
      }

      if (isFirst) {
        this.setData({
          commentsError: '',
          firstLoading: !this.data.commentList.length,
          page: 0,
          hasMoreComments: true,
        });
      } else {
        this.setData({ loadingMore: true });
      }

      try {
        const lastId = isFirst ? undefined : this.data._lastCommentId;
        const res = await commentAction.getCommentList({
          targetId: targetId,
          targetType: targetType as TargetType,
          pageSize: 20,
          lastId,
          ...(this._usesPostThread()
            ? { representation: 'thread' as const, postType: this.properties.postType }
            : {}),
        });
        if (generation !== this._requestGeneration) return;

        if (res.hasMore && (!res.nextCursor || res.nextCursor === lastId))
          throw new Error('评论分页信息异常');
        const newItems: CommentItem[] = res.list;
        const seen = new Set(this.data.commentList.map((x) => x.commentId));
        let commentList = isFirst
          ? newItems
          : [...this.data.commentList, ...newItems.filter((x) => !seen.has(x.commentId))];
        let locatedRootId = '';
        if (isFirst && this._usesPostThread() && this.properties.focusCommentId) {
          try {
            const context = await community.context(targetId, this.properties.focusCommentId);
            if (generation !== this._requestGeneration) return;
            if (context.availability === 'AVAILABLE' && context.root) {
              if (
                this.properties.postType === 'MENTOR_QA' &&
                context.focus &&
                context.focus.kind !== 'DISCUSSION'
              )
                throw new Error('未知讨论表示');
              const root = mapThreadRoot(context.root, this.properties.postType);
              const replies = mergeUniqueReplies(
                root.replyPreview ?? [],
                context.focus ? [transformReplyItem(context.focus)] : [],
              );
              Object.assign(root, {
                replyList: replies,
                repliesExpanded: true,
                lastId: context.nextReplyCursor ?? '',
                hasMoreReplies: !!context.nextReplyCursor,
              });
              commentList = [root, ...commentList.filter((x) => x.commentId !== root.commentId)];
              locatedRootId = root.commentId;
              this.setData({ contextNotice: '已定位到通知中的讨论' });
            } else this.setData({ contextNotice: '目标评论已不可用，仍可浏览当前帖子' });
          } catch (error) {
            if (generation !== this._requestGeneration) return;
            if (error instanceof HttpError && error.statusCode === 404)
              this.triggerEvent('refreshquestion');
            this.setData({ contextNotice: '目标讨论暂时无法定位，可重试；当前帖子仍可浏览' });
          }
        }

        if (this._commentPreviews?.size) {
          for (const root of commentList) {
            if (!root.localPreview) this._acknowledgeLocalComment(root.commentId);
            for (const reply of [...root.replyList, ...(root.replyPreview ?? [])]) {
              if (!reply.localPreview) this._acknowledgeLocalComment(reply.replyId);
            }
          }
          commentList = this._withLocalComments(commentList);
        }
        this.setData({
          commentList,
          hasMoreComments: res.hasMore || false,
          _lastCommentId: res.nextCursor,
        });
        if (this._usesPostThread()) void this._refreshPublicCount();
        if (
          locatedRootId &&
          this.properties.mode === 'inline' &&
          this._locatedCommentId !== this.properties.focusCommentId
        ) {
          this._locatedCommentId = this.properties.focusCommentId;
          this.triggerEvent('contextlocated', { commentId: this._locatedCommentId });
        }
      } catch (err) {
        if (generation !== this._requestGeneration) return;
        if (err instanceof HttpError && err.statusCode === 404 && this._usesPostThread())
          this.triggerEvent('refreshquestion');
        this.setData({ commentsError: '评论加载失败，请重试' });
        log.error('_loadComments', '加载评论失败', err);
        notifyToast({ title: '加载评论失败', icon: 'none' });
      } finally {
        if (generation === this._requestGeneration) {
          this._loading = false;
          this.setData({ firstLoading: false, loadingMore: false });
          this._refreshWriteFeedback();
        }
      }
    },
    retryComments() {
      void this._loadComments(!this.data.commentList.length);
    },

    /** 加载更多一级评论；会根据 loadingMore 和 hasMoreComments 防重复请求。 */
    loadMoreComments() {
      if (this.data.loadingMore || !this.data.hasMoreComments) return;
      void this._loadComments(false);
    },

    /**
     * 展开某条一级评论下的二级回复。
     * 优先展示后端返回的 replyPreview，再按需请求剩余回复。
     */
    async onExpandReplies(e: WechatMiniprogram.TouchEvent) {
      const { commentId } = e.currentTarget.dataset as { commentId: string };
      const parentId = commentId ? commentId : undefined;

      const idx = this._findCommentIdx(parentId);
      if (idx === -1) return;

      this._updateComment(idx, { loadingReplies: true, repliesExpanded: true });
      const comment = this.data.commentList[idx];

      // 先显示 preview
      const previewList = comment.replyPreview ?? [];
      this._updateComment(idx, {
        replyList: [...(comment.replyPreview ?? [])],
        loadingReplies: false,
      });

      // 如果还有更多回复，加载剩余部分
      if (comment.replyCount > previewList.length) {
        const lastId =
          previewList.length > 0 ? previewList[previewList.length - 1].replyId : undefined;
        await this._loadReplies(idx, parentId, lastId);
      }
    },

    /** 加载某条一级评论下更多二级回复。 */
    async onLoadMoreReplies(e: WechatMiniprogram.TouchEvent) {
      const { commentId } = e.currentTarget.dataset as { commentId: string };
      const parentId = commentId ? commentId : undefined;

      const idx = this._findCommentIdx(parentId);
      if (idx === -1) return;
      const comment = this.data.commentList[idx];
      if (comment.loadingReplies) return;
      await this._loadReplies(idx, parentId, comment.lastId);
    },

    /**
     * 请求指定一级评论下的二级回复列表。
     * @param idx 一级评论在 commentList 中的索引
     * @param parentId 一级评论 id
     * @param lastId 分页游标
     */
    async _loadReplies(idx: number, parentId?: string, lastId?: string) {
      const generation = this._requestGeneration;
      this._updateComment(idx, { loadingReplies: true });
      try {
        const { targetId, targetType } = this.properties;
        if (!targetId || targetId === '0') {
          return;
        }
        // 获取回复列表（作为评论的子评论）
        const res = await commentAction.getReplyList({
          targetId: targetId,
          targetType: targetType as TargetType, // 4 表示获取该评论的回复
          parentId: parentId,
          pageSize: 20,
          lastId: lastId ?? undefined,
          ...(this._usesPostThread()
            ? { representation: 'thread' as const, postType: this.properties.postType }
            : {}),
        });
        if (generation !== this._requestGeneration || this._findCommentIdx(parentId) !== idx)
          return;

        if (res.hasMore && (!res.nextCursor || res.nextCursor === lastId))
          throw new Error('回复分页信息异常');
        const comment = this.data.commentList[idx];
        const receivedIds = new Set(res.list.map((reply) => reply.replyId));
        for (const id of receivedIds) this._acknowledgeLocalComment(id);
        const replyList = mergeUniqueReplies(
          comment.replyList.filter((reply) => !reply.localPreview || !receivedIds.has(reply.replyId)),
          res.list,
        );
        const remainReplies = res.hasMore ? Math.max(0, comment.replyCount - replyList.length) : 0;

        this._updateComment(idx, {
          replyList,
          hasMoreReplies: res.hasMore || false,
          remainReplies: Math.max(0, remainReplies),
          lastId: res.nextCursor ?? undefined, // 改这里
          loadingReplies: false,
        });
      } catch (err) {
        if (generation !== this._requestGeneration || this._findCommentIdx(parentId) !== idx)
          return;
        log.error('_loadReplies', '加载回复失败', err);
        this._updateComment(idx, { loadingReplies: false });
      }
    },

    /**
     * 点击“回复”时设置回复目标，并聚焦输入框。
     * 回复目标包含 commentId、nickName、userId。
     */
    _usesPostThread(): boolean {
      return (
        POST_CAPABILITIES.communityV1 &&
        this.properties.targetType === 'POST' &&
        (this.properties.postType === 'NORMAL' ||
          (this.properties.postType === 'MENTOR_QA' && POST_CAPABILITIES.mentorQa))
      );
    },
    onReplyTap(e: WechatMiniprogram.CustomEvent) {
      if (this.data.sending) return;
      const { commentId, nickName, userId, replyToCommentId } = e.currentTarget
        .dataset as ReplyTarget;
      const root = this.data.commentList.find((x) => x.commentId === commentId);
      if (this.properties.postType === 'MENTOR_QA' && !root) return;
      if (this.properties.postType === 'MENTOR_QA' && root) {
        const target = replyToCommentId === commentId
          ? root
          : [...root.replyList, ...(root.replyPreview ?? [])].find((x) => x.replyId === replyToCommentId);
        if (!target || target.localPreview) return;
        const feedback = postWriteFeedback('MENTOR_QA', target.replyPermission, true);
        if (feedback) {
          notifyToast({ title: feedback, icon: 'none' });
          return;
        }
      }
      if (root?.placeholder && (!replyToCommentId || replyToCommentId === commentId)) return;
      const switchingFromAnswer =
        this.properties.postType === 'MENTOR_QA' && !this.data.replyTarget.commentId;
      if (switchingFromAnswer && !this._answerQuestionVersion && this._draftValue)
        this._answerQuestionVersion = this.properties.questionVersion;
      if (switchingFromAnswer) {
        this._formalDraft = {
          text: this._draftValue,
          image: this.data.previewImage,
          files: this._selectedFiles,
        };
        this._draftValue = '';
        this._selectedFiles = [];
        this.setData({ inputValue: '', previewImage: '', canSend: false, inputHeightRpx: 44 });
      }
      this.setData({
        inputAutoFocus: true,
        replyAuthor:
          root?.mentorAnswer && root.userId === getCurrentIdentity().id
            ? createCommentAuthor({
                userId: root.userId,
                nickName: root.nickName,
                avatarUrl: root.avatarUrl,
              })
            : null,
        replyTarget: {
          commentId,
          nickName: root?.mentorAnswer && root.userId === userId ? root.nickName : nickName,
          userId,
          replyToCommentId,
        },
      });
      this._refreshWriteFeedback();
    },

    /** 取消回复状态，恢复为发布一级评论。 */
    cancelReply() {
      if (this.properties.postType === 'MENTOR_QA' && this.data.replyTarget.commentId) {
        const draft = this._formalDraft;
        this._formalDraft = undefined;
        this._draftValue = draft?.text ?? '';
        this._selectedFiles = draft?.files ?? [];
        this.setData({
          inputValue: this._draftValue,
          previewImage: draft?.image ?? '',
          canSend: !!this._draftValue.trim(),
          inputHeightRpx: 44,
        });
      }
      this.setData({
        inputAutoFocus: false,
        replyAuthor: null,
        replyTarget: { commentId: '', nickName: '', userId: '' },
      });
      this._refreshWriteFeedback();
    },
    async startWriting() {
      const feedback = this._refreshWriteFeedback(false);
      if (feedback) {
        notifyToast({ title: feedback, icon: 'none' });
        return;
      }
      if (this.data.sending) return;
      if (this.properties.postType !== 'MENTOR_QA') {
        this.setData({ inputAutoFocus: true });
        return;
      }
      await this._loadMentorProfile();
    },
    async _loadMentorProfile() {
      if (this.data.mentorName || this._mentorProfilePending || !this.data.canAnswer) return;
      const owner = getCurrentIdentity().id;
      const request = (this._mentorNameRequest ?? 0) + 1;
      this._mentorNameRequest = request;
      this._mentorProfilePending = true;
      this.setData({ mentorProfileLoading: true, mentorProfileError: false, inputAutoFocus: false });
      try {
        const profile = await getCertifiedMentorProfile(owner);
        if (this._alive === false || request !== this._mentorNameRequest) return;
        if (!this.data.canAnswer || this.data.replyTarget.commentId) return;
        const avatar = createCommentAuthor({ userId: owner, nickName: profile.realName });
        this.setData({
          mentorName: avatar.nickName,
          mentorAvatarChar: avatar.avatarChar,
          mentorAvatarBg: avatar.avatarBg,
        });
      } catch (error) {
        if (this._alive === false || request !== this._mentorNameRequest) return;
        this.setData({ mentorProfileError: true });
        showErrorToast(error, { fallback: '暂时无法读取导师认证信息' });
      } finally {
        if (this._alive !== false && request === this._mentorNameRequest) {
          this._mentorProfilePending = false;
          this.setData({ mentorProfileLoading: false });
        }
      }
    },
    onAvatarError(e: WechatMiniprogram.CustomEvent) {
      const url = e.currentTarget.dataset.url as string;
      if (url && !Object.prototype.hasOwnProperty.call(this.data.failedAvatars, url))
        this.setData({ failedAvatars: { ...this.data.failedAvatars, [url]: true } });
    },
    _insertLocalComment(id: string, content: string, imageUrl: string, target: ReplyTarget) {
      this._serverCount ??= this.data.currentTotalCount;
      this._commentRevision = (this._commentRevision ?? 0) + 1;
      const account = currentAuthor();
      const author = target.commentId
        ? this.data.replyAuthor ?? account
        : this.properties.postType === 'MENTOR_QA'
          ? createCommentAuthor({ ...account, nickName: this.data.mentorName })
          : account;
      // Author-only display until this ID appears in the public feed.
      const previews = (this._commentPreviews ??= new Map());
      if (target.commentId) {
        const reply = createOptimisticReply({
          id,
          author,
          content,
          replyToName: target.nickName,
          replyToUserId: target.userId,
        });
        previews.set(id, {
          parentId: target.commentId,
          parent: this.data.commentList.find((root) => root.commentId === target.commentId),
          reply: { ...reply, replyToCommentId: target.replyToCommentId, localPreview: true },
          credit: true,
        });
      } else {
        const root = createOptimisticComment({ id, author, content, imageUrl });
        previews.set(id, { root: { ...root, kind: this.properties.postType === 'MENTOR_QA' ? 'MENTOR_ANSWER' : undefined, localPreview: true }, credit: true });
      }
      this.setData({ commentList: this._withLocalComments(this.data.commentList) });
      this._publishCommentCount();
    },
    _publishCommentCount() {
      const credits = [...(this._commentPreviews?.values() ?? [])].filter((item) => item.credit).length;
      const count = Math.max(0, (this._serverCount ?? this.data.currentTotalCount) + credits);
      this._lastEmittedCount = count;
      this.setData({ currentTotalCount: count });
      this.triggerEvent('countchange', {
        count, delta: 0, targetId: this.properties.targetId, targetType: this.properties.targetType,
      });
    },
    _acknowledgeLocalComment(id: string) {
      const local = this._commentPreviews?.get(id);
      if (!local) return;
      if (local.credit) this._serverCount = (this._serverCount ?? 0) + 1;
      this._commentPreviews?.delete(id);
      this._commentRevision = (this._commentRevision ?? 0) + 1;
    },
    _removeLocalPreview(id: string) {
      this._commentPreviews?.delete(id);
      this._commentRevision = (this._commentRevision ?? 0) + 1;
      this.setData({
        commentList: this.data.commentList.filter((root) => root.commentId !== id).map((root) => ({
          ...root,
          replyCount: Math.max(0, root.replyCount - (root.replyList.some((reply) => reply.replyId === id) ? 1 : 0)),
          replyList: root.replyList.filter((reply) => reply.replyId !== id),
          replyPreview: root.replyPreview?.filter((reply) => reply.replyId !== id),
        })),
      });
      this._publishCommentCount();
    },
    _withLocalComments(list: CommentItem[]) {
      for (const [id, preview] of this._commentPreviews ?? []) {
        if (preview.root && !list.some((root) => root.commentId === id)) list = [preview.root, ...list];
        const reply = preview.reply;
        if (!reply) continue;
        if (preview.parent && !list.some((root) => root.commentId === preview.parentId))
          list = [...list, preview.parent];
        list = list.map((root) => {
          if (root.commentId !== preview.parentId) return root;
          if (root.replyList.some((item) => item.replyId === id) ||
              root.replyPreview?.some((item) => item.replyId === id)) return root;
          const replies = root.repliesExpanded ? root.replyList : root.replyPreview ?? [];
          return {
            ...root,
            repliesExpanded: true,
            replyCount: root.replyCount + 1,
            replyList: [reply, ...replies],
            lastId: root.repliesExpanded ? root.lastId : replies[replies.length - 1]?.replyId ?? '',
          };
        });
      }
      return list;
    },
    /** 原生 textarea 持有输入过程，只在清空或恢复草稿时回写 value，避免逐字回写干扰光标。 */
    onInputChange(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
      const value = e.detail.value || '';
      this._draftValue = value;
      if (
        value.trim() &&
        this.properties.postType === 'MENTOR_QA' &&
        !this.data.replyTarget.commentId &&
        !this._answerQuestionVersion
      )
        this._answerQuestionVersion = this.properties.questionVersion;
      const canSend = value.trim().length > 0;
      if (canSend !== this.data.canSend) this.setData({ canSend });
    },

    /** 只在行数改变时调整高度，最多展开四行，其余内容由原生输入框滚动。 */
    onInputLineChange(e: WechatMiniprogram.TextareaLineChange) {
      const lines = Math.max(1, Math.min(4, e.detail.lineCount || 1));
      const inputHeightRpx = lines * 44;
      if (inputHeightRpx !== this.data.inputHeightRpx) this.setData({ inputHeightRpx });
    },

    onInputKeyboardHeightChange(e: WechatMiniprogram.TextareaKeyboardHeightChange) {
      this._updateKeyboardHeight(e.detail.height);
    },

    _updateKeyboardHeight(height: number) {
      const keyboardBottom = Math.max(0, height || 0);
      if (keyboardBottom === this.data.keyboardBottom) return;
      this.setData({ keyboardBottom, keyboardOpen: keyboardBottom > 0 });
    },

    /** inline 固定输入栏的占位包含多行、回复提示、配图和安全区；合并同帧测量。 */
    _queueComposerMeasure() {
      if (!this._composerReady || this.properties.mode !== 'inline' || this._composerMeasurePending)
        return;
      this._composerMeasurePending = true;
      wx.nextTick(() => {
        this._composerMeasurePending = false;
        if (!this._composerReady) return;
        this.createSelectorQuery()
          .select('.cp-bottom-bar--inline')
          .boundingClientRect((rect) => {
            const bounds = rect as WechatMiniprogram.BoundingClientRectResult | null;
            if (!this._composerReady || !bounds) return;
            const composerHeight = Math.ceil(bounds.height);
            if (composerHeight !== this.data.composerHeight) this.setData({ composerHeight });
          })
          .exec();
      });
    },

    /** 输入框聚焦时记录键盘高度，保证输入区不被遮挡。 */
    onInputFocus(e: WechatMiniprogram.CustomEvent<{ height: number }>) {
      this.setData({ inputFocused: true });
      const h = e.detail.height || 0;
      if (h > 0) this._updateKeyboardHeight(h);
    },

    /** 失焦不提前复位高度，等待原生键盘高度事件，避免收键盘时先落下再弹回。 */
    onInputBlur() {
      this.setData({
        inputAutoFocus: false,
        inputFocused: false,
      });
    },

    /**
     * 发送评论或回复。
     * 内部采用乐观更新：先插入本地临时评论，再请求后端；
     * 请求失败时回滚评论列表、输入框状态和评论总数。
     */
    async onSend() {
      if (this.data.sending) return;
      const feedback = this._refreshWriteFeedback();
      if (feedback) {
        notifyToast({ title: feedback, icon: 'none' });
        return;
      }
      if (!this.data.canSend && !this.data.previewImage) return;

      const { replyTarget, previewImage } = this.data;
      const inputValue = this._draftValue;
      const text = inputValue.trim();

      if (!text && !previewImage) {
        notifyToast({ title: '请输入内容', icon: 'none', duration: 1500 });
        return;
      }

      const isReply = !!replyTarget.commentId;

      if (this._usesPostThread()) {
        await this._sendPostComment(text, isReply);
        return;
      }
      if (this.properties.postType === 'MENTOR_QA') return;

      // 回复状态下不允许图片，保险起见这里也拦一下
      if (isReply && previewImage) {
        notifyToast({ title: '回复暂不支持图片', icon: 'none' });
        return;
      }

      const targetId = this.properties.targetId;
      this.setData({ sending: true });
      if (this._businessSubscription && !await this._businessSubscription.request('COMMENT_PUBLISH') ||
          this._alive === false || this.properties.targetId !== targetId) {
        if (this._alive !== false) this.setData({ sending: false });
        return;
      }
      const tempId = `local-${Date.now().toString()}`;
      const prevInputState = {
        inputValue,
        inputHeightRpx: this.data.inputHeightRpx,
        previewImage,
        canSend: this.data.canSend,
        replyTarget: { ...replyTarget },
        inputAutoFocus: this.data.inputAutoFocus,
        inputFocused: this.data.inputFocused,
        selectedFiles: [...this._selectedFiles],
      };

      const restoreInputState = () => {
        this._draftValue = prevInputState.inputValue;
        this.setData({
          inputValue: prevInputState.inputValue,
          inputHeightRpx: prevInputState.inputHeightRpx,
          previewImage: prevInputState.previewImage,
          canSend: prevInputState.canSend,
          replyTarget: prevInputState.replyTarget,
          inputAutoFocus: prevInputState.inputAutoFocus,
          inputFocused: prevInputState.inputFocused,
        });
        this._selectedFiles = [...prevInputState.selectedFiles];
      };

      let rollback: () => void;
      let applyServerId: (realId: string) => void;

      if (isReply) {
        const cidx = this._findCommentIdx(replyTarget.commentId);
        if (cidx === -1) {
          notifyToast({ title: '评论已失效，请刷新后重试', icon: 'none' });
          return;
        }

        const comment = this.data.commentList[cidx];
        const prevReplyList = [...comment.replyList];
        const prevReplyPreview = [...(comment.replyPreview ?? [])];
        const prevReplyCount = comment.replyCount;
        const prevRemainReplies = comment.remainReplies;
        const prevHasMoreReplies = comment.hasMoreReplies;
        const prevRepliesExpanded = comment.repliesExpanded;

        const optimisticReply = createOptimisticReply({
          id: tempId,
          author: currentAuthor(),
          content: text,
          replyToName: replyTarget.nickName || '',
          replyToUserId: replyTarget.userId,
        });

        if (comment.repliesExpanded) {
          const replyList = [optimisticReply, ...comment.replyList];
          const remainReplies = comment.hasMoreReplies
            ? Math.max(0, comment.replyCount + 1 - replyList.length)
            : 0;
          this._updateComment(cidx, {
            replyList,
            replyCount: comment.replyCount + 1,
            remainReplies,
          });
        } else {
          const replyPreview = [optimisticReply, ...(comment.replyPreview ?? [])];
          this._updateComment(cidx, {
            replyPreview,
            replyCount: comment.replyCount + 1,
          });
        }

        rollback = () => {
          this._updateComment(cidx, {
            replyList: prevReplyList,
            replyPreview: prevReplyPreview,
            replyCount: prevReplyCount,
            remainReplies: prevRemainReplies,
            hasMoreReplies: prevHasMoreReplies,
            repliesExpanded: prevRepliesExpanded,
          });
          restoreInputState();
          this._syncCount(-1);
        };

        applyServerId = (realId: string) => {
          if (cidx < 0 || cidx >= this.data.commentList.length) return;
          const updated = this.data.commentList[cidx];
          if (updated.repliesExpanded) {
            const ridx = updated.replyList.findIndex((r) => r.replyId === tempId);
            if (ridx === -1) return;
            const next = [...updated.replyList];
            next[ridx] = { ...next[ridx], replyId: realId };
            this._updateComment(cidx, { replyList: next });
            return;
          }

          const preview = updated.replyPreview ?? [];
          const ridx = preview.findIndex((r) => r.replyId === tempId);
          if (ridx === -1) return;
          const next = [...preview];
          next[ridx] = { ...next[ridx], replyId: realId };
          this._updateComment(cidx, { replyPreview: next });
        };
      } else {
        const optimisticComment = createOptimisticComment({
          id: tempId,
          author: currentAuthor(),
          content: text,
          imageUrl: previewImage || '',
        });

        const prevCommentList = this.data.commentList;
        const nextList = [optimisticComment, ...prevCommentList];
        this.setData({ commentList: nextList });

        rollback = () => {
          this.setData({ commentList: prevCommentList });
          restoreInputState();
          this._syncCount(-1);
        };

        applyServerId = (realId: string) => {
          const idx = this._findCommentIdx(tempId);
          if (idx === -1) return;
          this._updateComment(idx, { commentId: realId });
        };
      }

      this._draftValue = '';
      this.setData({ inputValue: '', inputHeightRpx: 44, previewImage: '', canSend: false });
      this._selectedFiles = [];

      this.cancelReply();
      this._syncCount(1);

      try {
        this.setData({ sending: true });
        const res = await commentAction.createCommentWithImage({
          targetId: this.properties.targetId,
          targetType: this.properties.targetType as TargetType,
          content: text,
          parentId: replyTarget.commentId ? replyTarget.commentId : undefined,
          imageFile: !isReply ? prevInputState.selectedFiles[0] : undefined,
        });

        if (!res) {
          notifyToast({ title: '发送失败', icon: 'none' });
          rollback();
          return;
        }

        notifyToast({ title: '发布成功', icon: 'success', duration: 1500 });
        applyServerId(res);
      } catch (error) {
        rollback();
        notifyToast({ title: '发送失败', icon: 'none' });
        log.error('onSend', '发送评论失败', error);
      } finally {
        this.setData({ sending: false });
      }
    },

    async _sendPostComment(content: string, isReply: boolean) {
      const owner = getCurrentIdentity().id,
        targetId = this.properties.targetId,
        token = storage.get(STORAGE_KEYS.TOKEN);
      const current = () =>
        this._alive !== false &&
        owner === getCurrentIdentity().id &&
        token === storage.get(STORAGE_KEYS.TOKEN) &&
        targetId === this.properties.targetId;
      const reply = this.data.replyTarget;
      const formal = this.properties.postType === 'MENTOR_QA' && !isReply;
      const qa = this.properties.postType === 'MENTOR_QA';
      const questionVersion = this._answerQuestionVersion ?? this.properties.questionVersion;
      if (formal && (!content.trim() || !questionVersion || this.data.questionConflict || !this.data.mentorName)) return;
      if (formal) this._answerQuestionVersion = questionVersion;
      if (isReply && (!reply.replyToCommentId || this.data.previewImage)) {
        notifyToast({ title: '请选择具体公开节点回复，回复不支持图片', icon: 'none' });
        return;
      }
      if (POST_CAPABILITIES.communityV1 && pendingPostCreation('comment')) {
        notifyToast({ title: '上次评论结果未确认，请到我的评论核对提交结果', icon: 'none' });
        return;
      }
      this.setData({ sending: true, submissionNotice: '', submittedCommentId: '' });
      const bindingEpoch = personBindingEpoch();
      const intent = formal ? this._answerSubscription : this._businessSubscription;
      if ((intent && !await intent.request(formal ? 'MENTOR_ANSWER_PUBLISH' : 'COMMENT_PUBLISH')) || !current() ||
          (formal && bindingEpoch !== personBindingEpoch())) {
        if (current()) this.setData({ sending: false });
        return;
      }
      const localId = `local-${String(Date.now())}-${String((this._commentRevision ?? 0) + 1)}`;
      let inserted = false;
      try {
        this._insertLocalComment(localId, content, this.data.previewImage, reply);
        inserted = true;
        let imageUrl = '',
          imageObjectKey: string | undefined;
        if (!isReply && this._selectedFiles[0]) {
          const images = await mediaAction.uploadFilesToCos(TARGET_TYPES.COMMENT.value, [
            this._selectedFiles[0],
          ]);
          imageUrl = images[0]?.url ?? '';
          imageObjectKey = images[0]?.objectKey;
        }
        if (!current()) return;
        if (formal && bindingEpoch !== personBindingEpoch()) {
          this._removeLocalPreview(localId);
          inserted = false;
          this.setData({ submissionNotice: '绑定已变化，草稿已保留，请刷新确认正式回答资格' });
          this.triggerEvent('refreshquestion');
          return;
        }
        if (formal && questionVersion !== this.properties.questionVersion)
          throw new HttpError(409, 'Question changed', {
            problemType: '/problems/mentor-question-version-stale',
          });
        if (formal) {
          const feedback = postWriteFeedback(
            this.properties.postType,
            readPostPermission(this.properties.commentPermission),
          );
          if (feedback) {
            this._removeLocalPreview(localId);
            inserted = false;
            this.setData({ submissionNotice: `${feedback}，草稿已保留` });
            return;
          }
        }
        const payload = {
          targetId: this.properties.targetId,
          targetType: TARGET_TYPES.POST.value,
          content,
          imageUrl,
          imageObjectKey,
          parentId: isReply ? reply.commentId : undefined,
          replyToCommentId: isReply ? reply.replyToCommentId : undefined,
          ...(formal ? { questionVersion } : {}),
        };
        const result = await createCommunityComment(payload);
        if (!current()) return;
        if (
          'safety' in result &&
          (result.safety === 'REJECTED' || result.safety === 'CHECK_FAILED')
        ) {
          this._removeLocalPreview(localId);
          inserted = false;
          notifyToast({ title: '内容未能发布', icon: 'none' });
          return;
        }
        const preview = this._commentPreviews?.get(localId);
        if (preview) {
          this._commentPreviews?.delete(localId);
          const accepted = {
            ...preview,
            root: preview.root ? { ...preview.root, commentId: result.id, imageUrl } : undefined,
            reply: preview.reply ? { ...preview.reply, replyId: result.id } : undefined,
          };
          this._commentPreviews?.set(result.id, accepted);
          this.setData({
            commentList: this.data.commentList.map((root) => ({
              ...root,
              ...(root.commentId === localId ? accepted.root : {}),
              replyList: root.replyList.map((row) => row.replyId === localId && accepted.reply ? accepted.reply : row),
              replyPreview: root.replyPreview?.map((row) => row.replyId === localId && accepted.reply ? accepted.reply : row),
            })),
          });
        }
        inserted = false;
        this._commentRevision = (this._commentRevision ?? 0) + 1;
        this._draftValue = '';
        this._selectedFiles = [];
        if (!qa || formal) this._answerQuestionVersion = '';
        this.setData({
          inputValue: '',
          previewImage: '',
          canSend: false,
          submittedCommentId: '',
          inputHeightRpx: 44,
          submissionNotice: '',
        });
        this.cancelReply();
        if (qa) {
          this.triggerEvent('refreshquestion');
          if (formal) this.triggerEvent('contextlocated', { commentId: result.id });
        }
        void this._loadComments(true);
      } catch (error) {
        if (current() && inserted) this._removeLocalPreview(localId);
        if (
          current() &&
          formal &&
          error instanceof HttpError &&
          ((error.statusCode === 403 &&
            error.problemType === '/problems/mentor-answer-forbidden') ||
            (error.statusCode === 503 &&
              error.problemType === '/problems/mentor-qualification-unavailable'))
        ) {
          const feedback = postWriteFeedback(
            'MENTOR_QA',
            error.statusCode === 403
              ? { state: 'DENIED', reason: 'MENTOR_REQUIRED' }
              : { state: 'BLOCKED', reason: 'QUALIFICATION_UNAVAILABLE' },
          );
          notifyToast({ title: feedback, icon: 'none' });
          this.triggerEvent('refreshquestion');
          return;
        }
        if (
          current() &&
          error instanceof HttpError &&
          error.problemType === '/problems/mentor-question-version-stale'
        ) {
          this.setData({
            questionConflict: true,
            questionNeedsReload: true,
            submissionNotice: '问题已更新，回答草稿已保留。请重新阅读问题并明确核对后继续。',
          });
          this.triggerEvent('refreshquestion');
          return;
        }
        if (current()) {
          showErrorToast(error, { fallback: '提交失败，草稿已保留' });
        }
      } finally {
        if (
          this._alive !== false &&
          owner === getCurrentIdentity().id &&
          targetId === this.properties.targetId
        )
          this.setData({ sending: false });
      }
    },
    retryQuestion() {
      this.triggerEvent('refreshquestion');
    },
    readQuestion() {
      void wx.pageScrollTo({ scrollTop: 0, duration: 250 });
    },
    acknowledgeQuestion() {
      if (!this.properties.questionVersion || this.data.sending || this.data.questionNeedsReload)
        return;
      this._answerQuestionVersion = this.properties.questionVersion;
      this.setData({ questionConflict: false, submissionNotice: '' });
      this._refreshWriteFeedback();
    },
    dismissSubmission() {
      this.setData({ submissionNotice: '', submittedCommentId: '' });
    },
    async _reloadPublicDiscussion() {
      const refresh = this._loadComments(true);
      if (this.properties.postType === 'MENTOR_QA') this.triggerEvent('refreshquestion');
      else await this._refreshPublicCount();
      await refresh;
    },
    async _refreshPublicCount() {
      const generation = this._requestGeneration;
      const revision = this._commentRevision;
      try {
        const statuses = await Promise.all([...(this._commentPreviews?.keys() ?? [])]
          .filter((id) => !id.startsWith('local-'))
          .map(async (id) => {
            try {
              return { id, value: await community.myComment(id) };
            } catch { return null; }
          }));
        const post = await api.post.getDetail(this.properties.targetId);
        if (this._alive === false || generation !== this._requestGeneration || revision !== this._commentRevision) return;
        for (const status of statuses) {
          if (status?.value.submission.postId !== this.properties.targetId) continue;
          const state = status.value.submission;
          if (state.safety === 'REJECTED' || state.safety === 'CHECK_FAILED') {
            this._removeLocalPreview(status.id);
          } else if (state.visibility === 'PUBLIC') {
            const preview = this._commentPreviews?.get(status.id);
            if (preview) preview.credit = false;
          }
        }
        this._serverCount = Math.max(0, post.commentCount);
        this._publishCommentCount();
      } catch {
        /* Next public read reconciles the count; do not invent a delta. */
      }
    },

    /** 选择一级评论图片；回复状态下不允许上传图片。 */
    async onChooseImage() {
      if (this.data.sending) return;
      const feedback = this._refreshWriteFeedback();
      if (feedback) {
        notifyToast({ title: feedback, icon: 'none' });
        return;
      }
      if (this.data.replyTarget.commentId) return;
      void wxShowLoading({
        title: '上传中...',
      });
      const count = 1;
      try {
        const res = await mediaAction.selectImages(count);
        if (res.length > 0) {
          this.setData({ previewImage: res[0].filePath });
          this._selectedFiles = [res[0]]; // 存储已选择的文件信息，后续发送评论时会用到
        }
      } catch (err: unknown) {
        log.error('onChooseImage', '选择图片失败', err);
        notifyToast({ title: '选择图片失败，请稍后再试！', icon: 'none' });
      } finally {
        void wxHideLoading();
      }
    },

    /** 移除待发送的图片。 */
    removeImage() {
      this.setData({ previewImage: '' });
      this._selectedFiles = [];
    },

    /**
     * 一级评论点赞/取消点赞。
     * 先更新本地 UI，再调用接口；接口失败时回滚点赞状态。
     */
    async onCommentLike(e: WechatMiniprogram.TouchEvent) {
      const { commentId, isLiked } = e.currentTarget.dataset as {
        commentId: string;
        isLiked: boolean;
      };
      const idx = this._findCommentIdx(commentId);
      if (idx === -1 || this.data.commentList[idx].placeholder) return;
      if (this._commentLikePendingMap[commentId]) return;
      this._commentLikePendingMap[commentId] = true;

      const comment = this.data.commentList[idx];
      this._updateComment(idx, {
        isLiked: !isLiked,
        likeCount: comment.likeCount + (isLiked ? -1 : 1),
      });

      try {
        await commentAction.toggleCommentLike({ commentId, isLiked });
      } catch (err) {
        log.error('onCommentLike', '点赞失败', err);
        notifyToast({ title: '点赞失败, 请稍后再试！', icon: 'none' });
        // 恢复状态
        this._updateComment(idx, { isLiked, likeCount: comment.likeCount });
      } finally {
        this._commentLikePendingMap[commentId] = false;
      }
    },

    /**
     * 二级回复点赞/取消点赞。
     * 先更新本地 UI，再调用接口；接口失败时回滚点赞状态。
     */
    async onReplyLike(e: WechatMiniprogram.TouchEvent) {
      const { commentId, replyId, isLiked } = e.currentTarget.dataset as {
        commentId: string;
        replyId: string;
        isLiked: boolean;
      };
      const cidx = this._findCommentIdx(commentId);
      if (cidx === -1) return;

      const comment = this.data.commentList[cidx];
      const ridx = comment.replyList.findIndex((r) => r.replyId === replyId);
      if (ridx === -1) return;
      if (this._replyLikePendingMap[replyId]) return;
      this._replyLikePendingMap[replyId] = true;

      const reply = comment.replyList[ridx];
      const newReplyList = [...comment.replyList];
      newReplyList[ridx] = {
        ...reply,
        isLiked: !isLiked,
        likeCount: reply.likeCount + (isLiked ? -1 : 1),
      };
      this._updateComment(cidx, { replyList: newReplyList });

      try {
        await commentAction.toggleCommentLike({ commentId: replyId, isLiked });
      } catch (err) {
        log.error('onReplyLike', '同步点赞状态失败', err);
        notifyToast({ title: '操作失败,请稍后再试！', icon: 'none' });
        newReplyList[ridx] = reply; // 恢复原始 reply 对象
        this._updateComment(cidx, { replyList: newReplyList });
      } finally {
        this._replyLikePendingMap[replyId] = false;
      }
    },

    /**
     * 点击评论/回复更多按钮。
     * 根据 dataset 判断操作对象类型、id 以及是否为当前用户内容，
     * 使用微信原生 ActionSheet 展示操作项。
     */
    onMoreTap(e: WechatMiniprogram.TouchEvent) {
      const {
        type,
        commentId,
        replyId = '',
        userId,
      } = e.currentTarget.dataset as {
        type: 'comment' | 'reply';
        commentId: string;
        replyId?: string;
        userId: string;
      };

      const menu = {
        visible: false,
        type,
        commentId,
        replyId,
        isOwn: this._isCurrentUser(userId),
      };

      this.setData({ _menu: menu }, () => {
        const itemList = menu.isOwn ? ['举报', '删除'] : ['举报'];

        wx.showActionSheet({
          itemList,
          success: (res) => {
            if (res.tapIndex === 0) {
              this.onMenuReport();
              return;
            }

            if (menu.isOwn && res.tapIndex === 1) {
              void this.onMenuDelete();
            }
          },
          fail: () => {
            this.onMenuClose();
          },
        });
      });
    },

    /** 关闭更多操作面板。 */
    onMenuClose() {
      this.setData({ '_menu.visible': false });
    },

    /**
     * 点击举报。
     *
     * comment-panel 不直接打开 report-panel，也不直接调用举报接口；
     * 只把举报对象抛给父页面，由父页面继续使用 page-container + report-panel 处理。
     */
    onMenuReport() {
      const { type, commentId, replyId } = this.data._menu;

      const targetId = type === 'reply' ? replyId : commentId;

      if (!targetId) {
        this.onMenuClose();
        notifyToast({ title: '举报对象不存在', icon: 'none' });
        return;
      }

      this.onMenuClose();

      this.triggerEvent('report', {
        // 如果后端评论和回复统一都是评论类型，这里保持 COMMENT 即可
        targetType: TARGET_TYPES.COMMENT.value,
        targetId,

        // 给父页面或 report-panel 做展示/埋点/接口区分
        sourceType: type, // 'comment' | 'reply'

        // 如果举报的是回复，保留父评论 id，方便后续定位
        parentId: type === 'reply' ? commentId : '',
      });
    },

    /**
     * 删除评论或回复。
     * 删除成功后同步更新本地列表、回复数和评论总数。
     */
    async onMenuDelete() {
      this.onMenuClose();
      const { type, commentId, replyId } = this.data._menu;
      const owner = getCurrentIdentity().id;
      const generation = this._requestGeneration;

      const confirmed = await wxShowModal({
        title: '确认删除',
        content: '删除后无法恢复，确定要删除吗？',
        confirmColor: '#e02020',
      }).then((res) => res.confirm);

      if (!confirmed || owner !== getCurrentIdentity().id || generation !== this._requestGeneration)
        return;

      try {
        if (this._usesPostThread()) {
          await commentAction.removeComment(type === 'comment' ? commentId : replyId);
          if (owner !== getCurrentIdentity().id || generation !== this._requestGeneration) return;
          await this._reloadPublicDiscussion();
          return;
        }
        if (type === 'comment') {
          await commentAction.removeComment(commentId);

          // 接口成功后，从本地列表移除该评论
          const deletedComment = this.data.commentList.find((c) => c.commentId === commentId);
          const deletedCount = 1 + (deletedComment?.replyCount ?? 0);

          const list = this.data.commentList.filter((c) => c.commentId !== commentId);
          this.setData({ commentList: list });
          this._syncCount(-deletedCount); // 通知父组件数量 -当前评论加当前评论的子评论
        } else {
          await commentAction.removeComment(replyId);

          // 接口成功后，从父评论的 replyList / replyPreview 中移除
          const cidx = this._findCommentIdx(commentId);
          if (cidx === -1) return;
          const comment = this.data.commentList[cidx];

          this._updateComment(cidx, {
            replyList: comment.replyList.filter((r) => r.replyId !== replyId),
            replyPreview: comment.replyPreview?.filter((r) => r.replyId !== replyId) ?? [],
            replyCount: Math.max(0, comment.replyCount - 1),
          });

          this._syncCount(-1);
        }

        notifyToast({ title: '已删除', icon: 'success' });
      } catch (err) {
        notifyToast({ title: '删除失败，请稍后再试', icon: 'none' });
        log.error('onMenuDelete', '删除失败', err);
      }
    },

    /** 预览评论图片。 */
    onPreviewImage(e: WechatMiniprogram.CustomEvent) {
      const { url } = e.currentTarget.dataset as { url: string };
      void wxPreviewImage({ urls: [url], current: url });
    },

    /** 根据 commentId 查找一级评论在 commentList 中的索引。 */
    _findCommentIdx(commentId?: string): number {
      return this.data.commentList.findIndex((c) => c.commentId === commentId);
    },

    /**
     * 局部更新某条一级评论。
     * 统一通过 setData 的路径写法减少整列表刷新。
     */
    _updateComment(idx: number, fields: Partial<CommentItem>) {
      this.setData(buildCommentUpdatePatch(idx, fields));
    },

    /**
     * 同步评论总数。
     *
     * 组件内部先维护 currentTotalCount，保证连续新增/删除时不会依赖父组件旧值。
     * 然后通过 countchange 通知父页面，由父页面决定如何更新 card/cache/store。
     * @param delta 评论数变化量，新增评论/回复传 +1，删除评论/回复传 -1
     */
    _syncCount(delta: number) {
      const current =
        typeof this.data.currentTotalCount === 'number'
          ? this.data.currentTotalCount
          : this.properties.totalCount || 0;

      const nextCount = calculateCommentCount(current, delta);

      this.setData({
        currentTotalCount: nextCount,
      });

      this.triggerEvent('countchange', {
        count: nextCount,
        delta,
        targetId: this.properties.targetId,
        targetType: this.properties.targetType,
      });
    },

    /** 判断传入 userId 是否为当前登录用户。 */
    _isCurrentUser(userId: string): boolean {
      const currentUserId = getCurrentIdentity().id;
      return isCurrentUser(currentUserId, userId);
    },

    /** 跳转到用户主页。 */
    goToUser(e: WechatMiniprogram.TouchEvent) {
      const { userId } = e.currentTarget.dataset as { userId: string };
      void openUserProfile(userId);
    },

    /** 对外暴露的刷新方法，供父组件通过 selectComponent 调用。 */
    refresh() {
      void this._loadComments(true);
    },
  },
});
