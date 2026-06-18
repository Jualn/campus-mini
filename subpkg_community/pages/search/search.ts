// subpkg_community/pages/search/search.ts

import { wxNavigateBack, wxNavigateTo, wxSwitchTab } from '../../../utils/wx-promise';
import {
  addSearchHistory,
  clearSearchHistory,
  getSearchHistory,
} from '../../utils/search-history';

const RESULT_PAGE_URL = '/subpkg_community/pages/search-result/search-result';

const TAB_LIST = [
  { id: 'all', label: '全部' },
  { id: 'post', label: '动态' },
  { id: 'activity', label: '活动' },
  { id: 'exam', label: '考试' },
];

const MOCK_POSTS = [
  {
    id: 'post_101',
    title: '图书馆五楼还有空位，晚上一起自习吗？',
    desc: '期中周冲刺，分享一个安静角落，插座也够用。',
    meta: '校园圈动态',
    extra: '10分钟前',
    keywords: ['图书馆', '自习', '期中', '复习'],
  },
  {
    id: 'post_102',
    title: '求高数笔记，愿意有偿交换英语资料',
    desc: '高数上册积分部分有点卡，求大佬救命。',
    meta: '学习互助',
    extra: '1小时前',
    keywords: ['高数', '笔记', '英语', '资料'],
  },
  {
    id: 'post_103',
    title: '二食堂新品测评：麻辣香锅可冲',
    desc: '人均18，分量很足，晚上七点后排队短。',
    meta: '校园生活',
    extra: '今天',
    keywords: ['食堂', '香锅', '校园生活'],
  },
];

const MOCK_ACTIVITIES = [
  {
    id: 'act_001',
    title: '春季草坪音乐节',
    desc: '社团联合演出，支持自由点歌。',
    meta: '文艺活动',
    extra: '本周六',
    keywords: ['音乐节', '社团', '演出'],
  },
  {
    id: 'act_002',
    title: '校园黑客马拉松',
    desc: '24小时组队开发，AI 方向优先赛道。',
    meta: '竞赛活动',
    extra: '报名中',
    keywords: ['黑客马拉松', '编程', '比赛', 'AI'],
  },
  {
    id: 'act_003',
    title: '求职简历工作坊',
    desc: '就业中心老师现场修改简历，一对一答疑。',
    meta: '就业服务',
    extra: '下周三',
    keywords: ['简历', '求职', '就业'],
  },
];

const MOCK_EXAMS = [
  {
    id: 'cet4',
    title: '英语四级',
    desc: '全国大学英语四级考试',
    meta: '语言考试',
    extra: '2026-06-13',
    keywords: ['英语', '四级', 'CET4'],
  },
  {
    id: 'cet6',
    title: '英语六级',
    desc: '全国大学英语六级考试',
    meta: '语言考试',
    extra: '2026-06-13',
    keywords: ['英语', '六级', 'CET6'],
  },
  {
    id: 'ncre',
    title: '全国计算机等级考试',
    desc: '计算机基础能力认证考试',
    meta: '计算机考试',
    extra: '每年3月/9月',
    keywords: ['计算机', 'NCRE', '二级'],
  },
];

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
