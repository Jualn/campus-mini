// subpkg_community/pages/search-result/search-result.ts

import type { ActivityCard, PostCardItem } from '../../../types/business';
import { createLogger } from '../../../utils/logger';
import { wxNavigateBack } from '../../../utils/wx-promise';
import * as searchAction from '../../actions/search';

const log = createLogger('SearchResultPage');

type SearchTab = 'all' | 'activity';

const PAGE_SIZE = 10;

const TAB_LIST: { id: SearchTab; label: string }[] = [
  { id: 'all', label: '动态' },
  { id: 'activity', label: '活动' },
];

function safeDecode(value?: string) {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

Page({
  // 请求归属当前页面实例；切换条件或卸载后，旧响应不再更新页面。
  _requestSeq: 0,

  /**
   * 页面的初始数据
   */
  data: {
    statusBarHeight: 20,
    navTopGap: 8,
    navHeight: 32,

    tabs: TAB_LIST,
    activeTab: 'all',

    keyword: '',
    searchKeyword: '',
    inputFocus: false,

    postList: [] as PostCardItem[],
    postHasMore: true,
    postNextCursor: '',
    postLoaded: false,

    activityList: [] as ActivityCard[],
    activityHasMore: true,
    activityNextCursor: '',
    activityLoaded: false,

    loading: false,
    loaded: false,
    error: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options: { keyword?: string; tab?: string }) {
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

    const keyword = safeDecode(options.keyword).trim();
    // 兼容旧考试链接及未知参数，统一回到已接入的动态搜索。
    const activeTab: SearchTab = options.tab === 'activity' ? 'activity' : 'all';

    this.setData({
      statusBarHeight,
      navTopGap,
      navHeight,
      keyword,
      searchKeyword: keyword,
      activeTab,
    });

    if (keyword) {
      searchAction.recordSearchKeyword(keyword);
      void this._search(true);
    }
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {
    /* empty */
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    /* empty */
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    /* empty */
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    this._requestSeq++;
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    /* empty */
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    if (this.data.loading || !this.data.loaded || this.data.error) return;

    const { activeTab } = this.data;
    const hasMore = activeTab === 'all' ? this.data.postHasMore : this.data.activityHasMore;

    if (!hasMore) return;

    void this._search(false);
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    /* empty */
  },

  /**
   * 输入框内容变化。
   * 这里只同步输入值，不实时请求接口，避免每个字都触发搜索。
   */
  onInput(e: WechatMiniprogram.Input) {
    const keyword = e.detail.value || '';
    this.setData({
      keyword,
    });
    if (!keyword.trim()) this._resetAll();
  },

  /**
   * 确认搜索。
   * 清空所有 Tab 旧数据，并用当前关键词重新搜索。
   */
  onConfirm() {
    const keyword = this.data.keyword.trim();
    if (!keyword) return;

    searchAction.recordSearchKeyword(keyword);
    this._resetAll();
    this.setData({ keyword, searchKeyword: keyword });
    void this._search(true);
  },

  /**
   * 清空输入框。
   * 同时清空当前结果，回到空搜索状态。
   */
  onClear() {
    this.setData({
      keyword: '',
      inputFocus: true,
    });
    this._resetAll();
  },

  /**
   * 切换结果 Tab。
   * 如果该 Tab 还没有加载过数据，则自动请求第一页。
   */
  onSwitchTab(e: WechatMiniprogram.TouchEvent) {
    const activeTab = e.currentTarget.dataset.id as SearchTab;
    if (!TAB_LIST.some((tab) => tab.id === activeTab)) return;
    if (activeTab === this.data.activeTab) return;

    this._requestSeq++;
    const loaded = activeTab === 'all' ? this.data.postLoaded : this.data.activityLoaded;
    this.setData({
      activeTab,
      loaded,
      loading: false,
      error: false,
    });

    if (this.data.searchKeyword && !loaded) {
      void this._search(true);
    }
  },

  onRetry() {
    void this._search(!this.data.loaded);
  },

  /**
   * 返回上一页。
   */
  onBack() {
    void wxNavigateBack();
  },

  /**
   * 执行搜索。
   * 使用已提交关键词，编辑输入框不会改变旧结果的分页条件。
   */
  async _search(reset = false) {
    const keyword = this.data.searchKeyword;
    if (!keyword || this.data.loading) return;

    const currentRequest = ++this._requestSeq;
    const { activeTab } = this.data;

    this.setData({
      loading: true,
      error: false,
    });

    try {
      if (activeTab === 'all') {
        const res = await searchAction.searchPosts({
          keyword,
          lastId: reset ? undefined : this.data.postNextCursor || undefined,
          pageSize: PAGE_SIZE,
        });

        if (currentRequest !== this._requestSeq) return;

        this.setData({
          postList: reset ? res.list : [...this.data.postList, ...res.list],
          postHasMore: res.hasMore,
          postNextCursor: res.nextCursor ?? '',
          loaded: true,
          postLoaded: true,
        });

        return;
      }

      if (activeTab === 'activity') {
        const res = await searchAction.searchActivities({
          keyword,
          lastId: reset ? undefined : this.data.activityNextCursor || undefined,
          pageSize: PAGE_SIZE,
        });

        if (currentRequest !== this._requestSeq) return;

        this.setData({
          activityList: reset ? res.list : [...this.data.activityList, ...res.list],
          activityHasMore: res.hasMore,
          activityNextCursor: res.nextCursor ?? '',
          loaded: true,
          activityLoaded: true,
        });

        return;
      }
    } catch (err: unknown) {
      if (currentRequest !== this._requestSeq) return;
      log.error('_search', '搜索失败', err);
      this.setData({ error: true });
    } finally {
      if (currentRequest === this._requestSeq) {
        this.setData({
          loading: false,
        });
      }
    }
  },

  /**
   * 重置所有 Tab 的结果和分页状态。
   * 用于换关键词重新搜索。
   */
  _resetAll() {
    this._requestSeq++;
    this.setData({
      searchKeyword: '',
      loading: false,
      error: false,
      postList: [],
      postHasMore: true,
      postNextCursor: '',
      postLoaded: false,

      activityList: [],
      activityHasMore: true,
      activityNextCursor: '',
      activityLoaded: false,
      loaded: false,
    });
  },
});
