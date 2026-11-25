import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compile = (file) =>
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;

const load = (file, mocks = {}) => {
  const exports = {};
  vm.runInNewContext(compile(file), {
    exports,
    require: (name) => {
      if (Object.prototype.hasOwnProperty.call(mocks, name)) return mocks[name];
      if (name.endsWith('/activity-stage')) return load('utils/activity-stage.ts');
      if (name.endsWith('/routes')) return load('utils/routes.ts');
      if (name.endsWith('/time-util')) return load('utils/time-util.ts');
      if (name.endsWith('/home-model')) return homeModel;
      throw new Error(`Unexpected dependency in ${file}: ${name}`);
    },
  });
  return exports;
};

const homeModel = load('pages/index/home-model.ts');
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
assert.equal(app.pages[0], 'pages/index/index');
assert.deepEqual(
  app.tabBar.list.map((item) => item.pagePath),
  ['pages/index/index', 'pages/campus/campus', 'pages/message/message', 'pages/me/me'],
);
assert.ok(app.preloadRule['pages/campus/campus']);
assert.equal(app.preloadRule['pages/index/index'], undefined);
const evaluatedAt = '2026-11-12T10:00:00+08:00';
const articleSource = {
  id: 'article / 1',
  title: '学习贯彻党的创新理论',
  summary: '首页资讯摘要',
  publishedAt: '2026-11-01T16:00:00+08:00',
  cover: { url: 'https://example.com/article.jpg' },
};
const activitySource = {
  activityId: 'activity / 1',
  title: '主题党日活动',
  stage: { state: 'NOT_STARTED', evaluatedAt },
  schedule: { kind: 'EXACT_POINT', time: '2026-11-20T09:30:00+08:00' },
};
const bannerSources = [
  {
    target: { targetType: 'ACTIVITY', targetId: activitySource.activityId },
    title: '精选活动标题',
  },
  {
    target: { targetType: 'ARTICLE', targetId: articleSource.id },
    title: '精选文章标题',
    cover: { url: 'https://example.com/banner.jpg' },
  },
];
const article = homeModel.toHomeArticle(articleSource);
const activity = homeModel.toHomeActivity(activitySource);
const articleBanner = homeModel.toHomeBanner(bannerSources[1]);
assert.equal(article.route, '/subpkg_red/pages/article-detail/detail?articleId=article%20%2F%201');
assert.equal(activity.route, '/subpkg_activity/pages/detail/detail?activityId=activity%20%2F%201');
assert.equal(activity.timeLabel, '2026.11.20 09:30');
assert.equal(activity.stageLabel, '未开始');
assert.equal(articleBanner.route, article.route);
assert.equal(articleBanner.coverUrl, 'https://example.com/banner.jpg');
assert.notEqual(articleBanner.coverKey, article.coverKey);
assert.equal(homeModel.toHomeBanner(bannerSources[0]).route, activity.route);
assert.equal(homeModel.toHomeBanner(bannerSources[0]).coverUrl, '');
assert.equal(
  homeModel.toHomeActivity({
    ...activitySource,
    schedule: {
      kind: 'EXACT_RANGE',
      startTime: '2026-11-12T09:30:00+08:00',
      endTime: '2026-11-12T11:30:00+08:00',
    },
  }).timeLabel,
  '2026.11.12 09:30 至 2026.11.12 11:30',
);

const ready = (items) => ({ status: 'READY', items });
const empty = () => ({ status: 'EMPTY', items: [] });
const unavailable = () => ({ status: 'UNAVAILABLE' });
const normalResult = () => ({
  evaluatedAt,
  banners: ready(bannerSources),
  latestArticles: ready([articleSource, { ...articleSource, id: 'second-article' }]),
  upcomingActivities: ready([activitySource, { ...activitySource, activityId: 'second-activity' }]),
});
const requests = [];
const response = normalResult();
const homeData = load('pages/index/home-data.ts', {
  '../../utils/request': {
    http: {
      get: async (url, query, options) => {
        requests.push({ url, query, ...options });
        return response;
      },
    },
  },
});
assert.equal(await homeData.readHomeSummary(), response);
assert.deepEqual(requests, [
  { url: '/v1/home/summary', query: undefined, auth: 'required', sensitive: true },
]);

