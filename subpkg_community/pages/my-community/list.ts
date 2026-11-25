import { POST_CAPABILITIES } from '../../../config/post-capabilities';
import type { PostLifecycle, PostType } from '../../../types/post-contract';
import { community } from '../../../services/post-community';
import { getCurrentIdentity, watchCurrentIdentity } from '../../../actions/current-user';
import { lifecycleLabel, commentLabel, reportLabel } from '../../../utils/post-community';
import { getErrorMessage, showErrorToast } from '../../../utils/notify';
import { storage, STORAGE_KEYS } from '../../../utils/storage';
import { pendingPostCreation, recoverPostCreation } from '../../../actions/post-creation';
import { formatTime, TimeStyle } from '../../../utils/time-util';

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

interface Row {
  id: string;
  title: string;
  text: string;
  status: string;
  statusTone: StatusTone;
  typeLabel: string;
  category: string;
  image: string;
  available: boolean;
  timeLabel: string;
}

const RECORD_TABS = [
  { key: 'posts', label: '帖子' },
  { key: 'comments', label: '评论' },
  { key: 'favorites', label: '收藏' },
  { key: 'history', label: '浏览' },
  { key: 'reports', label: '举报' },
] as const;

type RecordKind = (typeof RECORD_TABS)[number]['key'];

function emptyCopy(kind: RecordKind, postType: string) {
  const qa = postType === 'MENTOR_QA';
  return {
    posts: {
      emptyTitle: qa ? '还没有提问' : '还没有发帖',
      emptyDescription: qa
        ? '发布问题后，可以在这里查看进度。'
        : '发帖后，可以在这里查看发布状态。',
    },
    comments: {
      emptyTitle: qa ? '还没有回答或讨论' : '还没有评论',
      emptyDescription: '参与讨论后，相关内容会显示在这里。',
    },
    favorites: {
      emptyTitle: '还没有收藏',
      emptyDescription: '收藏的社区内容可以在这里找回。',
    },
    history: {
      emptyTitle: '还没有浏览记录',
      emptyDescription: '最近看过的帖子会显示在这里。',
    },
    reports: {
      emptyTitle: '还没有举报记录',
      emptyDescription: '提交举报后，可以在这里查看处理进度。',
    },
  }[kind];
}

function postTitle(title: string | null | undefined, postType?: string): string {
  return title?.trim() ? title.trim() : postType === 'MENTOR_QA' ? '导师提问' : '社区动态';
}

function postContent(content?: string): string {
  if (!content) return '图片动态';
  return content;
}

function postTypeLabel(postType?: string): string {
  if (postType === 'MENTOR_QA') return '导师答疑';
  if (postType === 'NORMAL') return '普通社区';
  return '社区记录';
}

function formatRecordTime(value: string): string {
  if (!value) return '时间待确认';
  return Number.isFinite(Date.parse(value.replace(' ', 'T')))
    ? formatTime(value, TimeStyle.SHORT_YMDHM)
    : value;
}

