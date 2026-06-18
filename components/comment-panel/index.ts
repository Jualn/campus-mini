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
import { commentService, interactService } from '../../services/index';
import {
  wxNavigateTo,
  wxOnKeyboardHeightChange,
  wxPreviewImage,
  wxShowModal,
  wxShowToast,
} from '../../utils/wx-promise';
import { TARGET_TYPES, type TargetType } from '../../utils/constants';
import type { CommentItem, ReplyItem, ReplyTarget } from '../../types/business';
import { getUserInfo } from '../../store/helper';
import createLogger from '../../utils/logger';
import { getAvatarInfo } from '../../utils/avatar';
import { useSheet } from '../../behaviors/sheet-mixin';

// ==================== 类型 ======================

// 私有属性定义
interface Private {
  _loading: boolean;
  _safeBottom: number;
  _lastTargetId?: string;
  _commentLikePendingMap: Record<string, boolean>;
  _replyLikePendingMap: Record<string, boolean>;
}

// ===================== 常量 =====================

const log = createLogger('CommentPanel');

const SELF_USER = {
  userId: getUserInfo('id'),
  nickName: getUserInfo('nickname') ?? '我',
  avatarBg: getAvatarInfo(getUserInfo('nickname') ?? '').bg,
  avatarChar: getAvatarInfo(getUserInfo('nickname') ?? '').char,
  avatarUrl: getUserInfo('avatarUrl') ?? '',
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
    inputFocused: false,
    inputAutoFocus: false,
    previewImage: '',
    replyTarget: {} as ReplyTarget,
    keyboardOpen: false,
    keyboardBottom: 0,
    selfAvatarBg: SELF_USER.avatarBg,
    selfAvatarChar: SELF_USER.avatarChar,
    selfAvatarUrl: SELF_USER.avatarUrl,
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
        previewImage: '',
        canSend: false,
        currentTotalCount: Math.max(0, this.properties.totalCount || 0),
      });

      if (this.properties.mode === 'inline' || this.properties.visible) {
        void this._loadComments(true);
      }
    },
  },

  lifetimes: {
    attached() {
      // 私有字段初始化
      this._loading = false;
      this._safeBottom = 0;
      this._lastTargetId = undefined;
      this._commentLikePendingMap = {};
      this._replyLikePendingMap = {};

      const info = wx.getWindowInfo();
      const safeBottom = info.screenHeight - info.safeArea.bottom;
      this._safeBottom = safeBottom;

      this.setData({
        keyboardBottom: safeBottom,
        currentTotalCount: Math.max(0, this.properties.totalCount || 0),
      });

      wxOnKeyboardHeightChange((res) => {
        const kbHeight = res.height || 0;
        this.setData({
          keyboardBottom: kbHeight > 0 ? kbHeight : safeBottom,
          keyboardOpen: kbHeight > 0,
        });
      });
    },

    ready() {
      /* empty */
    },

    detached() {
      wx.offKeyboardHeightChange();

      // 私有字段重置（以防万一，虽然下次 attached 会重新赋值）
      this._loading = false;
      this._safeBottom = 0;
      this._lastTargetId = undefined;
      this._commentLikePendingMap = {};
      this._replyLikePendingMap = {};
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
        const res = await commentService.getCommentList({
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
        void wxShowToast({ title: '加载评论失败', icon: 'none' });
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
        const res = await commentService.getReplyList({
          targetId: targetId,
          targetType: targetType as TargetType, // 4 表示获取该评论的回复
          parentId: parentId,
          pageSize: 20,
          lastId: lastId ?? undefined,
        });

        const comment = this.data.commentList[idx];
        const existIds = new Set(comment.replyList.map((r) => r.replyId));
        const newReplies = res.list.filter((r) => !existIds.has(r.replyId));

        const replyList = [...comment.replyList, ...newReplies];
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

    /** 输入框内容变化时更新 inputValue 和 canSend。 */
    onInputChange(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
      const value = e.detail.value || '';
      this.setData({ inputValue: value, canSend: value.trim().length > 0 });
    },

    /** 输入框聚焦时记录键盘高度，保证输入区不被遮挡。 */
    onInputFocus(e: WechatMiniprogram.CustomEvent<{ height: number }>) {
      this.setData({ inputFocused: true });
      const h = e.detail.height || 0;
      if (h > 0) this.setData({ keyboardBottom: h, keyboardOpen: true });
    },

    /** 输入框失焦时恢复底部安全距离和键盘状态。 */
    onInputBlur() {
      this.setData({
        inputAutoFocus: false,
        inputFocused: false,
        keyboardBottom: this._safeBottom || 0,
        keyboardOpen: false,
      });
    },

    /**
     * 发送评论或回复。
     * 内部采用乐观更新：先插入本地临时评论，再请求后端；
     * 请求失败时回滚评论列表、输入框状态和评论总数。
     */
    async onSend() {
      if (!this.data.canSend) return;
      const { inputValue, replyTarget, previewImage } = this.data;
      const text = inputValue.trim();

      if (!text && !previewImage) {
        void wxShowToast({ title: '请输入内容', icon: 'none', duration: 1500 });
        return;
      }

      const params = {
        targetId: this.properties.targetId,
        targetType: this.properties.targetType as TargetType,
        content: text,
        imageUrl: previewImage || '',
        parentId: replyTarget.commentId ? replyTarget.commentId : undefined,
      };

      const isReply = !!replyTarget.commentId;
      const tempId = `local-${Date.now().toString()}`;
      const nowLabel = '刚刚';
      const prevInputState = {
        inputValue,
        previewImage,
        canSend: this.data.canSend,
        replyTarget: { ...replyTarget },
        inputAutoFocus: this.data.inputAutoFocus,
        inputFocused: this.data.inputFocused,
      };

      const restoreInputState = () => {
        this.setData({
          inputValue: prevInputState.inputValue,
          previewImage: prevInputState.previewImage,
          canSend: prevInputState.canSend,
          replyTarget: prevInputState.replyTarget,
          inputAutoFocus: prevInputState.inputAutoFocus,
          inputFocused: prevInputState.inputFocused,
        });
      };

      let rollback: () => void;
      let applyServerId: (realId: string) => void;

      if (isReply) {
        const cidx = this._findCommentIdx(replyTarget.commentId);
        if (cidx === -1) {
          void wxShowToast({ title: '评论已失效，请刷新后重试', icon: 'none' });
          return;
        }

        const comment = this.data.commentList[cidx];
        const prevReplyList = [...comment.replyList];
        const prevReplyPreview = [...(comment.replyPreview ?? [])];
        const prevReplyCount = comment.replyCount;
        const prevRemainReplies = comment.remainReplies;
        const prevHasMoreReplies = comment.hasMoreReplies;
        const prevRepliesExpanded = comment.repliesExpanded;

        const optimisticReply: ReplyItem = {
          replyId: tempId,
          userId: SELF_USER.userId ?? '',
          nickName: SELF_USER.nickName || '我',
          content: text,
          avatarUrl: SELF_USER.avatarUrl || '',
          createTime: nowLabel,
          likeCount: 0,
          isLiked: false,
          replyToName: replyTarget.nickName || '',
          _avatarChar: SELF_USER.avatarChar,
          _avatarBg: SELF_USER.avatarBg,
        };

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
        const optimisticComment: CommentItem = {
          commentId: tempId,
          userId: SELF_USER.userId ?? '',
          nickName: SELF_USER.nickName || '我',
          content: text,
          avatarUrl: SELF_USER.avatarUrl || '',
          imageUrl: previewImage || '',
          createTime: nowLabel,
          likeCount: 0,
          isLiked: false,
          replyCount: 0,
          replyPreview: [],
          replyList: [],
          repliesExpanded: true,
          hasMoreReplies: false,
          loadingReplies: false,
          remainReplies: 0,
          lastId: '',
          _avatarChar: SELF_USER.avatarChar,
          _avatarBg: SELF_USER.avatarBg,
        };

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

      this.setData({ inputValue: '', previewImage: '', canSend: false });
      this.cancelReply();
      this._syncCount(1);

      try {
        const res = await commentService.createComment(params);
        if (!res) {
          void wxShowToast({ title: '发送失败', icon: 'none' });
          rollback();
          return;
        }

        void wxShowToast({ title: '发布成功', icon: 'success', duration: 1500 });
        applyServerId(res);
      } catch (error) {
        rollback();
        void wxShowToast({ title: '发送失败', icon: 'none' });
        log.error('onSend', '发送评论失败', error);
      }
    },

    /** 选择一级评论图片；回复状态下不允许上传图片。 */
    onChooseImage() {
      if (this.data.replyTarget.commentId) return;
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          this.setData({ previewImage: res.tempFiles[0].tempFilePath });
        },
      });
    },

    /** 移除待发送的图片。 */
    removeImage() {
      this.setData({ previewImage: '' });
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
        if (isLiked) {
          await interactService.unlike({
            targetType: TARGET_TYPES.COMMENT.value,
            targetId: commentId,
          });
        } else {
          await interactService.like({
            targetType: TARGET_TYPES.COMMENT.value,
            targetId: commentId,
          });
        }
      } catch (err) {
        log.error('onCommentLike', '点赞失败', err);
        void wxShowToast({ title: '点赞失败, 请稍后再试！', icon: 'none' });
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
        if (isLiked) {
          await interactService.unlike({
            targetType: TARGET_TYPES.COMMENT.value,
            targetId: replyId,
          });
        } else {
          await interactService.like({ targetType: TARGET_TYPES.COMMENT.value, targetId: replyId });
        }
      } catch (err) {
        log.error('onReplyLike', '同步点赞状态失败', err);
        void wxShowToast({ title: '操作失败,请稍后再试！', icon: 'none' });
        newReplyList[ridx] = reply; // 恢复原始 reply 对象
        this._updateComment(cidx, { replyList: newReplyList });
      } finally {
        this._replyLikePendingMap[replyId] = false;
      }

      // TODO: 实现回复点赞功能
      // const res = await api.toggleLike(
      //   this.properties.targetId,
      //   'reply',
      //   replyId,
      //   isLiked
      // );
      // if (res.code !== 0) {
      //   newReplyList[ridx] = reply;
      //   this._updateComment(cidx, { replyList: newReplyList });
      // }
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
        void wxShowToast({ title: '举报对象不存在', icon: 'none' });
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
          // TODO: 调用评论删除接口
          await commentService.removeComment(commentId);

          // 接口成功后，从本地列表移除该评论
          const deletedComment = this.data.commentList.find((c) => c.commentId === commentId);
          const deletedCount = 1 + (deletedComment?.replyCount ?? 0);

          const list = this.data.commentList.filter((c) => c.commentId !== commentId);
          this.setData({ commentList: list });
          this._syncCount(-deletedCount); // 通知父组件数量 -当前评论加当前评论的子评论
        } else {
          // TODO: 调用回复删除接口（若有单独接口）
          await commentService.removeComment(replyId);

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

        void wxShowToast({ title: '已删除', icon: 'success' });
      } catch (err) {
        void wxShowToast({ title: '删除失败，请稍后再试', icon: 'none' });
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
      const prefix = `commentList[${idx.toString()}]`;
      const updates: Record<string, unknown> = {};
      Object.keys(fields).forEach((k) => {
        updates[`${prefix}.${k}`] = fields[k as keyof CommentItem];
      });
      this.setData(updates);
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

      const nextCount = Math.max(0, current + delta);

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
      const currentUserId = SELF_USER.userId;
      return !!currentUserId && currentUserId === userId;
    },

    /** 跳转到用户主页。 */
    goToUser(e: WechatMiniprogram.TouchEvent) {
      const { userId } = e.currentTarget.dataset as { userId: string };
      void wxNavigateTo({ url: `/subpkg_user/pages/user/user?userId=${userId}` });
    },

    /** 对外暴露的刷新方法，供父组件通过 selectComponent 调用。 */
    refresh() {
      void this._loadComments(true);
    },
  },
});
