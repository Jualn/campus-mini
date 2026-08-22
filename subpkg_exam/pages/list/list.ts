// subpkg_exam/pages/list/list.ts

import type { ExamListItem, ExamSearchItem, HotExam } from '../../../types/business';
import { examAction } from '../../../actions/index';
import { createLogger } from '../../../utils/logger';
import { wxGetWindowInfo, wxNavigateBack, wxNavigateTo } from '../../../utils/wx-promise';
import { notifyToast } from '../../../utils/notify';

const CATEGORIES = [
  { id: 'all', icon: '📋', label: '全部' },
  { id: 'language', icon: '📖', label: '语言' },
  { id: 'computer', icon: '💻', label: '计算机' },
  { id: 'certificate', icon: '📜', label: '资格证' },
  { id: 'graduate', icon: '🎓', label: '升学' },
];

const log = createLogger('ExamListPage');

void log;

Page({
  data: {
    statusBarHeight: 20,
    navTopGap: 8,
    navHeight: 32,
    keyword: '',
    activeCategory: 'all',
    categories: CATEGORIES,
    allExams: [] as ExamListItem[],
    filteredExams: [] as ExamListItem[],
    searchResult: [] as ExamSearchItem[],
    hotExam: {} as HotExam,
  },

  onLoad() {
    const sys = wxGetWindowInfo();
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
    this._loadExams();
  },

  onShow() {
    // 每次显示刷新倒计时（用户可能跨天返回）
    if (this.data.allExams.length) this._refreshCountdown();
  },

  _loadExams() {
    const { allExams, hotExam } = examAction.getExamListPageData();

    if (!allExams.length) {
      notifyToast({
        title: '暂无考试数据',
        icon: 'none',
      });
      return;
    }

    this.setData({
      allExams,
      hotExam,
    });
    this._filterExams();
  },

  _refreshCountdown() {
    const { allExams, hotExam } = examAction.refreshExamListPageData(this.data.allExams);
    this.setData({
      allExams,
      hotExam,
    });
    this._filterExams();
  },

  _filterExams() {
    const { allExams, activeCategory } = this.data;
    const filtered = examAction.filterExamListByCategory(allExams, activeCategory);
    this.setData({
      filteredExams: filtered,
    });
  },

  onSwitchCategory(e: WechatMiniprogram.TouchEvent) {
    const { id } = e.currentTarget.dataset as { id: string };

    this.setData({
      activeCategory: id,
    });
    this._filterExams();
  },

  onSearch(e: WechatMiniprogram.Input) {
    const kw = e.detail.value.trim();

    this.setData({
      keyword: kw,
    });

    if (!kw) {
      this.setData({
        searchResult: [],
      });
      return;
    }

    const result = examAction.searchExamList(this.data.allExams, kw);

    this.setData({
      searchResult: result,
    });
  },

  onClearSearch() {
    this.setData({
      keyword: '',
      searchResult: [],
    });
  },

  onBack() {
    void wxNavigateBack();
  },

  goDetail(e: WechatMiniprogram.TouchEvent) {
    const { id } = e.currentTarget.dataset as { id: string };
    void wxNavigateTo({
      url: `/subpkg_exam/pages/detail/detail?examId=${id}`,
    });
  },
});
