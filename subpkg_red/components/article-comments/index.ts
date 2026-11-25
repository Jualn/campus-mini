import defineComponent from '../../../utils/defineComponent';
import { getCurrentIdentity, watchCurrentIdentity } from '../../../actions/current-user';
import {
  createCommentAuthor,
  isCurrentUser,
} from '../../../components/comment-panel/comment-model';
import { formatTime, TimeStyle } from '../../../utils/time-util';
import {
  articleError,
  listComments,
  createComment,
  deleteComment,
  setLike,
  type Comment,
} from '../../services/article';
import { isHttpError } from '../../../utils/error';
type CommentView = Comment & {
  own: boolean;
  avatarChar: string;
  avatarBg: string;
  date: string;
  replyToName?: string;
  localPreview?: boolean;
};

function resolveReplyNames(replies: CommentView[]): CommentView[] {
  const authors = new Map(replies.map((reply) => [reply.id, reply.author.nickname]));
  return replies.map((reply) => ({
    ...reply,
    replyToName: reply.replyToCommentId ? authors.get(reply.replyToCommentId) ?? '' : '',
  }));
}
function view(c: Comment): CommentView {
  const a = createCommentAuthor({
    userId: c.author.userId,
    nickName: c.author.nickname,
    avatarUrl: c.author.avatarUrl ?? '',
  });
  return {
    ...c,
    own: isCurrentUser(getCurrentIdentity().id, c.author.userId),
    avatarChar: a.avatarChar,
    avatarBg: a.avatarBg,
    date: formatTime(c.createdAt, TimeStyle.POST),
  };
}
interface Private {
  _localComments?: Map<string, CommentView>;
  _owner: string;
  _alive: boolean;
  _generation: number;
  _replyGeneration: number;
  _cursor?: string;
  _replyCursor?: string;
  _retryMore?: boolean;
  _retryRepliesMore?: boolean;
  _pending: Set<string>;
  _likeUpdates: Map<string, { liked: boolean; likeCount: number }>;
  _off?: () => void;
}
defineComponent<Private>()({
  properties: {
    articleId: { type: String, value: '' },
    enabled: { type: Boolean, value: true },
    writeReady: { type: Boolean, value: true },
    totalCount: { type: Number, value: 0 },
    focusCommentId: { type: String, value: '' },
  },
  data: {
    comments: [] as CommentView[],
    replies: [] as CommentView[],
    loading: false,
    error: '',
    hasMore: false,
    repliesLoading: false,
    repliesError: '',
    repliesMore: false,
    rootId: '',
    draft: '',
    draftEmpty: true,
    composing: false,
    inputFocus: false,
    keyboardBottom: 0,
    inputHeightRpx: 44,
    selfAvatar: createCommentAuthor({}),
    replyToId: '',
    replyName: '',
    sending: false,
    closed: false,
  },
  lifetimes: {
    attached() {
      this._alive = true;
      this._generation = 0;
      this._replyGeneration = 0;
      this._pending = new Set();
      this._likeUpdates = new Map();
      this._owner = getCurrentIdentity().id;
      this._off = watchCurrentIdentity(() => {
        const user = getCurrentIdentity();
        const accountChanged = this._owner !== user.id;
        this._owner = user.id;
        if (accountChanged) this._localComments?.clear();
        if (this._alive)
          this.setData({
            ...(accountChanged
              ? {
                  draft: '',
                  draftEmpty: true,
                  composing: false,
                  inputFocus: false,
                  keyboardBottom: 0,
                  inputHeightRpx: 44,
                  replyToId: '',
                  replyName: '',
                }
              : {}),
            selfAvatar: createCommentAuthor({
              userId: user.id,
              nickName: user.nickname,
              avatarUrl: user.avatarUrl,
            }),
            comments: this.data.comments.map(view),
            replies: this.data.replies.map(view),
          });
      });
      void this.load();
    },
    detached() {
      this._alive = false;
      ++this._generation;
      ++this._replyGeneration;
      this._off?.();
    },
  },
  pageLifetimes: {
    hide() {
      this.setData({ composing: false, inputFocus: false, keyboardBottom: 0 });
    },
  },
  observers: {
    enabled: function (enabled: boolean) {
      if (enabled) this.setData({ closed: false });
      else this.setData({ composing: false, inputFocus: false, keyboardBottom: 0 });
    },
  },
  methods: {
    noop() {
      // Keep background touch gestures inside the composer mask.
    },
    feedback(e: unknown) {
      if (!this._alive) return;
      // A 404 can refer to a deleted comment/root, so ask the Page to recheck
      // the Article instead of declaring that the whole article was removed.
      if (isHttpError(e) && e.statusCode === 404) this.triggerEvent('changed');
      if (isHttpError(e) && e.problemType === '/problems/comments-disabled') {
        this.setData({ closed: true, composing: false, inputFocus: false, keyboardBottom: 0 });
        this.triggerEvent('disabled');
      }
      void wx.showToast({
        title:
          isHttpError(e) && e.statusCode === 404 ? '评论或文章已不可用，请刷新' : articleError(e),
        icon: 'none',
      });
    },
    async load(more = false) {
      if (more && (this.data.loading || !this.data.hasMore)) return;
      const generation = ++this._generation;
      const likesAtRequest = new Map(this._likeUpdates);
      this._retryMore = more;
      if (!more) this._cursor = undefined;
      this.setData({ loading: true, error: '' });
      try {
        const page = await listComments(
          this.properties.articleId,
          undefined,
          more ? this._cursor : undefined,
        );
        if (!this._alive || generation !== this._generation) return;
        if (page.items.some((c) => c.parentId !== undefined)) throw new Error('评论线程响应不正确');
        this._cursor = page.nextCursor;
        const incoming = page.items.map((c) => this.projectLoadedComment(c, likesAtRequest)),
          seen = new Set(this.data.comments.map((c) => c.id));
        this.setData({
          comments: this.mergeLocalComments(more
            ? [...this.data.comments, ...incoming.filter((c) => !seen.has(c.id))]
            : incoming, undefined, page.items),
          hasMore: !!page.nextCursor,
        });
        if (
          !more &&
          this.properties.focusCommentId &&
          !page.items.some((c) => c.id === this.properties.focusCommentId)
        )
          void wx.showToast({ title: '评论定位暂不可用，可加载更多或展开回复查找', icon: 'none' });
      } catch (e) {
        if (this._alive && generation === this._generation) {
          this.setData({ error: articleError(e) });
          this.feedback(e);
        }
      } finally {
        if (this._alive && generation === this._generation) this.setData({ loading: false });
      }
    },
    retry() {
      void this.load(this._retryMore);
    },
    more() {
      void this.load(true);
    },
    projectLoadedComment(
      c: Comment,
      likesAtRequest: Map<string, { liked: boolean; likeCount: number }>,
    ) {
      const updated = this._likeUpdates.get(c.id);
      return view(updated && updated !== likesAtRequest.get(c.id) ? { ...c, ...updated } : c);
    },
    mergeLocalComments(rows: CommentView[], parentId: string | undefined, received: Comment[]) {
      for (const row of received) this._localComments?.delete(row.id);
      const local = [...(this._localComments?.values() ?? [])]
        .filter((row) => row.parentId === parentId && !rows.some((item) => item.id === row.id));
      return [...local, ...rows];
    },
    async loadReplies(more = false) {
      if (!this.data.rootId || (more && (this.data.repliesLoading || !this.data.repliesMore)))
        return;
      const generation = ++this._replyGeneration,
        rootId = this.data.rootId;
      const likesAtRequest = new Map(this._likeUpdates);
      this._retryRepliesMore = more;
      if (!more) this._replyCursor = undefined;
      this.setData({ repliesLoading: true, repliesError: '' });
      try {
        const page = await listComments(
          this.properties.articleId,
          rootId,
          more ? this._replyCursor : undefined,
        );
        if (!this._alive || generation !== this._replyGeneration || rootId !== this.data.rootId)
          return;
        if (page.items.some((c) => c.parentId !== rootId)) throw new Error('回复线程响应不正确');
        this._replyCursor = page.nextCursor;
        const seen = new Set(this.data.replies.map((c) => c.id));
        this.setData({
          replies: resolveReplyNames(this.mergeLocalComments(more
            ? [
                ...this.data.replies,
                ...page.items
                  .filter((c) => !seen.has(c.id))
                  .map((c) => this.projectLoadedComment(c, likesAtRequest)),
              ]
            : page.items.map((c) => this.projectLoadedComment(c, likesAtRequest)), rootId, page.items)),
          repliesMore: !!page.nextCursor,
        });
      } catch (e) {
        if (this._alive && generation === this._replyGeneration) {
          this.setData({ repliesError: articleError(e) });
          this.feedback(e);
        }
      } finally {
        if (this._alive && generation === this._replyGeneration)
          this.setData({ repliesLoading: false });
      }
    },
    openThread(event: WechatMiniprogram.TouchEvent) {
      if (this.data.sending) return;
      const rootId = String(event.currentTarget.dataset.id);
      if (rootId === this.data.rootId) {
        this.closeThread();
        return;
      }
      ++this._replyGeneration;
      this.setData({ rootId, replies: [], repliesMore: false, replyToId: '', replyName: '' });
      void this.loadReplies();
    },
    closeThread() {
      if (this.data.sending) return;
      ++this._replyGeneration;
      this.setData({
        rootId: '',
        replies: [],
        replyToId: '',
        replyName: '',
        composing: false,
        keyboardBottom: 0,
        inputFocus: false,
        repliesLoading: false,
      });
    },
    replyMore() {
      void this.loadReplies(true);
    },
    replyRetry() {
      void this.loadReplies(this._retryRepliesMore);
    },
    reply(event: WechatMiniprogram.TouchEvent) {
      if (!this.properties.writeReady || !this.properties.enabled || this.data.closed || this.data.sending)
        return;
      const commentId = String(event.currentTarget.dataset.id),
        rootId = String(event.currentTarget.dataset.root ?? commentId);
      if (this.data.rootId !== rootId) {
        this.setData({ rootId, replies: [], repliesMore: false });
        void this.loadReplies();
      }
      this.setData({
        replyToId: commentId,
        replyName: String(event.currentTarget.dataset.name),
        composing: true,
        inputFocus: true,
      });
    },
    startWriting() {
      if (!this.properties.enabled || !this.properties.writeReady || this.data.closed || this.data.sending)
        return;
      this.setData({ composing: true, inputFocus: true, replyToId: '', replyName: '' });
    },
    blur() {
      this.setData({ inputFocus: false });
    },
    closeComposer() {
      if (this.data.sending) return;
      this.setData({ composing: false, inputFocus: false, keyboardBottom: 0 });
    },
    onKeyboardHeightChange(event: WechatMiniprogram.TextareaKeyboardHeightChange) {
      if (this.data.composing) this.setData({ keyboardBottom: Math.max(0, event.detail.height) });
    },
    onLineChange(event: WechatMiniprogram.TextareaLineChange) {
      const height = Math.max(1, Math.min(4, event.detail.lineCount)) * 44;
      if (height !== this.data.inputHeightRpx) this.setData({ inputHeightRpx: height });
    },
    input(event: WechatMiniprogram.TextareaInput) {
      this.setData({ draft: event.detail.value, draftEmpty: !event.detail.value.trim() });
    },
    async send() {
      const text = this.data.draft.trim();
      if (
        !this.properties.writeReady ||
        !this.properties.enabled ||
        this.data.closed ||
        this.data.sending ||
        !text
      )
        return;
      if (Array.from(text).length > 1000) {
        void wx.showToast({ title: '评论最多1000字', icon: 'none' });
        return;
      }
      const rootId = this.data.replyToId ? this.data.rootId : undefined,
        replyTo = this.data.replyToId || undefined;
      const owner = this._owner;
      const user = getCurrentIdentity();
      const localId = `local-${String(Date.now())}`;
      const local = view({
        id: localId, targetType: 'ARTICLE', targetId: this.properties.articleId,
        content: text,
        author: { userId: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl || null, isPlatformOperator: false },
        createdAt: new Date().toISOString(),
        parentId: rootId, replyToCommentId: replyTo,
        likeCount: 0, liked: false, replyCount: 0,
      });
      local.localPreview = true;
      (this._localComments ??= new Map()).set(localId, local);
      this.setData(rootId
        ? {
            replies: resolveReplyNames([local, ...this.data.replies]),
            comments: this.data.comments.map((root) =>
              root.id === rootId ? { ...root, replyCount: root.replyCount + 1 } : root),
          }
        : { comments: [local, ...this.data.comments] });
      this.triggerEvent('countchange', { delta: 1 });
      this.setData({ sending: true });
      try {
        const accepted = await createComment(this.properties.articleId, text, rootId, replyTo);
        if (!this._alive || this._owner !== owner) return;
        this._localComments.delete(localId);
        this._localComments.set(accepted.id, view(accepted));
        this.setData({
          comments: this.data.comments.map((row) => row.id === localId ? view(accepted) : row),
          replies: resolveReplyNames(this.data.replies.map((row) => row.id === localId ? view(accepted) : row)),
          draft: '', draftEmpty: true, replyToId: '', replyName: '', composing: false, inputFocus: false,
          keyboardBottom: 0, inputHeightRpx: 44,
        });
        this.triggerEvent('changed');
        void this.load();
        if (rootId && rootId === this.data.rootId) void this.loadReplies();
      } catch (e) {
        if (this._alive && this._owner === owner) {
          this._localComments.delete(localId);
          this.setData({
            comments: this.data.comments.filter((row) => row.id !== localId).map((root) =>
              root.id === rootId ? { ...root, replyCount: Math.max(0, root.replyCount - 1) } : root),
            replies: resolveReplyNames(this.data.replies.filter((row) => row.id !== localId)),
          });
          this.triggerEvent('countchange', { delta: -1 });
          this.feedback(e);
        }
      } finally {
        if (this._alive) this.setData({ sending: false });
      }
    },
    async like(event: WechatMiniprogram.TouchEvent) {
      if (!this.properties.writeReady) return;
      const commentId = String(event.currentTarget.dataset.id);
      const c = [...this.data.comments, ...this.data.replies].find((row) => row.id === commentId);
      if (!c || c.localPreview || this._pending.has(commentId)) return;
      this._pending.add(commentId);
      try {
        const state = await setLike('COMMENT', commentId, !c.liked);
        if (!this._alive) return;
        this._likeUpdates.set(commentId, state);
        const patch = (rows: CommentView[]) =>
          rows.map((row) => (row.id === commentId ? { ...row, ...state } : row));
        this.setData({
          comments: patch(this.data.comments),
          replies: patch(this.data.replies),
        });
      } catch (e) {
        this.feedback(e);
      } finally {
        this._pending.delete(commentId);
      }
    },
    remove(event: WechatMiniprogram.TouchEvent) {
      if (!this.properties.writeReady || this.data.sending) return;
      const commentId = String(event.currentTarget.dataset.id);
      const c = [...this.data.comments, ...this.data.replies].find((row) => row.id === commentId);
      if (
        !c ||
        !isCurrentUser(getCurrentIdentity().id, c.author.userId) ||
        this._pending.has(commentId)
      )
        return;
      wx.showModal({
        title: '删除评论',
        content: c.parentId ? '确定删除这条回复吗？' : '删除后该评论及全部回复将不再展示。',
        success: (r) => {
          if (r.confirm && this._alive) void this.deleteConfirmed(c);
        },
      });
    },
    async deleteConfirmed(c: CommentView) {
      if (!this.properties.writeReady || this.data.sending) return;
      if (this._pending.has(c.id)) return;
      this._pending.add(c.id);
      try {
        await deleteComment(this.properties.articleId, c.id);
        if (!this._alive) return;
        ++this._generation;
        ++this._replyGeneration;
        this._likeUpdates.delete(c.id);
        this._localComments?.delete(c.id);
        this.setData({
          comments: this.data.comments
            .filter((row) => row.id !== c.id)
            .map((row) =>
              row.id === c.parentId ? { ...row, replyCount: Math.max(0, row.replyCount - 1) } : row,
            ),
          replies: resolveReplyNames(this.data.replies.filter((row) => row.id !== c.id)),
          loading: false,
          repliesLoading: false,
        });
        if (this.data.rootId === c.id) this.closeThread();
        this.triggerEvent('countchange', { delta: -(1 + (c.parentId ? 0 : c.replyCount)) });
        this.triggerEvent('changed');
        void this.load();
        if (this.data.rootId) void this.loadReplies();
      } catch (e) {
        this.feedback(e);
      } finally {
        this._pending.delete(c.id);
      }
    },
  },
});
