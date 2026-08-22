// subpkg_community/pages/search/search.ts

import { wxNavigateBack, wxNavigateTo, wxSwitchTab } from '../../../utils/wx-promise';
import {
  addSearchHistory,
  clearSearchHistory,
  getSearchHistory,
} from '../../../utils/search-history';

const RESULT_PAGE_URL = '/subpkg_community/pages/search-result/search-result';

Page({
  data: {
    statusBarHeight: 20,
    navTopGap: 8,
    navHeight: 32,

    keyword: '',
    inputFocus: true,
    historyKeywords: [] as string[],
  },

  /**
   * 页面加载。
   * 初始化自定义导航栏高度，并读取搜索历史。
   */
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
      historyKeywords: getSearchHistory(),
    });
  },

  /**
   * 页面展示。
   * 从搜索结果页返回时，同步最新搜索历史。
   */
  onShow() {
    this.setData({
      historyKeywords: getSearchHistory(),
    });
  },

  /**
   * 输入关键词。
   * 入口页只同步输入值，不做实时搜索。
   */
  onInput(e: WechatMiniprogram.Input) {
    this.setData({
      keyword: e.detail.value || '',
    });
  },

  /**
   * 确认搜索。
   * 保存历史后跳转到搜索结果页，默认进入综合 Tab。
   */
  onConfirm() {
    this._goResult(this.data.keyword, 'all');
  },

  /**
   * 点击历史搜索。
   * 直接跳转搜索结果页。
   */
  onTapHistory(e: WechatMiniprogram.TouchEvent) {
    const { kw } = e.currentTarget.dataset as { kw?: string };
    this._goResult(kw ?? '', 'all');
  },

  /**
   * 清空输入框。
   */
  onClear() {
    this.setData({
      keyword: '',
      inputFocus: true,
    });
  },

  /**
   * 清空搜索历史。
   */
  onClearHistory() {
    clearSearchHistory();

    this.setData({
      historyKeywords: [],
    });
  },

  /**
   * 返回上一页。
   * 如果当前是直接进入搜索页，则兜底回首页。
   */
  onBack() {
    const pages = getCurrentPages();

    if (pages.length > 1) {
      void wxNavigateBack();
      return;
    }

    void wxSwitchTab({
      url: '/pages/index/index',
    });
  },

  /**
   * 快捷入口。
   * 不走搜索结果页，直接进入对应业务页。
   */
  onTapQuick(e: WechatMiniprogram.TouchEvent) {
    const { type } = e.currentTarget.dataset as { type?: string };

    if (type === 'post') {
      void wxSwitchTab({
        url: '/pages/index/index',
      });
      return;
    }

    const quickMap: Record<string, string> = {
      activity: '/subpkg_activity/pages/list/list',
      exam: '/subpkg_exam/pages/list/list',
    };

    const target = type ? quickMap[type] : '';

    if (!target) return;

    void wxNavigateTo({
      url: target,
    });
  },

  /**
   * 跳转搜索结果页。
   * 统一处理关键词 trim、历史保存和路由参数。
   */
  _goResult(keyword: string, tab: 'all' | 'activity' | 'exam' = 'all') {
    const kw = (keyword || '').trim();
    if (!kw) return;

    const historyKeywords = addSearchHistory(kw);

    this.setData({
      keyword: kw,
      historyKeywords,
      inputFocus: false,
    });

    void wxNavigateTo({
      url: `${RESULT_PAGE_URL}?keyword=${encodeURIComponent(kw)}&tab=${tab}`,
    });
  },
});
