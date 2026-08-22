// subpkg_community/pages/search-result/search-result.ts

import type { ActivityCard, PostCardItem } from '../../../types/business';
import { createLogger } from '../../../utils/logger';
import { wxNavigateBack } from '../../../utils/wx-promise';
import { searchAction } from '../../../actions/index';
import { notifyToast } from '../../../utils/notify';

const log = createLogger('SearchResultPage');

type SearchTab = 'all' | 'activity' | 'exam';

const PAGE_SIZE = 10;

const TAB_LIST: { id: SearchTab; label: string }[] = [
  { id: 'all', label: '综合' },
  { id: 'activity', label: '活动' },
  { id: 'exam', label: '考试' },
];

let requestSeq = 0;

function safeDecode(value?: string) {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

Page({
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
    inputFocus: false,

    postList: [] as PostCardItem[],
    postHasMore: true,
    postNextCursor: '',

    activityList: [] as ActivityCard[],
    activityHasMore: true,
    activityNextCursor: '',

    examList: [],

    loading: false,
    loaded: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options: { keyword?: string; tab?: SearchTab }) {
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
    const activeTab = options.tab ?? 'all';

    this.setData({
      statusBarHeight,
      navTopGap,
      navHeight,
      keyword,
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
    /* empty */
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
    if (this.data.loading) return;

    const { activeTab } = this.data;
    const hasMore =
      activeTab === 'all'
        ? this.data.postHasMore
        : activeTab === 'activity'
          ? this.data.activityHasMore
          : false;

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
    this.setData({
      keyword: e.detail.value || '',
    });
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
    if (activeTab === this.data.activeTab) return;

    this.setData({
      activeTab,
    });

    if (!this.data.keyword.trim()) return;

    const needLoad =
      activeTab === 'all'
        ? !this.data.postList.length
        : activeTab === 'activity'
          ? !this.data.activityList.length
          : !this.data.examList.length;

    if (needLoad) {
      void this._search(true);
    }
  },

  /**
   * 返回上一页。
   */
  onBack() {
    void wxNavigateBack();
  },

  /**
   * 执行搜索。
   * 综合 Tab 先按动态处理；活动 Tab 请求活动；考试 Tab 先预留空态。
   */
  async _search(reset = false) {
    const keyword = this.data.keyword.trim();
    if (!keyword || this.data.loading) return;

    const currentRequest = ++requestSeq;
    const { activeTab } = this.data;

    this.setData({
      loading: true,
    });

    try {
      if (activeTab === 'all') {
        const res = await searchAction.searchPosts({
          keyword,
          lastId: reset ? undefined : this.data.postNextCursor || undefined,
          pageSize: PAGE_SIZE,
        });

        if (currentRequest !== requestSeq) return;

        this.setData({
          postList: reset ? res.list : [...this.data.postList, ...res.list],
          postHasMore: res.hasMore,
          postNextCursor: res.nextCursor ?? '',
          loaded: true,
        });

        return;
      }

      if (activeTab === 'activity') {
        const res = await searchAction.searchActivities({
          keyword,
          lastId: reset ? undefined : this.data.activityNextCursor || undefined,
          pageSize: PAGE_SIZE,
        });

        if (currentRequest !== requestSeq) return;

        this.setData({
          activityList: reset ? res.list : [...this.data.activityList, ...res.list],
          activityHasMore: res.hasMore,
          activityNextCursor: res.nextCursor ?? '',
          loaded: true,
        });

        return;
      }

      if (activeTab === 'exam') {
        // 考试搜索接口接入后，在这里替换成 searchExams。
        this.setData({
          examList: [],
          loaded: true,
        });
      }
    } catch (err: unknown) {
      log.error('_search', '搜索失败', err);
      notifyToast({
        title: '搜索失败，请稍后再试',
        icon: 'none',
      });
    } finally {
      if (currentRequest === requestSeq) {
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
    this.setData({
      postList: [],
      postHasMore: true,
      postNextCursor: '',

      activityList: [],
      activityHasMore: true,
      activityNextCursor: '',

      examList: [],
      loaded: false,
    });
  },
});