const preview = load('pages/index/home-preview.ts', {
  '../../config/index': { ENV: 'develop' },
});
assert.equal(preview.resolveHomePreview('empty'), 'empty');
assert.equal(preview.resolveHomePreview('invalid'), '');
const emptyPreview = await preview.readHomePreview('empty');
assert.equal(emptyPreview.banners.status, 'EMPTY');
assert.equal(emptyPreview.latestArticles.status, 'EMPTY');
assert.equal(emptyPreview.upcomingActivities.status, 'EMPTY');
const partialPreview = await preview.readHomePreview('partial');
assert.equal(partialPreview.latestArticles.status, 'EMPTY');
assert.equal(partialPreview.upcomingActivities.status, 'UNAVAILABLE');
await assert.rejects(preview.readHomePreview('error'));
const releasePreview = load('pages/index/home-preview.ts', {
  '../../config/index': { ENV: 'release' },
});
assert.equal(releasePreview.resolveHomePreview('error'), '');

const flush = () => new Promise((resolve) => setImmediate(resolve));

function createPage(initialImplementation = async () => normalResult()) {
  let page;
  let accountListener;
  let accountDisposed = false;
  const state = {
    implementation: initialImplementation,
    calls: 0,
    tabCalls: [],
    navigation: [],
    stopped: 0,
    successToasts: [],
    warningToasts: [],
    errorToasts: [],
  };
  vm.runInNewContext(compile('pages/index/index.ts'), {
    exports: {},
    require: (name) => {
      if (name.endsWith('/current-user')) {
        return {
          watchCurrentAccount: (listener) => {
            accountListener = listener;
            return () => {
              accountDisposed = true;
            };
          },
        };
      }
      if (name.endsWith('/definePage')) {
        return {
          __esModule: true,
          default: (definition) => {
            page = definition;
          },
        };
      }
      if (name.endsWith('/notify')) {
        return {
          getErrorMessage: (error, fallback) => error?.userMessage || fallback,
          showSuccessToast: (title) => state.successToasts.push(title),
          showWarningToast: (title) => state.warningToasts.push(title),
          showErrorToast: (error, options) => state.errorToasts.push(options.fallback),
        };
      }
      if (name.endsWith('/tabbar')) {
        return {
          getCustomTabBar: () => ({
            init: () => state.tabCalls.push('init'),
            toggleVisible: (visible) => state.tabCalls.push(visible),
          }),
        };
      }
      if (name.endsWith('/home-data')) {
        return {
          readHomeSummary: () => {
            state.calls += 1;
            return state.implementation();
          },
        };
      }
      if (name.endsWith('/home-model')) return homeModel;
      if (name.endsWith('/home-preview')) {
        return {
          resolveHomePreview: preview.resolveHomePreview,
          readHomePreview: preview.readHomePreview,
        };
      }
      throw new Error(`Unexpected primary-home dependency: ${name}`);
    },
    wx: {
      getWindowInfo: () => ({ statusBarHeight: 24, windowWidth: 375 }),
      getMenuButtonBoundingClientRect: () => ({ width: 80, top: 32, height: 32, right: 295 }),
      stopPullDownRefresh: () => {
        state.stopped += 1;
        return Promise.resolve();
      },
      navigateTo: ({ url }) => {
        state.navigation.push(url);
        return Promise.resolve();
      },
    },
  });
  page.setData = (patch) => Object.assign(page.data, patch);
  return {
    page,
    state,
    changeAccount: () => accountListener(),
    get accountDisposed() {
      return accountDisposed;
    },
  };
}

const previewHome = createPage();
previewHome.page.onLoad({ preview: 'partial' });
await flush();
assert.equal(previewHome.page.data.initialLoading, false);
assert.equal(previewHome.page.data.newsStatus, 'EMPTY');
assert.equal(previewHome.page.data.news.length, 0);
assert.equal(previewHome.page.data.activitiesStatus, 'UNAVAILABLE');
previewHome.page.onUnload();

