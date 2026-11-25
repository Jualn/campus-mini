import { watchCurrentAccount } from '../../actions/current-user';
import definePage from '../../utils/definePage';
import {
  getErrorMessage,
  showErrorToast,
  showSuccessToast,
  showWarningToast,
} from '../../utils/notify';
import { getCustomTabBar } from '../../utils/tabbar';
import { readHomeSummary, type HomeModule } from './home-data';
import { toHomeActivity, toHomeArticle, toHomeBanner } from './home-model';
import { readHomePreview, resolveHomePreview } from './home-preview';

const HOME_MAX_AGE_MS = 60 * 1000;
const QUICK_NAV = [
  {
    key: 'news',
    label: '党建资讯',
    icon: 'home-news',
    tone: 'red',
    url: '/subpkg_red/pages/article-list/list?sceneCode=PARTY_NEWS',
  },
  {
    key: 'books',
    label: '红色书角',
    icon: 'home-book',
    tone: 'red',
    url: '/subpkg_red/pages/article-list/list?sceneCode=RED_BOOK_CORNER',
  },
  {
    key: 'classroom',
    label: '红色云课堂',
    icon: 'home-classroom',
    tone: 'blue',
    url: '/subpkg_red/pages/article-list/list?sceneCode=RED_CLOUD_CLASSROOM',
  },
  {
    key: 'competition',
    label: '竞赛资源库',
    icon: 'home-competition',
    tone: 'blue',
    url: '/subpkg_red/pages/article-list/list?sceneCode=COMPETITION_RESOURCES',
  },
  {
    key: 'safety',
    label: 'E·安全',
    icon: 'home-safety',
    tone: 'blue',
    url: '/subpkg_red/pages/article-list/list?sceneCode=E_SAFETY',
  },
  {
    key: 'materials',
    label: '学习资料',
    icon: 'home-materials',
    tone: 'blue',
    url: '/subpkg_red/pages/article-list/list?sceneCode=LEARNING_MATERIALS',
  },
  {
    key: 'tasks',
    label: '学习任务',
    icon: 'home-tasks',
    tone: 'red',
    url: '/subpkg_user/pages/learning-task-list/list',
  },
  {
    key: 'activities',
    label: '校园活动',
    icon: 'home-events',
    tone: 'red',
    url: '/subpkg_activity/pages/list/list',
  },
];

type LoadFeedback = 'none' | 'pull';
type ModuleStatus = HomeModule<unknown>['status'];

const emptySummary = {
  featured: [] as ReturnType<typeof toHomeBanner>[],
  featuredIndex: 0,
  news: [] as ReturnType<typeof toHomeArticle>[],
  activities: [] as ReturnType<typeof toHomeActivity>[],
  bannersStatus: '' as ModuleStatus | '',
  newsStatus: '' as ModuleStatus | '',
  activitiesStatus: '' as ModuleStatus | '',
  failedCovers: {},
};

const noAccountDisposer = (): (() => void) | null => null;

