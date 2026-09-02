// subpkg_activity/pages/list/list.ts

import type { ActivityCard } from '../../../types/business';
import { ACTIVITY_STATUS_ORDER, DepartmentBit, DepartmentText } from '../../../utils/constants';
import { createLogger } from '../../../utils/logger';
import { useListLoad } from '../../../behaviors/useListLoad';
import definePage from '../../../utils/definePage';
import { wxNavigateBack, wxNavigateTo, wxShowActionSheet } from '../../../utils/wx-promise';
import * as activityAction from '../../actions/activity';
import { showErrorToast } from '../../../utils/notify';

const STATUS_TABS = [
  { id: 'all', label: '全部' },
  { id: 'enrolling', label: '报名中' },
  { id: 'not_started', label: '待开始' },
  { id: 'ongoing', label: '进行中' },
  { id: 'ended', label: '已结束' },
];

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 700;

let searchRequestSeq = 0;
let searchDebounceTimer: number | null = null;

const log = createLogger('ActivityListPage');

function clearSearchDebounceTimer() {
  if (searchDebounceTimer !== null) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
}

function getScopeList(activity: ActivityCard) {
  const scope = activity.scope as unknown;
  if (Array.isArray(scope)) return scope.filter(Boolean) as string[];
  if (typeof scope === 'string' && scope) return [scope];
  return [];
}