const home = createPage();
home.page.onLoad({});
home.page.onShow();
await flush();
assert.equal(home.state.calls, 1, 'onShow must not duplicate the initial request');
assert.equal(home.page.data.statusBarHeight, 24);
assert.equal(home.page.data.menuCapsuleStyle, 'top:32px;right:80px;width:80px;height:32px;');
assert.deepEqual(home.state.tabCalls, ['init', true]);
assert.equal(home.page.data.initialLoading, false);
assert.deepEqual(Array.from(home.page.data.news, (item) => item.id), [articleSource.id, 'second-article']);
assert.deepEqual(Array.from(home.page.data.activities, (item) => item.id), [activitySource.activityId, 'second-activity']);
assert.deepEqual(Array.from(home.page.data.featured, (item) => item.title), ['精选活动标题', '精选文章标题']);
assert.equal(home.page.data.overallError, '');
assert.equal(home.page.data.quickNav.length, 8);
assert.ok(home.page.data.quickNav.some((item) => item.label === '学习任务'));
assert.equal(home.page.onShareAppMessage().path, '/pages/index/index');
assert.equal(home.page.onShareAppMessage().title, 'e 网同心');
assert.equal(home.page.data.categories, undefined);
assert.equal(home.page.toggleDirectory, undefined);
home.page.onCoverError({ currentTarget: { dataset: { key: article.coverKey } } });
assert.equal(home.page.data.failedCovers[article.coverKey], true);

const emptyHome = createPage(async () => ({
  ...normalResult(),
  banners: empty(),
  latestArticles: empty(),
  upcomingActivities: empty(),
}));
emptyHome.page.onLoad({});
await flush();
assert.equal(emptyHome.page.data.bannersStatus, 'EMPTY');
assert.equal(emptyHome.page.data.newsStatus, 'EMPTY');
assert.equal(emptyHome.page.data.activitiesStatus, 'EMPTY');
assert.equal(emptyHome.page.data.overallError, '');
assert.equal(emptyHome.page.data.featured.length, 0);

const refreshHome = createPage();
refreshHome.page.onLoad({});
await flush();
refreshHome.state.implementation = async () => ({
  ...normalResult(),
  banners: unavailable(),
  latestArticles: empty(),
  upcomingActivities: unavailable(),
});
await refreshHome.page.onPullDownRefresh();
assert.equal(refreshHome.page.data.overallError, '');
assert.equal(refreshHome.page.data.bannersStatus, 'UNAVAILABLE');
assert.equal(refreshHome.page.data.newsStatus, 'EMPTY');
assert.equal(refreshHome.page.data.activitiesStatus, 'UNAVAILABLE');
assert.equal(refreshHome.page.data.featured.length, 0);
assert.equal(refreshHome.page.data.news.length, 0);
assert.equal(refreshHome.page.data.activities.length, 0);
assert.deepEqual(refreshHome.state.warningToasts, ['部分内容更新失败，可在对应模块重试']);
refreshHome.state.implementation = async () => normalResult();
refreshHome.page.retrySummary();
await flush();
assert.equal(refreshHome.state.calls, 3);
assert.equal(refreshHome.page.data.featured.length, 2);
assert.equal(refreshHome.page.data.news.length, 2);
assert.equal(refreshHome.page.data.activities.length, 2);

const swiperHome = createPage();
swiperHome.page.onLoad({});
await flush();
swiperHome.page.onFeaturedChange({ detail: { current: 1, source: 'autoplay' } });
assert.equal(swiperHome.page.data.featuredIndex, 1);
swiperHome.page.onFeaturedChange({ detail: { current: 0, source: 'touch' } });
assert.equal(swiperHome.page.data.featuredIndex, 0);
swiperHome.page.onFeaturedChange({ detail: { current: 1, source: 'touch' } });
assert.equal(swiperHome.page.data.featuredIndex, 1);
swiperHome.page.onFeaturedChange({ detail: { current: 0, source: '' } });
assert.equal(swiperHome.page.data.featuredIndex, 1);
swiperHome.state.implementation = async () => ({
  ...normalResult(),
  banners: ready([
    { ...bannerSources[0], target: { targetType: 'ACTIVITY', targetId: 'new' } },
    ...bannerSources,
  ]),
});
await swiperHome.page.onPullDownRefresh();
assert.equal(swiperHome.page.data.featuredIndex, 2);
assert.equal(swiperHome.page.data.featured[2].title, bannerSources[1].title);
swiperHome.state.implementation = async () => ({
  ...normalResult(),
  banners: ready([bannerSources[0]]),
});
await swiperHome.page.onPullDownRefresh();
assert.equal(swiperHome.page.data.featuredIndex, 0);
swiperHome.page.onFeaturedChange({ detail: { current: 2, source: 'touch' } });
assert.equal(swiperHome.page.data.featuredIndex, 0);
swiperHome.page.onUnload();

