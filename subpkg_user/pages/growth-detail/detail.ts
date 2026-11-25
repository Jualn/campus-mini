import { isReadAccessError } from '../../../utils/error';
import { formatTime, TimeStyle } from '../../../utils/time-util';
import definePage from '../../../utils/definePage';
import { getCurrentIdentity, watchCurrentAccount } from '../../../actions/current-user';
import { getMyPersonBinding, watchPersonBinding } from '../../../services/person-binding';
import { community } from '../../../services/post-community';
import { wxShowModal, wxShowActionSheet } from '../../../utils/wx-promise';
import {
  getGrowth,
  growthError,
  resourceId,
  presentation,
  deleteGrowth,
  toggleGrowthLike,
  getGrowthLikeState,
  type GrowthRecord,
  type GrowthAction,
} from '../../services/growth-record';
import { downloadGrowthMedia, removeLocalMedia } from '../../services/growth-media';
import { resolveContentTitle } from '../../../utils/content-presentation';
definePage({
  data: {
    record: null as GrowthRecord | null,
    view: null as (ReturnType<typeof presentation> & { displayTitle: string }) | null,
    loading: false,
    busy: false,
    opening: false,
    error: '',
    feedback: '',
    publishedAtText: '',
    videoPath: '',
    commentId: '',
    canEdit: false,
    canDelete: false,
    canComment: false,
    canLike: false,
    liked: false,
    likeReady: false,
    favorited: false,
    favoriteReady: false,
    canFavorite: false,
    canReport: false,
    canShare: false,
    reportVisible: false,
    reportTargetId: '',
    reportTargetType: 'POST',
    commentPermission: { state: 'ALLOWED', reason: 'NONE' },
  },
  _id: '',
  _generation: 0,
  _mediaEpoch: 0,
  _visible: false,
  _previewing: false,
  _downloads: [] as string[],
  _downloadTask: null as WechatMiniprogram.DownloadTask | null,
  _off: null as (() => void) | null,
  _offBinding: null as (() => void) | null,
  _timer: null as ReturnType<typeof setTimeout> | null,
  onLoad(query: { postId?: string; commentId?: string }) {
    this._downloads = [];
    try {
      this._id = resourceId(query.postId);
      if (query.commentId) this.setData({ commentId: resourceId(query.commentId) });
    } catch (e) {
      this.setData({ error: growthError(e) });
    }
    this._off = watchCurrentAccount(() => {
      this.invalidate();
    });
    this._offBinding = watchPersonBinding(() => {
      this.invalidate();
    });
    void wx.hideShareMenu();
  },
  invalidate() {
    ++this._generation;
    this.clearMedia();
    this.clearTimer();
    this.setData({ record: null, view: null, reportVisible: false, feedback: '', busy: false });
    if (this._visible) void this.load();
  },
  clearMedia() {
    ++this._mediaEpoch;
    this._downloadTask?.abort();
    this._downloadTask = null;
    this.setData({ videoPath: '', opening: false });
    if (!this._previewing) {
      for (const p of this._downloads) removeLocalMedia(p);
      this._downloads = [];
    }
  },
  clearTimer() {
    if (this._timer !== null) clearTimeout(this._timer);
    this._timer = null;
  },
  onShow() {
    this._visible = true;
    this._previewing = false;
    void this.load();
  },
  onHide() {
    this._visible = false;
    ++this._generation;
    this.clearTimer();
    this.clearMedia();
    this.setData({ record: null, view: null, reportVisible: false, busy: false });
  },
  onUnload() {
    this._visible = false;
    ++this._generation;
    this._previewing = false;
    this.clearTimer();
    this.clearMedia();
    this._off?.();
    this._offBinding?.();
  },
  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },
  refresh() {
    if (!this.data.busy && !this.data.opening) void this.load(true);
  },
  isCurrent(generation: number) {
    return this._visible && generation === this._generation;
  },
  async load(preserve = false) {
    if (!this._id || !this._visible || this.data.busy) return;
    const generation = ++this._generation;
    this.clearTimer();
    this.clearMedia();
    this.setData({
      loading: true,
      error: '',
      likeReady: false,
      favoriteReady: false,
      ...(preserve ? {} : { record: null, view: null }),
    });
    try {
      await getMyPersonBinding();
      if (!this.isCurrent(generation)) return;
      const r = await getGrowth(this._id);
      if (!this.isCurrent(generation)) return;
      const a = r.availableActions;
      this.setData({
        record: r,
        view: { ...presentation(r), displayTitle: resolveContentTitle(r.title, r.content) },
        publishedAtText: formatTime(r.publishedAt, TimeStyle.FULL),
        canEdit: a.includes('EDIT'),
        canDelete: a.includes('DELETE'),
        canComment: a.includes('COMMENT'),
        canLike: a.includes('LIKE'),
        canFavorite: a.includes('FAVORITE'),
        canReport: a.includes('REPORT'),
        canShare: a.includes('SHARE'),
      });
      void this.loadInteractions(generation, a);
      if (r.lifecycle.visibility === 'TEMPORARY_ORGANIZATION') {
        const delay = Date.parse(r.lifecycle.temporaryVisibleUntil ?? '') - Date.now();
        if (delay <= 0) {
          this.setData({ record: null, view: null, error: '临时可见时间已结束，请刷新重新确认' });
          return;
        }
        this._timer = setTimeout(
          () => {
            this._timer = null;
            void this.load();
          },
          Math.min(delay, 2147483647),
        );
      }
    } catch (e) {
      if (generation === this._generation) this.setData({ error: growthError(e), record: null });
    } finally {
      if (generation === this._generation) this.setData({ loading: false });
    }
  },
  async loadInteractions(generation: number, actions: GrowthAction[]) {
    const reads: Promise<void>[] = [];
    if (actions.includes('LIKE'))
      reads.push(
        getGrowthLikeState(this._id).then((liked) => {
          if (this.isCurrent(generation)) this.setData({ liked, likeReady: true });
        }),
      );
    if (actions.includes('FAVORITE'))
      reads.push(
        community.favorite(this._id).then((state) => {
          if (this.isCurrent(generation))
            this.setData({ favorited: state.favorited, favoriteReady: true });
        }),
      );
    try {
      await Promise.all(reads);
    } catch (error) {
      if (this.isCurrent(generation))
        this.setData({
          feedback: '部分互动状态暂不可确认，请刷新重试',
          ...(isReadAccessError(error) ? { record: null, view: null } : {}),
        });
    }
  },
  async moreActions() {
    if (this.data.busy || this.data.loading) return;
    const actions = [
      ...(this.data.canEdit ? [{ text: '编辑记录', run: () => this.edit() }] : []),
      ...(this.data.canReport
        ? [
            {
              text: '举报记录',
              run: () => {
                this.report();
              },
            },
          ]
        : []),
      ...(this.data.canDelete ? [{ text: '删除记录', run: () => this.remove() }] : []),
    ];
    if (!actions.length) return;
    const generation = this._generation;
    try {
      const result = await wxShowActionSheet({ itemList: actions.map((a) => a.text) });
      if (this.isCurrent(generation)) actions[result.tapIndex]?.run();
    } catch {
      /* Closing the native menu leaves the reading state unchanged. */
    }
  },
  async authorize(action: GrowthAction) {
    const generation = this._generation;
    await getMyPersonBinding();
    if (!this.isCurrent(generation)) throw new Error('身份已变化，请重新读取');
    const r = await getGrowth(this._id);
    if (!this.isCurrent(generation) || !r.availableActions.includes(action))
      throw new Error('当前没有这项操作权限，请刷新');
    return r;
  },
  async edit() {
    if (!this.data.canEdit) return;
    try {
      await this.authorize('EDIT');
      void wx.navigateTo({
        url: `/subpkg_user/pages/growth-edit/edit?postId=${encodeURIComponent(this._id)}`,
      });
    } catch (e) {
      this.setData({ feedback: growthError(e) });
    }
  },
  async remove() {
    if (this.data.busy || !this.data.canDelete) return;
    const generation = this._generation;
    this.setData({ busy: true, feedback: '' });
    try {
      const result = await wxShowModal({
        title: '删除这条记录？',
        content: '删除后将退出本人和组织可读集合，无法恢复。',
        confirmText: '删除',
        cancelText: '保留',
      });
      if (!result.confirm || !this.isCurrent(generation)) return;
      await this.authorize('DELETE');
      await deleteGrowth(this._id);
      if (generation === this._generation)
        this.setData({ record: null, view: null, feedback: '记录已删除' });
    } catch (e) {
      if (generation === this._generation) this.setData({ feedback: growthError(e) });
    } finally {
      if (generation === this._generation) this.setData({ busy: false });
    }
  },
  async like() {
    await this.interact('LIKE');
  },
  async favorite() {
    await this.interact('FAVORITE');
  },
  async interact(action: 'LIKE' | 'FAVORITE') {
    if (this.data.busy || this.data.loading || !this.data.record?.availableActions.includes(action))
      return;
    const generation = this._generation;
    this.setData({ busy: true, feedback: '' });
    try {
      await this.authorize(action);
      if (action === 'LIKE') await toggleGrowthLike(this._id);
      else {
        const state = await community.favorite(this._id);
        if (!this.isCurrent(generation)) return;
        await community.setFavorite(this._id, !state.favorited);
      }
      if (generation === this._generation) {
        this.setData({
          feedback: action === 'LIKE' ? '点赞状态已更新' : '收藏状态已更新',
          busy: false,
        });
        await this.load(true);
      }
    } catch (e) {
      if (generation === this._generation) this.setData({ feedback: growthError(e) });
    } finally {
      if (generation === this._generation) this.setData({ busy: false });
    }
  },
  report() {
    if (this.data.canReport)
      this.setData({ reportVisible: true, reportTargetId: this._id, reportTargetType: 'POST' });
  },
  reportComment(e: WechatMiniprogram.CustomEvent<{ targetId: string; targetType: string }>) {
    if (this.data.canReport)
      this.setData({
        reportVisible: true,
        reportTargetId: e.detail.targetId,
        reportTargetType: e.detail.targetType,
      });
  },
  closeReport() {
    this.setData({ reportVisible: false });
  },
  browsePerson() {
    const r = this.data.record;
    if (r)
      void wx.navigateTo({
        url: `/subpkg_user/pages/growth-list/list?personId=${encodeURIComponent(r.link.personId)}`,
      });
  },
  async openMedia(e: WechatMiniprogram.TouchEvent) {
    const media = this.data.record?.media.find((m) => m.mediaId === e.currentTarget.dataset.id);
    if (!media || this.data.opening) return;
    this.clearMedia();
    const epoch = this._mediaEpoch,
      generation = this._generation,
      owner = getCurrentIdentity().id;
    const current = () => {
      if (
        epoch !== this._mediaEpoch ||
        generation !== this._generation ||
        !this._visible ||
        owner !== getCurrentIdentity().id
      )
        throw new Error('读取状态已变化，请重新打开');
    };
    this.setData({ opening: true, feedback: '' });
    try {
      await getMyPersonBinding();
      current();
      const fresh = await getGrowth(this._id);
      current();
      const target = fresh.media.find((m) => m.mediaId === media.mediaId);
      if (!target) throw new Error('媒体已变化，请刷新');
      const file = await downloadGrowthMedia(target, current, (t) => {
        this._downloadTask = t;
      });
      this._downloads.push(file);
      await getMyPersonBinding();
      current();
      if (target.kind === 'VIDEO') this.setData({ videoPath: file });
      else {
        this._previewing = true;
        await wx.previewImage({ urls: [file], current: file, showmenu: false });
        this._previewing = false;
      }
    } catch (e) {
      if (generation === this._generation) this.setData({ feedback: growthError(e) });
    } finally {
      if (epoch === this._mediaEpoch) this.setData({ opening: false });
    }
  },
  onShareAppMessage() {
    return { title: 'e 网同心', path: '/pages/index/index' };
  },
});
