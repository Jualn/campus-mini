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

import defineComponent from '../../utils/defineComponent';
import {
  wxHideLoading,
  wxNavigateTo,
  wxPreviewImage,
  wxShowLoading,
  wxShowModal,
} from '../../utils/wx-promise';
import { TARGET_TYPES, type TargetType } from '../../utils/constants';
import type { CommentItem, ReplyTarget } from '../../types/business';
import { createLogger } from '../../utils/logger';
import { useSheet } from '../../behaviors/sheet-mixin';
import { type SelectedMediaFile } from '../../actions/media';
import * as commentAction from '../../actions/comment';
import * as mediaAction from '../../actions/media';
import { getCurrentIdentity, watchCurrentIdentity } from '../../actions/current-user';
import { notifyToast } from '../../utils/notify';
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
  _loading: boolean;
  _offIdentity: (() => void) | null;
  _draftValue: string;
  _composerReady: boolean;
  _composerMeasurePending: boolean;
  _lastTargetId?: string;
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
    mode: { type: String, value: 'sheet' },
    targetId: { type: String },
    targetType: { type: String },
    totalCount: {
      type: Number,
      value: 0,
      observer(newVal: number) {
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
    /**
     * targetId 变化时重置评论列表。
     * sheet 模式：只有面板可见时才加载；
     * inline 模式：targetId 就绪后立即加载。
     */
    targetId(id: string) {
      if (!id || id === '0') return;
      if (id === this._lastTargetId) return;

      this._lastTargetId = id;
      this._draftValue = '';

      this.setData({
        hasInit: true,
        firstLoading: true,
        loadingMore: false,
        commentList: [],
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
  },

  lifetimes: {
    attached() {
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
        const author = currentAuthor();
        const patch: Record<string, unknown> = {
          selfAvatarBg: author.avatarBg,
          selfAvatarChar: author.avatarChar,
          selfAvatarUrl: author.avatarUrl,
        };
        const next = this.data.commentList.map(commentAction.syncCommentAuthor);
        if (next.some((item, index) => item !== this.data.commentList[index]))
          patch.commentList = next;
        if (this.data.replyTarget.userId && this.data.replyTarget.userId === author.userId) {
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
      this._offIdentity?.();
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

  methods: {
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
      if (this._loading) return;
      this._loading = true;

      const { targetId, targetType } = this.properties;
      if (!targetId || targetId === '0' || targetId === '') {
        this._loading = false;
        return;
      }

      if (isFirst) {
        this.setData({
          firstLoading: true,
          page: 0,
          commentList: [],
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
        });

        const newItems: CommentItem[] = res.list;
        const commentList = isFirst ? newItems : [...this.data.commentList, ...newItems];

        this.setData({
          commentList,
          hasMoreComments: res.hasMore || false,
          _lastCommentId: res.nextCursor,
        });
      } catch (err) {
        log.error('_loadComments', '加载评论失败', err);
        notifyToast({ title: '加载评论失败', icon: 'none' });
      } finally {
        this._loading = false;
        this.setData({ firstLoading: false, loadingMore: false });
      }
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
        });

        const comment = this.data.commentList[idx];
        const replyList = mergeUniqueReplies(comment.replyList, res.list);
        const remainReplies = res.hasMore ? Math.max(0, comment.replyCount - replyList.length) : 0;

        this._updateComment(idx, {
          replyList,
          hasMoreReplies: res.hasMore || false,
          remainReplies: Math.max(0, remainReplies),
          lastId: res.nextCursor ?? undefined, // 改这里
          loadingReplies: false,
        });
      } catch (err) {
        log.error('_loadReplies', '加载回复失败', err);
        this._updateComment(idx, { loadingReplies: false });
      }
    },

    /**
     * 点击“回复”时设置回复目标，并聚焦输入框。
     * 回复目标包含 commentId、nickName、userId。
     */
    onReplyTap(e: WechatMiniprogram.CustomEvent) {
      const { commentId, nickName, userId } = e.currentTarget.dataset as ReplyTarget;
      this.setData({
        inputAutoFocus: true,
        replyTarget: { commentId, nickName, userId },
      });
    },

    /** 取消回复状态，恢复为发布一级评论。 */
    cancelReply() {
      this.setData({
        inputAutoFocus: false,
        replyTarget: { commentId: '', nickName: '', userId: '' },
      });
    },

    /** 原生 textarea 持有输入过程，只在清空或恢复草稿时回写 value，避免逐字回写干扰光标。 */
    onInputChange(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
      const value = e.detail.value || '';
      this._draftValue = value;
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
      if (!this.data.canSend && !this.data.previewImage) return;

      const { replyTarget, previewImage } = this.data;
      const inputValue = this._draftValue;
      const text = inputValue.trim();

      if (!text && !previewImage) {
        notifyToast({ title: '请输入内容', icon: 'none', duration: 1500 });
        return;
      }

      const isReply = !!replyTarget.commentId;

      // 回复状态下不允许图片，保险起见这里也拦一下
      if (isReply && previewImage) {
        notifyToast({ title: '回复暂不支持图片', icon: 'none' });
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
      }
    },

    /** 选择一级评论图片；回复状态下不允许上传图片。 */
    async onChooseImage() {
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
      if (idx === -1) return;
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

      const confirmed = await wxShowModal({
        title: '确认删除',
        content: '删除后无法恢复，确定要删除吗？',
        confirmColor: '#e02020',
      }).then((res) => res.confirm);

      if (!confirmed) return;

      try {
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
      void wxNavigateTo({
        url: `/subpkg_user/pages/user/user?userId=${encodeURIComponent(userId)}`,
      });
    },

    /** 对外暴露的刷新方法，供父组件通过 selectComponent 调用。 */
    refresh() {
      void this._loadComments(true);
    },
  },
});
