import type { ActivityListQuery } from '../../services/event-api';
import { isHttpError } from '../../../utils/error';
import type { ActivityCard } from '../../../types/business';
import type { ActivityCategory, LifecycleStatus } from '../../../types/event-contract';
import { ACTIVITY_DEPARTMENTS } from '../../../utils/activity-audience';
import type { ActivityDepartmentId } from '../../../utils/activity-audience';
import { ACTIVITY_LIST_MAX_AGE_MS } from '../../config/activity-list';
import { appStore } from '../../../stores/index';
import { getUserId } from '../../../stores/helper';
import definePage from '../../../utils/definePage';
import { wxNavigateBack } from '../../../utils/wx-promise';
import * as activityAction from '../../actions/activity';

const STATUS_TABS = [
  { id: '', label: '全部' },
  { id: 'ACTIVE', label: '有效' },
  { id: 'ENDED', label: '已结束' },
  { id: 'CANCELLED', label: '已取消' },
];
const CATEGORIES = [
  { id: '', label: '全部分类' },
  { id: 'LECTURE', label: '学术讲座' },
  { id: 'COMPETITION', label: '比赛' },
  { id: 'SPORTS', label: '体育运动' },
  { id: 'VOLUNTEERING', label: '志愿公益' },
  { id: 'THEMED', label: '主题活动' },
  { id: 'OTHER', label: '其他' },
];
const SCOPES = [
  { id: 'ALL', label: '全部范围' },
  { id: 'CAMPUS', label: '全院' },
  ...ACTIVITY_DEPARTMENTS,
];

