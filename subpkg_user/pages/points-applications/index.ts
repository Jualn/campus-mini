import { isReadAccessError } from '../../../utils/error';
import definePage from '../../../utils/definePage';
import { watchPersonBinding } from '../../../services/person-binding';
import {
  listMyPointApplications,
  pointsErrorMessage,
  type ApplicationStatus,
  type PointApplication,
} from '../../services/points';
import { pointApplicationView, pointStatusTone, pointTimeText } from '../../services/points-state';

const filters: { label: string; status?: ApplicationStatus }[] = [
  { label: '全部' },
  { label: '待审核', status: 'PENDING' },
  { label: '已通过', status: 'APPROVED' },
  { label: '已驳回', status: 'REJECTED' },
  { label: '已结束', status: 'CLOSED' },
];
definePage({
  _generation: 0,
  _visible: false,
  _off: null as (() => void) | null,
  data: {
    loading: false,
    error: '',
    moreError: '',
    rows: [] as (PointApplication & {
      statusLabel: string;
      statusTone: string;
      createdAtText: string;
    })[],
    page: 0,
    totalItems: 0,
    hasMore: false,
    filter: 0,
    filters: filters.map((f) => f.label),
  },
  onLoad() {
    // The binding boundary also invalidates on logout/account change.
    this._off = watchPersonBinding(() => {
      ++this._generation;
      this.setData({
        rows: [],
        page: 0,
        totalItems: 0,
        hasMore: false,
        error: '',
        moreError: '',
        loading: false,
      });
      if (this._visible) void this.refresh();
    });
  },
  onShow() {
    this._visible = true;
    void this.refresh();
  },
  onHide() {
    this._visible = false;
    ++this._generation;
    this.setData({ rows: [], totalItems: 0, hasMore: false, loading: false });
  },
  onUnload() {
    this._visible = false;
    ++this._generation;
    this._off?.();
  },
  current(generation: number) {
    return this._visible && generation === this._generation;
  },
  async refresh() {
    await this.load(1);
  },
  async more() {
    if (!this.data.loading && this.data.hasMore) await this.load(Number(this.data.page) + 1);
  },
  async onPullDownRefresh() {
    try {
      await this.refresh();
    } finally {
      void wx.stopPullDownRefresh();
    }
  },
  filterChanged(e: WechatMiniprogram.PickerChange) {
    this.applyFilter(Number(e.detail.value));
  },
  selectFilter(e: WechatMiniprogram.TouchEvent) {
    this.applyFilter(Number(e.currentTarget.dataset.index));
  },
  applyFilter(index: number) {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= filters.length ||
      index === this.data.filter
    )
      return;
    this.setData({
      filter: index,
      rows: [],
      page: 0,
      totalItems: 0,
      hasMore: false,
      error: '',
      moreError: '',
    });
    void this.refresh();
  },
  async load(page: number) {
    const generation = ++this._generation,
      status = filters[this.data.filter].status;
    this.setData({
      loading: true,
      error: '',
      moreError: '',
    });
    try {
      const result = await listMyPointApplications({
        page,
        pageSize: 20,
        ...(status ? { status } : {}),
      });
      if (!this.current(generation)) return;
      const combined = page === 1 ? result.items : [...this.data.rows, ...result.items];
      const unique = new Map(combined.map((item) => [item.applicationId, item]));
      this.setData({
        rows: Array.from(unique.values()).map((item) => ({
          ...item,
          statusLabel: pointApplicationView(item).statusLabel,
          statusTone: pointStatusTone(item.status),
          createdAtText: pointTimeText(item.createdAt),
        })),
        page,
        totalItems: result.totalItems,
        hasMore: result.page * result.pageSize < result.totalItems,
      });
    } catch (error) {
      if (this.current(generation) && isReadAccessError(error))
        this.setData({ rows: [], page: 0, totalItems: 0, hasMore: false });
      if (this.current(generation))
        this.setData(
          page === 1
            ? { error: pointsErrorMessage(error) }
            : { moreError: pointsErrorMessage(error) },
        );
    } finally {
      if (this.current(generation)) this.setData({ loading: false });
    }
  },
  open(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as unknown;
    if (typeof id !== 'string' || !this.data.rows.some((row) => row.applicationId === id)) return;
    void wx.navigateTo({
      url: `/subpkg_user/pages/points-application/index?applicationId=${encodeURIComponent(id)}`,
    });
  },
});