for (const [statusCode, userMessage] of [
  [503, '首页服务暂时不可用'],
  [401, '登录状态已失效'],
  [403, '当前账号无权访问'],
]) {
  refreshHome.state.implementation = async () => {
    throw Object.assign(new Error('summary request failed'), { statusCode, userMessage });
  };
  await refreshHome.page.onPullDownRefresh();
  assert.equal(refreshHome.page.data.overallError, userMessage);
  assert.equal(refreshHome.page.data.featured.length, 0);
  assert.equal(refreshHome.page.data.news.length, 0);
  assert.equal(refreshHome.page.data.activities.length, 0);
  assert.equal(refreshHome.page.data.refreshing, false);
  refreshHome.state.implementation = async () => normalResult();
  await refreshHome.page.onPullDownRefresh();
  assert.equal(refreshHome.page.data.overallError, '');
  assert.equal(refreshHome.page.data.newsStatus, 'READY');
}

let resolveDuplicate;
const duplicateHome = createPage(
  () =>
    new Promise((resolve) => {
      resolveDuplicate = resolve;
    }),
);
duplicateHome.page.onLoad({});
duplicateHome.page.onShow();
await duplicateHome.page.onPullDownRefresh();
assert.equal(duplicateHome.state.calls, 1);
assert.ok(duplicateHome.state.stopped >= 1);
resolveDuplicate(normalResult());
await flush();
assert.equal(duplicateHome.page.data.initialLoading, false);

let resolveOld;
let resolveNew;
const staleHome = createPage();
staleHome.page.onLoad({});
staleHome.page.onShow();
await flush();
assert.equal(staleHome.page.data.featured.length, 2);
staleHome.state.implementation = () =>
  new Promise((resolve) => {
    resolveOld = resolve;
  });
staleHome.page.retrySummary();
staleHome.state.implementation = () =>
  new Promise((resolve) => {
    resolveNew = resolve;
  });
staleHome.changeAccount();
assert.equal(staleHome.state.calls, 3);
assert.equal(staleHome.page.data.featured.length, 0);
assert.equal(staleHome.page.data.news.length, 0);
assert.equal(staleHome.page.data.activities.length, 0);
resolveNew({
  ...normalResult(),
  banners: empty(),
  latestArticles: ready([{ ...articleSource, id: 'new-account' }]),
  upcomingActivities: empty(),
});
await flush();
resolveOld(normalResult());
await flush();
assert.equal(staleHome.page.data.news[0].id, 'new-account');
assert.equal(staleHome.page.data.activities.length, 0);
assert.equal(staleHome.page.data.featured.length, 0);
staleHome.page.onUnload();
assert.equal(staleHome.accountDisposed, true);

let redirect;
vm.runInNewContext(compile('subpkg_red/pages/index/index.ts'), {
  exports: {},
  require: () => ({
    wxSwitchTab: ({ url }) => {
      redirect = url;
      return Promise.resolve();
    },
  }),
  Page: (definition) => definition.onLoad(),
});
assert.equal(redirect, '/pages/index/index');

let component;
let unreadListener;
vm.runInNewContext(compile('custom-tab-bar/index.ts'), {
  exports: {},
  require: (name) => {
    if (name.endsWith('/defineComponent')) {
      return {
        __esModule: true,
        default: () => (definition) => {
          component = definition;
        },
      };
    }
    if (name.endsWith('/routes')) return load('utils/routes.ts');
    if (name.endsWith('/event-bus')) {
      return {
        eventBus: {
          on: (_, listener) => {
            unreadListener = listener;
          },
        },
        EVENTS: { NOTIFY_UNREAD_CHANGE: 'unread' },
      };
    }
    if (name.endsWith('/notification-center')) {
      return { getUnreadCount: () => 7, isUnreadKnown: () => true };
    }
    if (name.endsWith('/wx-promise')) return {};
    throw new Error(`Unexpected tab dependency: ${name}`);
  },
});
const badges = [];
component.lifetimes.attached.call({
  setBadge: (index, count) => badges.push({ index, count }),
});
unreadListener(9);
assert.equal(component.data.tabList[2].url, '/pages/message/message');
assert.deepEqual(badges, [
  { index: 2, count: 7 },
  { index: 2, count: 9 },
]);