definePage({
  data: {
    statusBarHeight: 0,
    navTopGap: 8,
    navHeight: 32,
    quickNav: QUICK_NAV,
    skeletonNews: [0, 1, 2],
    skeletonActivities: [0, 1],
    ...emptySummary,
    overallError: '',
    initialLoading: true,
    refreshing: false,
  },

  _generation: 0,
  _loading: false,
  _visible: false,
  _unloaded: false,
  _lastLoadedAt: 0,
  _preview: resolveHomePreview(''),
  _offAccount: noAccountDisposer(),

  onLoad(options: { preview?: string }) {
    const sys = wx.getWindowInfo();
    const menu = wx.getMenuButtonBoundingClientRect();
    this._preview = resolveHomePreview(options.preview);
    this.setData({
      statusBarHeight: sys.statusBarHeight || 0,
      navTopGap: menu.width ? Math.max(menu.top - (sys.statusBarHeight || 0), 6) : 8,
      navHeight: menu.height || 32,
    });
    this._offAccount = watchCurrentAccount(() => {
      ++this._generation;
      this._loading = false;
      this._lastLoadedAt = 0;
      this.setData({
        ...emptySummary,
        overallError: '',
        initialLoading: true,
        refreshing: false,
      });
      void wx.stopPullDownRefresh();
      if (this._visible) void this._loadSummary('none');
    });
    void this._loadSummary('none');
  },

  onShow() {
    this._visible = true;
    getCustomTabBar(this).init();
    getCustomTabBar(this).toggleVisible(true);
    if (this._loading) return;
    if (!this._lastLoadedAt || Date.now() - this._lastLoadedAt >= HOME_MAX_AGE_MS) {
      void this._loadSummary('none');
    }
  },

  onHide() {
    this._visible = false;
  },

  onUnload() {
    this._unloaded = true;
    this._visible = false;
    ++this._generation;
    this._offAccount?.();
    void wx.stopPullDownRefresh();
  },

  async onPullDownRefresh() {
    if (this._loading) {
      void wx.stopPullDownRefresh();
      return;
    }
    try {
      await this._loadSummary('pull');
    } finally {
      void wx.stopPullDownRefresh();
    }
  },

  _isCurrent(generation: number) {
    return !this._unloaded && generation === this._generation;
  },

  async _loadSummary(feedback: LoadFeedback) {
    if (this._loading || this._unloaded) return;
    const generation = ++this._generation;
    const hasSnapshot = this._lastLoadedAt > 0;
    this._loading = true;
    this.setData({
      initialLoading: !hasSnapshot,
      refreshing: hasSnapshot,
      overallError: '',
    });

    try {
      const preview = this._preview;
      const { banners, latestArticles, upcomingActivities } = preview
        ? await readHomePreview(preview)
        : await readHomeSummary();
      if (!this._isCurrent(generation)) return;

      const featured = banners.status === 'READY' ? banners.items.map(toHomeBanner) : [];
      const activeBannerKey = this.data.featured[this.data.featuredIndex]?.key;
      this.setData({
        bannersStatus: banners.status,
        newsStatus: latestArticles.status,
        activitiesStatus: upcomingActivities.status,
        featured,
        featuredIndex: Math.max(
          0,
          featured.findIndex((item) => item.key === activeBannerKey),
        ),
        news: latestArticles.status === 'READY' ? latestArticles.items.map(toHomeArticle) : [],
        activities:
          upcomingActivities.status === 'READY' ? upcomingActivities.items.map(toHomeActivity) : [],
        failedCovers: {},
      });
      this._lastLoadedAt = Date.now();

      if (feedback === 'pull') {
        if (
          [banners, latestArticles, upcomingActivities].some(
            ({ status }) => status === 'UNAVAILABLE',
          )
        ) {
          showWarningToast('部分内容更新失败，可在对应模块重试');
        } else {
          showSuccessToast('首页已更新');
        }
      }
    } catch (error: unknown) {
      if (!this._isCurrent(generation)) return;
      this._lastLoadedAt = 0;
      this.setData({
        ...emptySummary,
        overallError: getErrorMessage(error, '首页动态暂时无法加载，请稍后重试'),
      });
      if (feedback === 'pull') showErrorToast(error, { fallback: '首页刷新失败，请重试' });
    } finally {
      if (this._isCurrent(generation)) {
        this._loading = false;
        this.setData({ initialLoading: false, refreshing: false });
      }
    }
  },

  retrySummary() {
    void this._loadSummary('none');
  },

  onFeaturedChange(event: WechatMiniprogram.SwiperChange) {
    const { current, source } = event.detail;
    if (source && this.data.featured[current] && current !== this.data.featuredIndex) {
      this.setData({ featuredIndex: current });
    }
  },

  openNewsList() {
    void wx.navigateTo({ url: '/subpkg_red/pages/article-list/list?sceneCode=PARTY_NEWS' });
  },

  openActivityList() {
    void wx.navigateTo({ url: '/subpkg_activity/pages/list/list' });
  },

  onCoverError(event: WechatMiniprogram.TouchEvent) {
    const { key } = event.currentTarget.dataset as { key?: string };
    if (!key) return;
    this.setData({ failedCovers: { ...this.data.failedCovers, [key]: true } });
  },

  onShareAppMessage() {
    return { title: 'e 网同心', path: '/pages/index/index' };
  },
});
