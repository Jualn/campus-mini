import definePage from '../../../utils/definePage';
import { getCurrentIdentity, watchCurrentIdentity } from '../../../actions/current-user';
import { ensureLogin } from '../../../actions/auth';
import { isHttpError } from '../../../utils/error';
import { getErrorMessage } from '../../../utils/notify';
import { activityStagePresentation } from '../../../utils/activity-stage';
import { eventApi } from '../../services/event-api';
import { formatTimelineSchedule } from '../../utils/event-timeline';
import type { MyActivityRegistrationItem } from '../../../types/event-contract';

function row(item: MyActivityRegistrationItem) {
  return {
    id: item.registration.registrationId,
    activity: item.activity,
    registration: {
      registrationId: item.registration.registrationId,
    },
    cancellationReason:
      item.registration.status === 'CANCELLED' ? item.registration.cancellationReason : undefined,
    cancelled: item.registration.status === 'CANCELLED',
    submittedAtText: formatTimelineSchedule({
      kind: 'EXACT_POINT',
      time: item.registration.submittedAt,
    }).text,
    stageLabel: activityStagePresentation(item.activity.stage).label,
    statusLabel:
      item.registration.status === 'CANCELLED'
        ? item.registration.cancellationOrigin === 'ADMIN'
          ? '管理员已作废'
          : item.registration.cancellationOrigin === 'SELF'
            ? '本人已取消'
            : '已取消'
        : item.activity.category === 'VOLUNTEERING'
          ? '预约成功'
          : '报名成功',
    scheduleText: item.activity.mainSchedule
      ? formatTimelineSchedule(item.activity.mainSchedule).text
      : '',
  };
}

definePage({
  _generation: 0,
  _alive: true,
  _visible: false,
  _owner: '',
  _cursor: undefined as string | undefined,
  _off: null as (() => void) | null,
  data: {
    items: [] as ReturnType<typeof row>[],
    loading: false,
    error: '',
    moreError: '',
    invalidCursor: false,
    hasMore: false,
  },
  onLoad() {
    this._owner = getCurrentIdentity().id;
    this._off = watchCurrentIdentity(() => {
      const owner = getCurrentIdentity().id;
      if (owner === this._owner) return;
      this._owner = owner;
      ++this._generation;
      this._cursor = undefined;
      this.setData({ items: [], hasMore: false, error: '', moreError: '', loading: false });
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
    this.setData({ loading: false });
  },
  onUnload() {
    this._alive = false;
    ++this._generation;
    this._off?.();
  },
  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading && !this.data.moreError) void this.load(true);
  },
  refresh() {
    void this.load();
  },
  more() {
    void this.load(!this.data.invalidCursor);
  },
  isCurrent(generation: number): boolean {
    return this._alive && generation === this._generation;
  },
  async load(append = false) {
    if (append && (!this.data.hasMore || this.data.loading)) return;
    const generation = ++this._generation;
    this.setData({ loading: true, error: '', moreError: '', invalidCursor: false });
    try {
      await ensureLogin();
      if (!this.isCurrent(generation)) return;
      const owner = getCurrentIdentity().id;
      if (!owner) throw new Error('请先登录后查看本人报名');
      const cursor = append ? this._cursor : undefined;
      const result = await eventApi.registrations.listMine({ cursor, pageSize: 20 });
      if (!this.isCurrent(generation) || owner !== getCurrentIdentity().id) return;
      if (result.nextCursor && result.nextCursor === cursor)
        throw new Error('分页信息异常，请刷新');
      const seen = new Set<string>();
      const items = [...(append ? this.data.items : []), ...result.items.map(row)].filter(
        (item) => {
          const id = item.registration.registrationId;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        },
      );
      this._cursor = result.nextCursor;
      this.setData({ items, hasMore: !!result.nextCursor });
    } catch (error) {
      if (!this.isCurrent(generation)) return;
      const invalidCursor =
        isHttpError(error) && error.problemType?.endsWith('/invalid-cursor') === true;
      this.setData({
        ...(append
          ? { moreError: invalidCursor ? '分页已失效，请从第一页重新加载' : getErrorMessage(error) }
          : { error: getErrorMessage(error) }),
        invalidCursor,
      });
    } finally {
      if (this._alive && generation === this._generation) this.setData({ loading: false });
    }
  },
  browse() {
    void wx.navigateTo({ url: '/subpkg_activity/pages/list/list' });
  },
  openRegistration(e: WechatMiniprogram.TouchEvent) {
    const item = this.data.items.find(
      (item) => item.registration.registrationId === e.currentTarget.dataset.id,
    );
    if (!item) return;
    const history = item.activity.publicAccess === 'AVAILABLE' ? '' : '&history=1';
    void wx.navigateTo({
      url: `/subpkg_activity/pages/registration/registration?activityId=${encodeURIComponent(item.activity.activityId)}${history}`,
    });
  },
  openActivity(e: WechatMiniprogram.TouchEvent) {
    const item = this.data.items.find(
      (item) => item.registration.registrationId === e.currentTarget.dataset.id,
    );
    if (item?.activity.publicAccess !== 'AVAILABLE') return;
    void wx.navigateTo({
      url: `/subpkg_activity/pages/detail/detail?activityId=${encodeURIComponent(item.activity.activityId)}`,
    });
  },
});