const pageConfig = JSON.parse(fs.readFileSync('pages/index/index.json', 'utf8'));
assert.equal(pageConfig.enablePullDownRefresh, true);
assert.ok(pageConfig.usingComponents['load-state']);
const wxml = fs.readFileSync('pages/index/index.wxml', 'utf8');
assert.ok(wxml.indexOf('home-quick-nav') < wxml.indexOf('home-news-list'));
assert.ok(wxml.indexOf('home-news-list') < wxml.indexOf('home-activity-list'));
assert.ok(wxml.includes('home-hero--skeleton'));
assert.ok(wxml.includes('current="{{featuredIndex}}"'));
assert.ok(wxml.includes('bindchange="onFeaturedChange"'));
assert.match(wxml, /<swiper\s+wx:elif="{{bannersStatus === 'READY' && featured.length > 1}}"[^>]+/);
assert.ok(wxml.includes('autoplay="{{true}}"'));
assert.ok(wxml.indexOf('home-feature__placeholder') < wxml.indexOf('home-feature__media'));
for (const status of ['bannersStatus', 'newsStatus', 'activitiesStatus']) {
  for (const value of ['READY', 'EMPTY', 'UNAVAILABLE']) {
    assert.ok(wxml.includes(`${status} === '${value}'`));
  }
}
assert.ok(!wxml.includes('全部党建栏目'));
assert.ok(!wxml.includes('品牌与校园服务'));
assert.ok(!wxml.includes('home-directory'));
assert.ok(!wxml.includes('home-service-link'));
assert.ok(!wxml.includes('url="/pages/campus/campus" open-type="switchTab"'));
console.log('PASS: home directory and service links removed; summary lifecycle and eight shortcuts preserved (simulation/static).');
assert.ok(wxml.includes('/assets/brand/great-wall.svg'));
assert.ok(!wxml.includes('E 网同心'));
assert.ok(wxml.includes('home-section__title'));
assert.ok(wxml.includes('暂无党建资讯'));
assert.ok(wxml.includes('党建资讯加载失败'));
assert.ok(wxml.includes('暂无近期活动'));
assert.ok(wxml.includes('近期活动加载失败'));
assert.ok(!wxml.includes('listLoad'));

const globalStyles = fs.readFileSync('app.wxss', 'utf8');
const homeStyles = fs.readFileSync('pages/index/index.wxss', 'utf8');
for (const token of [
  '--color-brand-red: #c43b4a',
  '--color-brand-red-deep: #a92a3a',
  '--color-brand-red-soft: #d85a66',
  '--color-brand-red-light: #fcebed',
  '--color-brand-red-tint: #fff5f6',
  '--color-primary: #2469bd',
  '--color-primary-light: #eaf2fc',
  '--color-primary-tint: #f3f7fd',
  '--color-bg-page: #f6f8fc',
  '--color-text-primary: #1f2d45',
  '--color-text-secondary: #65758f',
  '--color-border: #e7edf5',
]) {
  assert.ok(globalStyles.includes(token), `missing palette token: ${token}`);
}
assert.ok(homeStyles.includes('#c82f47 0%'));
assert.ok(homeStyles.includes('.home-masthead::after'));
assert.ok(homeStyles.includes('var(--color-bg-page) 100%'));
assert.ok(homeStyles.includes('.home-capsule-backdrop'));
assert.ok(homeStyles.includes('background: var(--color-brand-red-light)'));
assert.ok(homeStyles.includes('background: var(--color-primary-tint)'));
assert.ok(!wxml.includes('item.glyph'));
assert.ok(wxml.includes('name="{{item.icon}}"'));
const iconRegistry = fs.readFileSync('components/ui-icon/registry.ts', 'utf8');
for (const icon of [
  'home-news',
  'home-book',
  'home-classroom',
  'home-competition',
  'home-safety',
  'home-materials',
  'home-tasks',
  'home-events',
]) {
  assert.ok(iconRegistry.includes(`'${icon}'`));
  assert.ok(fs.existsSync(`assets/icons/core/${icon}.svg`));
}
assert.equal(app.tabBar.color, '#65758F');
assert.equal(app.tabBar.selectedColor, '#C43B4A');

console.log(
  'PASS: home routes, one authenticated summary request, eight shortcuts, removed directory and service links, loading/empty/partial/error states, failure clearing and retry, stale-response isolation, develop previews, share compatibility and message badge ownership (simulation/static checks).',
);