function lifecycleTone(lifecycle: PostLifecycle): StatusTone {
  if (lifecycle.authorDeleted || lifecycle.adminHidden || lifecycle.safety === 'REJECTED')
    return 'danger';
  if (
    lifecycle.visibility === 'PUBLIC' &&
    lifecycle.effectiveVersion &&
    lifecycle.effectiveVersion === lifecycle.submissionVersion
  )
    return 'success';
  return 'warning';
}
Page({
  _generation: 0,
  _alive: true,
  _owner: '',
  _off: null as (() => void) | null,
  _failedReset: true,
  data: {
    postType: 'NORMAL',
    qaEnabled: POST_CAPABILITIES.mentorQa && POST_CAPABILITIES.communityV1,
    tabs: RECORD_TABS,
    kind: 'posts' as RecordKind,
    ...emptyCopy('posts', 'NORMAL'),
    rows: [] as Row[],
    cursor: '',
    hasMore: true,
    loading: false,
    error: '',
    failedReset: true,
    recovering: false,
    removingId: '',
    pendingPost: false,
    pendingComment: false,
  },
  onLoad(query: { kind?: string; postType?: string }) {
    const kind = RECORD_TABS.find((tab) => tab.key === query.kind)?.key ?? 'posts';
    const postType =
      query.postType === 'MENTOR_QA' || query.postType === 'ALL' ? query.postType : 'NORMAL';
    this.setData({ kind, postType, ...emptyCopy(kind, postType) });
    this._owner = getCurrentIdentity().id;
    this._off = watchCurrentIdentity(() => {
      if (this._owner === getCurrentIdentity().id) return;
      this._owner = getCurrentIdentity().id;
      ++this._generation;
      this.setData({
        rows: [],
        cursor: '',
        hasMore: true,
        loading: false,
        error: '',
        removingId: '',
        pendingPost: false,
        pendingComment: false,
      });
      if (this._owner) void this.load(true);
    });
  },
  onShow() {
    void this.load(true);
  },
  onUnload() {
    this._alive = false;
    ++this._generation;
    this._off?.();
  },
  onPullDownRefresh() {
    void this.load(true).finally(() => wx.stopPullDownRefresh());
  },
  onReachBottom() {
    if (this.data.hasMore && !this.data.error) void this.load(false);
  },
  async load(reset: boolean) {
    if (!reset && (this.data.loading || !this.data.hasMore)) return;
    const generation = reset ? ++this._generation : this._generation;
    const owner = getCurrentIdentity().id,
      token = storage.get(STORAGE_KEYS.TOKEN);
    if (!owner) {
      this.setData({ rows: [], loading: false, error: '请先登录后查看社区记录' });
      return;
    }
    this.setData({
      loading: true,
      error: '',
      pendingPost: !!pendingPostCreation('post'),
      pendingComment: !!pendingPostCreation('comment'),
    });
    const cursor = reset ? undefined : this.data.cursor || undefined;
    if (this.data.postType !== 'NORMAL' && !this.data.qaEnabled) {
      this.setData({ loading: false, error: '答疑记录暂未开放' });
      return;
    }
    const postType =
      this.data.qaEnabled && ['NORMAL', 'MENTOR_QA', 'ALL'].includes(this.data.postType)
        ? (this.data.postType as PostType | 'ALL')
        : undefined;
    try {
      let rows: Row[], hasMore: boolean, nextCursor: string | undefined;
      switch (this.data.kind) {
        case 'posts': {
          const page = await community.myPosts(cursor, postType);
          rows = page.items.map((x) => ({
            id: x.submission.id,
            title: postTitle(x.post.title, x.post.postType),
            text: postContent(x.post.content),
            image: x.post.attachments[0]?.url ?? '',
            status: lifecycleLabel(x.submission.lifecycle),
            statusTone: lifecycleTone(x.submission.lifecycle),
            typeLabel: postTypeLabel(x.post.postType),
            category: x.post.category?.name ?? '',
            available: true,
            timeLabel: `提交于 ${formatRecordTime(x.submission.lifecycle.acceptedAt)}`,
          }));
          ({ hasMore, nextCursor } = page);
          break;
        }
        case 'comments': {
          const page = await community.myComments(cursor, postType);
          rows = page.items.map((x) => ({
            id: x.submission.id,
            title:
              x.kind === 'MENTOR_ANSWER'
                ? '正式导师回答'
                : x.kind === 'DISCUSSION'
                  ? '普通讨论'
                  : '我的评论',
            text: x.content || '图片评论',
            image: x.imageUrl ?? '',
            status: commentLabel(x.submission),
            statusTone:
              x.submission.safety === 'REJECTED'
                ? 'danger'
                : x.submission.visibility === 'PUBLIC' && x.submission.safety === 'PASSED'
                  ? 'success'
                  : 'warning',
            typeLabel: postTypeLabel(
              x.submission.postType ??
                (this.data.postType === 'ALL' ? undefined : this.data.postType),
            ),
            category: '',
            available: true,
            timeLabel: `提交于 ${formatRecordTime(x.submission.acceptedAt)}`,
          }));
          ({ hasMore, nextCursor } = page);
          break;
        }
        case 'reports': {
          const page = await community.reports(cursor);
          rows = page.list.map((x) => ({
            id: x.id,
            title: '举报处理记录',
            text: x.resultSummary ?? '举报已提交，可打开查看处理进展。',
            image: '',
            status: reportLabel(x.outcome),
            statusTone: x.outcome === 'PENDING' ? 'warning' : 'neutral',
            typeLabel: '社区举报',
            category: '',
            available: true,
            timeLabel: `提交于 ${formatRecordTime(x.createdAt)}`,
          }));
          hasMore = page.hasMore;
          nextCursor = page.nextCursor ?? undefined;
          break;
        }
        default: {
          const page =
            this.data.kind === 'favorites'
              ? await community.favorites(cursor, postType)
              : await community.history(cursor, postType);
          rows = page.items
            .filter(
              (x) =>
                this.data.kind !== 'history' ||
                (typeof x.expiresAt === 'string' && Date.parse(x.expiresAt) > Date.now()),
            )
            .map((x) => {
              const available =
                x.availability === 'AVAILABLE' &&
                !!x.post &&
                ['NORMAL', 'MENTOR_QA'].includes(x.post.postType ?? '') &&
                (this.data.postType === 'ALL' || x.post.postType === this.data.postType);
              const postType = available ? x.post?.postType : undefined;
              return {
                id: x.postId,
                title: available ? postTitle(x.post?.title, postType) : '内容已失效',
                text: available
                  ? postContent(x.post?.content)
                  : '原内容已删除、下架或当前不可访问。',
                image: available ? (x.post?.attachments[0]?.url ?? '') : '',
                status: available ? '' : '原内容不可访问',
                statusTone: 'neutral',
                typeLabel: available ? postTypeLabel(postType) : '内容记录',
                category: available ? (x.post?.category?.name ?? '') : '',
                available,
                timeLabel: `${this.data.kind === 'favorites' ? '收藏于' : '浏览于'} ${formatRecordTime(x.lastViewedAt ?? x.favoritedAt ?? '')}`,
              };
            });
          ({ hasMore, nextCursor } = page);
        }
      }
      if (
        !this._alive ||
        generation !== this._generation ||
        owner !== getCurrentIdentity().id ||
        token !== storage.get(STORAGE_KEYS.TOKEN)
      )
        return;
      if (hasMore && (!nextCursor || nextCursor === cursor))
        throw new Error('分页信息异常，请刷新后重试');
      const existing = reset ? [] : this.data.rows;
      const ids = new Set(existing.map((x) => x.id));
      this.setData({
        rows: [
          ...existing,
          ...rows.filter((x) => {
            if (ids.has(x.id)) return false;
            ids.add(x.id);
            return true;
          }),
        ],
        cursor: nextCursor ?? '',
        hasMore,
      });
    } catch (error) {
      if (this._alive && generation === this._generation) {
        this._failedReset = reset;
        this.setData({
          error: getErrorMessage(error, '记录查询失败，请重试'),
          failedReset: reset,
        });
      }
    } finally {
      if (this._alive && generation === this._generation) this.setData({ loading: false });
    }
  },
  onRecordKind(e: WechatMiniprogram.TouchEvent) {
    const kind = RECORD_TABS.find((tab) => tab.key === e.currentTarget.dataset.kind)?.key;
    if (!kind || kind === this.data.kind) return;
    this.setData({
      kind,
      ...emptyCopy(kind, this.data.postType),
      rows: [],
      cursor: '',
      hasMore: true,
    });
    void this.load(true);
  },
  onPostType(e: WechatMiniprogram.TouchEvent) {
    const postType = String(e.currentTarget.dataset.type ?? '');
    if (!['NORMAL', 'MENTOR_QA', 'ALL'].includes(postType) || this.data.postType === postType)
      return;
    this.setData({
      postType,
      ...emptyCopy(this.data.kind, postType),
      rows: [],
      cursor: '',
      hasMore: true,
    });
    void this.load(true);
  },
  more() {
    void this.load(false);
  },
  refresh() {
    void this.load(true);
  },
  retry() {
    void this.load(this._failedReset);
  },
  open(e: WechatMiniprogram.TouchEvent) {
    const row = this.data.rows.find((x) => x.id === e.currentTarget.dataset.id);
    if (!row?.available) return;
    const kind = (
      { posts: 'post', comments: 'comment', reports: 'report' } as Record<string, string>
    )[this.data.kind];
    void wx.navigateTo({
      url: kind
        ? `/subpkg_community/pages/my-community/detail?kind=${kind}&id=${encodeURIComponent(row.id)}&fromKind=${this.data.kind}&postType=${this.data.postType}`
        : `/subpkg_community/pages/detail/detail?postId=${encodeURIComponent(row.id)}`,
    });
  },
  async removeFavorite(e: WechatMiniprogram.TouchEvent) {
    if (this.data.loading || this.data.removingId) return;
    const postId = String(e.currentTarget.dataset.id ?? '');
    const generation = this._generation;
    this.setData({ removingId: postId });
    try {
      await community.setFavorite(postId, false);
      if (this._alive && generation === this._generation) await this.load(true);
    } catch (error) {
      showErrorToast(error, { fallback: '取消收藏失败，请重新查询状态' });
    } finally {
      if (this._alive && this.data.removingId === postId) this.setData({ removingId: '' });
    }
  },
  canClearHistory(generation: number) {
    return this._alive && generation === this._generation && !this.data.loading;
  },
  async clearHistory() {
    if (this.data.loading) return;
    const generation = this._generation;
    const confirm = await wx.showModal({
      title: '清空最近浏览？',
      content: '清除本人全部帖子浏览历史，不会撤销公开浏览统计。',
      confirmText: '清空',
    });
    if (!confirm.confirm || !this.canClearHistory(generation)) return;
    this.setData({ loading: true });
    try {
      await community.clearHistory();
      if (this._alive && generation === this._generation) await this.load(true);
    } catch (error) {
      showErrorToast(error, { fallback: '清空结果未确认，请刷新历史' });
    } finally {
      if (this._alive && generation === this._generation) this.setData({ loading: false });
    }
  },
  async recover(e: WechatMiniprogram.TouchEvent) {
    if (this.data.recovering) return;
    const kind = e.currentTarget.dataset.kind === 'comment' ? 'comment' : 'post';
    const generation = this._generation;
    this.setData({ recovering: true });
    try {
      const submission = await recoverPostCreation(kind);
      if (this._alive && generation === this._generation)
        void wx.navigateTo({
          url: `/subpkg_community/pages/my-community/detail?kind=${kind}&id=${encodeURIComponent(submission.id)}&postType=${this.data.postType}`,
        });
    } catch {
      if (this._alive && generation === this._generation)
        this.setData({
          error:
            '提交结果仍未确认。收据暂无记录不代表提交失败，请稍后再核对或查看本人列表，勿重复提交。',
        });
    } finally {
      if (this._alive && generation === this._generation) this.setData({ recovering: false });
    }
  },
});