definePage({
  _requestSeq: 0,
  _timer: null as number | null,
  _unwatch: null as (() => void) | null,
  _unloaded: false,
  _visible: false,
  _userId: '',
  _fetchedAt: 0,
  _dirty: false,
  data: {
    statusBarHeight: 20,
    navTopGap: 8,
    navHeight: 32,
    keyword: '',
    activeStatus: 'ACTIVE',
    categoryIndex: 0,
    scopeIndex: 0,
    statusTabs: STATUS_TABS,
    categories: CATEGORIES,
    scopes: SCOPES,
    list: [] as ActivityCard[],
    nextCursor: '',
    initialLoading: false,
    refreshing: false,
    loadingMore: false,
    loaded: false,
    initialError: '',
    refreshError: '',
    moreError: '',
    invalidCursor: false,
  },
  onLoad() {
    const sys = wx.getWindowInfo();
    const menu = wx.getMenuButtonBoundingClientRect();
    this.setData({
      statusBarHeight: sys.statusBarHeight || 20,
      navTopGap: menu.width ? Math.max(menu.top - (sys.statusBarHeight || 20), 6) : 8,
      navHeight: menu.height || 32,
    });
    this._userId = getUserId() ?? '';
    this._unwatch = appStore.watch('userInfo', (user) => {
      if (this._userId === user.id) return;
      this._userId = user.id;
      this._requestSeq++;
      this._clearTimer();
      this._fetchedAt = 0;
      this._dirty = true;
      this.setData({
        list: [],
        nextCursor: '',
        loaded: false,
        initialLoading: false,
        refreshing: false,
        loadingMore: false,
        initialError: '',
        refreshError: '',
        moreError: '',
      });
      void wx.stopPullDownRefresh();
      if (this._visible && user.id) void this._load('initial');
    });
    void this._load('initial');
  },
  onShow() {
    this._visible = true;
    if (
      this.data.loaded &&
      (this._dirty || Date.now() - this._fetchedAt >= ACTIVITY_LIST_MAX_AGE_MS)
    ) {
      void this._load('refresh');
    } else if (!this.data.loaded && this._dirty && !this.data.initialLoading) {
      void this._load('initial');
    }
  },
  onHide() {
    this._visible = false;
  },
  onUnload() {
    this._unloaded = true;
    this._requestSeq++;
    this._clearTimer();
    this._unwatch?.();
    void wx.stopPullDownRefresh();
  },
  _clearTimer() {
    if (this._timer !== null) clearTimeout(this._timer);
    this._timer = null;
  },
  _resetQuery(debounce = false) {
    this._clearTimer();
    this._requestSeq++;
    this._fetchedAt = 0;
    this.setData({
      list: [],
      nextCursor: '',
      loaded: false,
      initialLoading: true,
      refreshing: false,
      loadingMore: false,
      initialError: '',
      refreshError: '',
      moreError: '',
      invalidCursor: false,
    });
    void wx.stopPullDownRefresh();
    if (debounce)
      this._timer = setTimeout(() => {
        this._timer = null;
        void this._load('initial');
      }, 700);
    else void this._load('initial');
  },
  _isCurrent(seq: number) {
    return !this._unloaded && seq === this._requestSeq;
  },
  async _load(scene: 'initial' | 'refresh' | 'more') {
    if (this._unloaded) return;
    if (
      scene === 'more' &&
      (this.data.initialLoading ||
        this.data.refreshing ||
        this.data.loadingMore ||
        !this.data.nextCursor)
    )
      return;
    if (scene === 'refresh') this._clearTimer();
    const seq = ++this._requestSeq;
    const query = {
      keyword: this.data.keyword.trim() || undefined,
      lastId: scene === 'more' ? this.data.nextCursor : undefined,
      pageSize: 20,
      category: (CATEGORIES[this.data.categoryIndex].id as ActivityCategory | '') || undefined,
      lifecycleStatus: (this.data.activeStatus as LifecycleStatus | '') || undefined,
    };
    const scope = SCOPES[this.data.scopeIndex].id;
    const audience: ActivityListQuery =
      scope === 'ALL' || scope === 'CAMPUS'
        ? { audienceFilter: scope }
        : { audienceFilter: 'DEPARTMENT' as const, departmentId: scope as ActivityDepartmentId };
    this.setData({
      initialLoading: scene === 'initial',
      refreshing: scene === 'refresh',
      loadingMore: scene === 'more',
      initialError: '',
      refreshError: '',
      moreError: '',
      invalidCursor: false,
    });
    try {
      const result = await activityAction.getActivityList({ ...query, ...audience });
      if (!this._isCurrent(seq)) return;
      const list = scene === 'more' ? [...this.data.list] : [];
      const ids = new Set(list.map((item) => item.id));
      for (const item of result.list)
        if (!ids.has(item.id)) {
          ids.add(item.id);
          list.push(item);
        }
      this._fetchedAt = Date.now();
      this._dirty = false;
      this.setData({ list, nextCursor: result.nextCursor ?? '', loaded: true });
    } catch (error: unknown) {
      if (!this._isCurrent(seq)) return;
      const invalidCursor = isHttpError(error) && error.problemType === '/problems/invalid-cursor';
      const message = invalidCursor ? '列表游标已失效，请从第一页重新加载' : '加载失败，请重试';
      this.setData({
        invalidCursor,
        initialError: scene === 'initial' ? message : '',
        refreshError: scene === 'refresh' ? '刷新失败，已保留原有内容，请重试' : '',
        moreError: scene === 'more' ? message : '',
      });
    } finally {
      if (this._isCurrent(seq)) {
        this.setData({ initialLoading: false, refreshing: false, loadingMore: false });
        void wx.stopPullDownRefresh();
      }
    }
  },
  onSearch(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value });
    this._resetQuery(true);
  },
  onSearchConfirm(e: WechatMiniprogram.InputConfirm) {
    this.setData({ keyword: e.detail.value.trim() });
    this._resetQuery();
  },
  onClearSearch() {
    this.setData({ keyword: '' });
    this._resetQuery();
  },
  onSwitchStatus(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const id = e.detail.value;
    if (!STATUS_TABS.some((item) => item.id === id) || id === this.data.activeStatus) return;
    this.setData({ activeStatus: id });
    this._resetQuery();
  },
  onCategoryChange(e: WechatMiniprogram.CustomEvent<{ value: number }>) {
    const index = e.detail.value;
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= CATEGORIES.length ||
      index === this.data.categoryIndex
    )
      return;
    this.setData({ categoryIndex: index });
    this._resetQuery();
  },
  onScopeChange(e: WechatMiniprogram.CustomEvent<{ value: number }>) {
    const index = e.detail.value;
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= SCOPES.length ||
      index === this.data.scopeIndex
    )
      return;
    this.setData({ scopeIndex: index });
    this._resetQuery();
  },
  onClearFilters() {
    this.setData({ keyword: '', activeStatus: 'ACTIVE', categoryIndex: 0, scopeIndex: 0 });
    this._resetQuery();
  },
  onRetryInitial() {
    void this._load('initial');
  },
  onRetryRefresh() {
    void this._load('refresh');
  },
  onRetryMore() {
    void this._load(this.data.invalidCursor ? 'refresh' : 'more');
  },
  onPullDownRefresh() {
    void this._load('refresh');
  },
  onReachBottom() {
    if (!this.data.moreError) void this._load('more');
  },
  onActivityChanged() {
    this._dirty = true;
  },
  onBack() {
    void wxNavigateBack();
  },
});