definePage({
  behaviors: [useListLoad({ defaultHasMore: false })],

  data: {
    statusBarHeight: 20,
    navTopGap: 8,
    navHeight: 32,
    keyword: '',
    activeStatus: 'all',
    activeScope: '',
    statusTabs: STATUS_TABS,
    allList: [] as ActivityCard[],
    filteredList: [] as ActivityCard[],

    // 搜索结果改为接口返回的 ActivityCard，不再使用本地静态匹配字段。
    searchResult: [] as ActivityCard[],
    searchLoading: false,
    searchLoaded: false,
    searchHasMore: true,
    searchNextCursor: '',

    skeletonItems: [1, 2, 3],
    // seriesList: [] as Array<{ series_id: string; series_name: string; count: number }>,
    // activeSeries: '',
  },

  onLoad() {
    const sys = wx.getWindowInfo();
    const menuButton =
      typeof wx.getMenuButtonBoundingClientRect === 'function'
        ? wx.getMenuButtonBoundingClientRect()
        : null;

    const statusBarHeight = sys.statusBarHeight || 20;
    let navTopGap = 8;
    let navHeight = 32;

    if (menuButton?.width) {
      navTopGap = Math.max(menuButton.top - statusBarHeight, 6);
      navHeight = menuButton.height || navHeight;
    }

    this.setData({
      statusBarHeight,
      navTopGap,
      navHeight,
    });
    this._loadActivities();
  },

  onShow() {
    if (!this.data.keyword && this.data.allList.length && this.data.listLoad.phase !== 'initial') {
      this._applyFilter();
    }
  },

  onUnload() {
    clearSearchDebounceTimer();
    searchRequestSeq++;
    this._listLoadClearTimers();
  },

  _loadActivities(scene: 'initial' | 'refresh' = 'initial') {
    if (scene === 'refresh') {
      if (!this._listLoadCanRefresh()) {
        void wx.stopPullDownRefresh();
        return;
      }
      this._listLoadBeginRefresh();
    } else {
      this._listLoadBeginInitial();
    }

    void activityAction
      .getActivityList()
      .then((res) => {
        const list = res.list;
        // const seriesMap: { [key: string]: any } = {};
        // list.forEach((a: any) => {
        //   if (a.series_id) {
        //     if (!seriesMap[a.series_id]) {
        //       seriesMap[a.series_id] = {
        //         series_id: a.series_id,
        //         series_name: a.series_name,
        //         count: 0,
        //       };
        //     }
        //     seriesMap[a.series_id].count++;
        //   }
        // });

        this.setData({
          allList: list,
          // seriesList: Object.values(seriesMap),
        });

        // 普通列表仍然走活动列表接口；搜索结果单独走 searchActivities。
        if (!this.data.keyword) {
          this._applyFilter();
        }

        const doneOptions = {
          success: true,
          hasContent: list.length > 0,
          hasMore: false,
        };

        if (scene === 'refresh') {
          this._listLoadEndRefresh(doneOptions);
        } else {
          this._listLoadEndInitial(doneOptions);
        }
      })
      .catch((err: unknown) => {
        const hasContent = this.data.allList.length > 0;
        const doneOptions = {
          success: false,
          hasContent,
          hasMore: false,
        };

        if (scene === 'refresh') {
          this._listLoadEndRefresh(doneOptions);
          if (hasContent) {
            showErrorToast(err, { fallback: '刷新失败，请稍后重试' });
          }
        } else {
          this._listLoadEndInitial(doneOptions);
        }

        log.error('_loadActivities', '加载活动失败', err);
      })
      .finally(() => {
        if (scene === 'refresh') void wx.stopPullDownRefresh();
      });
  },

  _applyFilter() {
    const { allList, activeStatus, activeScope } = this.data;
    let result = [...allList];

    // 状态筛选
    if (activeStatus !== 'all') {
      result = result.filter((a) => a.status === activeStatus);
    }

    // 学科部筛选
    if (activeScope && activeScope !== DepartmentText[DepartmentBit.ALL]) {
      result = result.filter((a) => {
        const scopeList = getScopeList(a);
        return (
          scopeList.includes(activeScope) || scopeList.includes(DepartmentText[DepartmentBit.ALL])
        );
      });
    }
    // if (activeSeries) result = result.filter((a: any) => a.series_id === activeSeries);

    result.sort(
      (a, b) => (ACTIVITY_STATUS_ORDER[a.status] ?? 9) - (ACTIVITY_STATUS_ORDER[b.status] ?? 9),
    );

    this.setData({
      filteredList: result,
    });
  },

  onSearch(e: WechatMiniprogram.Input) {
    const kw = e.detail.value.trim();
    this.setData({
      keyword: kw,
    });

    clearSearchDebounceTimer();

    if (!kw) {
      searchRequestSeq++;
      this._resetSearch();
      this._applyFilter();
      return;
    }

    searchDebounceTimer = setTimeout(() => {
      void this._searchActivities(true);
    }, SEARCH_DEBOUNCE_MS);
  },

  onSearchConfirm(e: WechatMiniprogram.InputConfirm) {
    const kw = e.detail.value.trim();
    this.setData({
      keyword: kw,
    });

    clearSearchDebounceTimer();

    if (!kw) {
      searchRequestSeq++;
      this._resetSearch();
      this._applyFilter();
      return;
    }

    void this._searchActivities(true);
  },

  async _searchActivities(reset = false) {
    const keyword = this.data.keyword.trim();
    if (!keyword) return;

    if (!reset) {
      if (this.data.searchLoading || !this.data.searchHasMore) return;
    }

    const currentRequest = ++searchRequestSeq;

    if (reset) {
      this.setData({
        searchResult: [],
        searchHasMore: true,
        searchNextCursor: '',
        searchLoaded: false,
      });
    }

    this.setData({
      searchLoading: true,
    });

    try {
      const res = await activityAction.searchActivities({
        keyword,
        lastId: reset ? undefined : this.data.searchNextCursor || undefined,
        pageSize: PAGE_SIZE,
      });

      if (currentRequest !== searchRequestSeq) return;

      const list = res.list;

      this.setData({
        searchResult: reset ? list : [...this.data.searchResult, ...list],
        searchHasMore: res.hasMore,
        searchNextCursor: res.nextCursor ?? '',
        searchLoaded: true,
      });
    } catch (err: unknown) {
      if (currentRequest !== searchRequestSeq) return;

      this.setData({
        searchLoaded: true,
        searchHasMore: false,
      });

      log.error('_searchActivities', '搜索活动失败', err);
      showErrorToast(err, { fallback: '搜索失败，请稍后再试' });
    } finally {
      if (currentRequest === searchRequestSeq) {
        this.setData({
          searchLoading: false,
        });
      }
    }
  },

  _resetSearch() {
    this.setData({
      searchResult: [],
      searchLoading: false,
      searchLoaded: false,
      searchHasMore: true,
      searchNextCursor: '',
    });
  },

  onClearSearch() {
    clearSearchDebounceTimer();
    searchRequestSeq++;
    this.setData({
      keyword: '',
    });
    this._resetSearch();
    this._applyFilter();
  },

  onSwitchStatus(e: WechatMiniprogram.TouchEvent) {
    const { id } = e.currentTarget.dataset as { id: string };
    this.setData({
      activeStatus: id,
      activeSeries: '',
    });
    this._applyFilter();
  },

  // onFilterSeries(e: any) {
  //   const id = e.currentTarget.dataset.id;
  //   const current = this.data.activeSeries;
  //   this.setData({
  //     activeSeries: current === id ? '' : id,
  //     activeStatus: 'all',
  //   });
  //   this._applyFilter();
  // },

  onShowScopeFilter() {
    const scopes = [
      DepartmentText[DepartmentBit.ALL],
      ...new Set(
        this.data.allList
          .flatMap((a) => getScopeList(a))
          .filter((scope) => scope && scope !== DepartmentText[DepartmentBit.ALL]),
      ),
    ];

    void wxShowActionSheet({
      itemList: scopes,
    })
      .then((res) => {
        const selected = res.tapIndex === 0 ? '' : scopes[res.tapIndex];
        this.setData({
          activeScope: selected,
        });
        this._applyFilter();
      })
      .catch(() => {
        // 用户取消选择，不处理。
      });
  },

  onRetryInitial() {
    this._loadActivities('refresh');
  },

  onPullDownRefresh() {
    if (this.data.keyword.trim()) {
      clearSearchDebounceTimer();
      void this._searchActivities(true).finally(() => {
        void wx.stopPullDownRefresh();
      });
      return;
    }

    this._loadActivities('refresh');
  },

  onReachBottom() {
    if (this.data.keyword.trim()) {
      void this._searchActivities(false);
    }
  },

  onRetryMore() {
    if (this.data.keyword.trim()) {
      void this._searchActivities(false);
      return;
    }

    this._listLoadResetMoreError();
    this._loadActivities('refresh');
  },

  goDetail(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    void wxNavigateTo({
      url: `/subpkg_activity/pages/detail/detail?activityId=${id}`,
    });
  },

  onBack() {
    void wxNavigateBack();
  },
});
