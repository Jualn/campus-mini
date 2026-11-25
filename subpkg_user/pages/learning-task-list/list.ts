import { isReadAccessError } from '../../../utils/error';
import definePage from '../../../utils/definePage';
import { watchPersonBinding } from '../../../services/person-binding';
import { getCurrentIdentity, watchCurrentIdentity } from '../../../actions/current-user';
import {
  listMyLearningTasks,
  learningTaskError,
  learningTaskRoute,
  type MyDetail,
  type Progress,
} from '../../services/learning-task';
import { presentation } from '../../services/learning-task-state';

definePage({
  data: {
    items: [] as (MyDetail & ReturnType<typeof presentation> & { assignmentId: string })[],
    loading: false,
    loadingMore: false,
    error: '',
    failedMore: false,
    hasMore: false,
    personUnavailable: false,
    progressIndex: 0,
    progressLabels: ['全部', '未开始', '待审核', '已完成', '已驳回'],
  },
  _failedMore: false,
  _cursor: undefined as string | undefined,
  _generation: 0,
  _alive: true,
  _visible: false,
  _owner: '',
  _off: null as (() => void) | null,
  _offBinding: null as (() => void) | null,
  onLoad() {
    this._offBinding = watchPersonBinding(() => {
      ++this._generation;
      this.setData({ items: [], hasMore: false, personUnavailable: true });
      if (this._visible) void this.load();
    });
    this._owner = getCurrentIdentity().id;
    this._off = watchCurrentIdentity(() => {
      const owner = getCurrentIdentity().id;
      if (owner === this._owner) return;
      this._owner = owner;
      ++this._generation;
      this.setData({ items: [], hasMore: false, error: '' });
      if (this._visible) void this.load();
    });
  },
  onShow() {
    this._visible = true;
    void this.load();
  },
  onHide() {
    this._visible = false;
    ++this._generation;
  },
  onUnload() {
    this._visible = false;
    this._alive = false;
    ++this._generation;
    this._off?.();
    this._offBinding?.();
  },
  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading && !this.data.error) void this.load(true);
  },
  retry() {
    void this.load(this._failedMore);
  },
  refresh() {
    void this.load();
  },
  more() {
    if (this.data.hasMore && !this.data.loading) void this.load(true);
  },
  changeProgress(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.applyProgress(Number(e.detail.value));
  },
  selectProgress(e: WechatMiniprogram.TouchEvent) {
    this.applyProgress(Number(e.currentTarget.dataset.index));
  },
  applyProgress(index: number) {
    if (!Number.isInteger(index) || index < 0 || index > 4) return;
    if (index === this.data.progressIndex && !this.data.error) return;
    this.setData({ progressIndex: index, items: [], hasMore: false, error: '', failedMore: false });
    this._cursor = undefined;
    void this.load();
  },
  async load(append = false) {
    if (append && this.data.loading) return;
    const generation = ++this._generation,
      owner = getCurrentIdentity().id;
    this._failedMore = false;
    this.setData({ loading: true, loadingMore: append, error: '', failedMore: false });
    try {
      const result = await listMyLearningTasks(
        append ? this._cursor : undefined,
        (
          [undefined, 'NOT_STARTED', 'PENDING_REVIEW', 'COMPLETED', 'REJECTED'] as (
            | Progress
            | undefined
          )[]
        )[this.data.progressIndex],
      );
      if (!this._alive || generation !== this._generation || owner !== getCurrentIdentity().id)
        return;
      if (
        owner &&
        result.items.some(
          (d) => d.assignment.subject.type === 'ACCOUNT' && d.assignment.subject.userId !== owner,
        )
      )
        throw new Error('任务分配身份不匹配');
      const rows = [
        ...(append ? this.data.items : []),
        ...result.items.map((d) => ({
          ...d,
          ...presentation(d),
          assignmentId: d.assignment.assignmentId,
        })),
      ];
      const seen = new Set<string>();
      this._cursor = result.nextCursor;
      this.setData({
        items: rows.filter((d) => {
          if (seen.has(d.assignment.assignmentId)) return false;
          seen.add(d.assignment.assignmentId);
          return true;
        }),
        hasMore: !!result.nextCursor,
        personUnavailable: !!result.personUnavailable,
      });
    } catch (e) {
      if (this._alive && generation === this._generation) {
        this._failedMore = append;
        this.setData({
          error: learningTaskError(e),
          failedMore: append,
          ...(isReadAccessError(e) ? { items: [], hasMore: false } : {}),
        });
      }
    } finally {
      if (this._alive && generation === this._generation)
        this.setData({ loading: false, loadingMore: false });
    }
  },
  open(e: WechatMiniprogram.TouchEvent) {
    const assignmentId = e.currentTarget.dataset.id as string;
    if (this.data.items.some((d) => d.assignment.assignmentId === assignmentId))
      void wx.navigateTo({ url: learningTaskRoute(assignmentId) });
  },
});
