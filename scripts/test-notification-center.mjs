import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const load = (file, modules = {}, globals = {}) => {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      if (!(name in modules)) throw new Error(`Missing stub ${name} in ${file}`);
      return modules[name];
    },
    console,
    ...globals,
  });
  return exports;
};
const drain = async () => {
  for (let i = 0; i < 35; i++) await Promise.resolve();
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const item = (id, extra = {}) => ({
  id,
  type: 'COMMENT_REPLIED',
  category: 'INTERACTION',
  presentation: { title: '服务端回复标题', body: '回复内容', context: '原评论' },
  readAt: null,
  createdAt: '2026-09-30T12:00:00+08:00',
  ...extra,
});
const summary = (headCursor, newCount = 0, id = 'new', unreadCount = 7) => ({
  headCursor,
  unreadCount,
  newCount,
  latestNewNotification: newCount
    ? { id, type: 'SYSTEM', title: '新到快照', createdAt: item(id).createdAt }
    : null,
});

// HTTP mapping uses the existing authenticated transport, with no legacy fallback.
const httpCalls = [];
const http = Object.fromEntries(
  ['get', 'post', 'put', 'del'].map((method) => [
    method,
    (...args) => {
      httpCalls.push({ method, args });
      return Promise.resolve({});
    },
  ]),
);
const api = load('services/api.ts', {
  '../utils/request': { http },
  '../utils/config': {},
  '../utils/activity-publishing': {
    rejectMiniProgramActivityPublishing() {
      throw new Error('disabled');
    },
  },
});
await api.api.notify.listNotifications({ boxCategory: 'ACTIVITY', cursor: 'page-token' });
await api.api.notify.getSummary('head-token');
await api.api.notify.getNotification('opaque/id');
await api.api.notify.batchRead(['opaque']);
await api.api.notify.readThrough('global-head');
await api.api.notify.deleteNotification('opaque/id');
assert.equal(httpCalls[5].method, 'del');
assert.equal(httpCalls[5].args[0], '/v1/users/me/notifications/opaque%2Fid');
assert.equal(httpCalls[5].args[1], undefined);
assert.equal(httpCalls[0].args[0], '/v1/users/me/notifications');
assert.deepEqual(Object.keys(httpCalls[0].args[1]).sort(), ['boxCategory', 'cursor']);
for (const oldEntry of [
  'getStructuredList',
  'getMyList',
  'getUnreadCount',
  'markRead',
  'markAllRead',
]) {
  assert.equal(
    Object.hasOwn(api.api.notify, oldEntry),
    false,
    `removed obsolete entry ${oldEntry}`,
  );
}
assert.equal(httpCalls[0].args[1].boxCategory, 'ACTIVITY');
assert.equal(httpCalls[1].args[1].afterCursor, 'head-token');
assert.equal(httpCalls[2].args[0], '/v1/users/me/notifications/opaque%2Fid');
assert.equal(httpCalls[3].args[0], '/v1/users/me/notifications:batch-read');
assert.equal(httpCalls[4].args[1].throughCursor, 'global-head');
assert.ok(httpCalls.every((call) => call.args.at(-1).sensitive));

const routes = load('utils/routes.ts');
const navigation = [];
const hints = [];
let pageStack = [];
let navigationGate;
let failNavigation = false;
const applyNavigation = async (method, route) => {
  navigation.push({ method, url: route.url });
  if (failNavigation) {
    failNavigation = false;
    throw new Error('navigation failed');
  }
  if (navigationGate) await navigationGate.promise;
  const [path, query = ''] = route.url.split('?');
  const page = {
    route: path.slice(1),
    options: Object.fromEntries(
      query
        .split('&')
        .filter(Boolean)
        .map((part) => {
          const [key, value = ''] = part.split('=');
          return [key, decodeURIComponent(value)];
        }),
    ),
  };
  if (method === 'reLaunch') pageStack = [page];
  else if (method === 'redirectTo') pageStack.splice(-1, 1, page);
  else pageStack.push(page);
};
const router = load(
  'utils/notification-target.ts',
  {
    './routes': routes,
    './wx-promise': {
      wxNavigateTo: (route) => applyNavigation('navigateTo', route),
      wxRedirectTo: (route) => applyNavigation('redirectTo', route),
      wxReLaunch: (route) => applyNavigation('reLaunch', route),
    },
    './notify': { showInfoToast: (message) => hints.push(message) },
  },
  { getCurrentPages: () => pageStack },
);
assert.equal(
  router.resolveNotificationTarget({ type: 'POST_DETAIL', postId: 'p/a', commentId: 'c&1' }),
  '/subpkg_community/pages/detail/detail?postId=p%2Fa&commentId=c%261',
);
assert.equal(
  router.resolveNotificationTarget({ type: 'ACTIVITY_DETAIL', activityId: 'a' }),
  routes.buildActivityDetailRoute('a'),
);
assert.equal(
  router.resolveNotificationTarget({ type: 'PUBLIC_EVENT_DETAIL', publicEventId: 'e' }),
  routes.buildPublicEventDetailRoute('e'),
);
assert.equal(router.resolveNotificationTarget({ type: 'USER', resourceId: 'u' }), null);
await router.navigateNotificationTarget();
assert.equal(hints.length, 1);

// Box/Banner retain their parent; refocusing the same resource never adds a layer.
const focusedPost = { type: 'POST_DETAIL', postId: 'p/a', commentId: 'c&1' };
pageStack = [{ route: 'pages/message/message', options: {} }];
await router.navigateNotificationTarget(focusedPost);
assert.equal(pageStack.length, 2);
assert.equal(pageStack[1].options.commentId, 'c&1');
await router.navigateNotificationTarget({ ...focusedPost, commentId: 'other' });
assert.equal(navigation.at(-1).method, 'redirectTo');
assert.equal(pageStack.length, 2);
assert.equal(pageStack[0].route, 'pages/message/message');
assert.equal(pageStack[1].options.commentId, 'other');
await router.navigateNotificationTarget({ ...focusedPost, postId: 'different' });
assert.equal(navigation.at(-1).method, 'navigateTo');
assert.equal(pageStack.length, 3);

// Cold and warm external entries both produce exactly home -> focused target.
for (const stack of [
  [{ route: 'subpkg_community/pages/detail/detail', options: { postId: 'p/a' } }],
  [...pageStack, { route: 'subpkg_activity/pages/detail/detail', options: { activityId: 'old' } }],
]) {
  pageStack = stack;
  await router.navigateNotificationTarget(focusedPost, { external: true });
  assert.equal(pageStack.length, 2);
  assert.equal(pageStack[0].route, 'pages/index/index');
  assert.equal(pageStack[1].options.commentId, 'c&1');
  pageStack.pop();
  assert.equal(pageStack[0].route, 'pages/index/index', 'back returns home');
}

for (const target of [
  { type: 'ARTICLE_DETAIL', articleId: 'article', commentId: 'reply' },
  { type: 'POST_DETAIL', postId: 'growth', growthRecordTarget: true, commentId: 'reply' },
]) {
  await router.navigateNotificationTarget(target, { external: true });
  await router.navigateNotificationTarget({ ...target, commentId: 'next' });
  assert.equal(pageStack.length, 2);
  assert.equal(navigation.at(-1).method, 'redirectTo');
  assert.equal(pageStack[1].options.commentId, 'next');
}

// Repeated taps are coalesced; stale external work stops after resetting home.
await Promise.all([
  router.navigateNotificationTarget(focusedPost),
  router.navigateNotificationTarget(focusedPost),
]);
assert.equal(pageStack.length, 3);
navigationGate = deferred();
let currentEntry = true;
const staleNavigation = router.navigateNotificationTarget(focusedPost, {
  external: true,
  isCurrent: () => currentEntry,
});
await drain();
currentEntry = false;
navigationGate.resolve();
await staleNavigation;
navigationGate = undefined;
assert.equal(pageStack.length, 1, 'stale entry must not open a private detail');
failNavigation = true;
await assert.rejects(router.navigateNotificationTarget(focusedPost));
await router.navigateNotificationTarget(focusedPost);
assert.equal(pageStack.length, 2, 'failed navigation must not poison later entries');

const model = load('pages/message/message-model.ts', {
  '../../utils/notification-target': router,
  '../../utils/time-util': { formatTime: () => '刚刚', TimeStyle: { POST: 'POST' } },
});
// 筛选选中底色是品牌蓝；图标必须使用独立白色资源，不能复用卡片分类色。
for (const tab of model.notificationFilterTabs) {
  assert.ok(tab.filterIcon && tab.activeIcon, `${tab.label} 缺少筛选图标状态`);
  const selectedSvg = fs.readFileSync(tab.activeIcon.slice(1), 'utf8');
  assert.match(selectedSvg, /stroke="#ffffff"/, `${tab.label} 选中图标与蓝底缺少对比度`);
  const defaultSvg = fs.readFileSync(tab.filterIcon.slice(1), 'utf8');
  const shapes = (svg) => [...svg.matchAll(/<path\b[^>]*>/g)].map(([tag]) => tag);
  assert.deepEqual(shapes(selectedSvg), shapes(defaultSvg), `${tab.label} 状态轮廓不一致`);
}
const cards = model.mergeNotificationCards(
  [],
  [
    item('one'),
    item('one'),
    item('activity', {
      category: 'ACTIVITY',
      type: 'ACTIVITY_TIME_CHANGED',
      subject: { type: 'ACTIVITY', resourceId: 'a' },
      presentation: { title: '时间变更', changes: [{ label: '开始', before: '旧', after: '新' }] },
    }),
    item('system', { category: 'SYSTEM', type: 'UNKNOWN_FUTURE', readAt: '2026-09-30T13:00:00Z' }),
  ],
);
assert.equal(cards.length, 3);
assert.equal(cards[0].presentation.title, '服务端回复标题');
assert.equal(cards[0].actor, undefined);
assert.equal(cards[1].presentation.changes[0].before, '旧');
assert.equal(cards[2].isRead, true);
assert.equal(cards[0].layout, 'interaction');
assert.equal(cards[0].canExpand, false, 'short snapshots have no expansion burden');
assert.equal(cards[1].layout, 'change');
const readable = model.toNotificationCard(
  item('long-preview', {
    actor: { userId: 'u', nickname: '同学甲' },
    presentation: { title: '同学甲回复了你', body: '长回复内容'.repeat(25), context: '原评论' },
  }),
);
assert.equal(readable.showActorName, false, 'do not repeat the actor already in the frozen title');
assert.equal(readable.canExpand, true);
assert.equal(
  readable.presentation.body,
  '长回复内容'.repeat(25),
  'preview preserves the entire snapshot',
);
assert.equal(
  model.toNotificationCard(item('actor', { actor: { userId: 'u', nickname: '同学乙' } }))
    .showActorName,
  true,
);
assert.equal(model.mergeNotificationCards(cards, [item('one'), item('two')]).length, 4);
assert.equal(
  model.notificationFilterTabs.map((tab) => tab.id).join(','),
  ',INTERACTION,ACTIVITY,SYSTEM',
);

// Explicit snapshots take precedence even when only one field is provided.
const explicitSnapshots = [
  { subjectTitle: '校园分享会报名说明', quote: '这个活动需要提前报名吗？' },
  { subjectTitle: '校园分享会报名说明' },
  { quote: '这个活动需要提前报名吗？' },
  { subjectTitle: '' },
];
for (const fields of explicitSnapshots) {
  const card = model.toNotificationCard(
    item('explicit', {
      subject: { type: 'COMMENT', resourceId: 'comment-1' },
      presentation: {
        title: '同学甲回复了你',
        body: '需要提前报名',
        context: '旧上下文'.repeat(30),
        ...fields,
      },
    }),
  );
  assert.equal(card.legacyContext, undefined, 'do not infer a missing field from context');
  assert.equal(
    card.canExpand,
    false,
    'hidden compatibility context does not create an expand action',
  );
  assert.equal(card.presentation.subjectTitle, fields.subjectTitle);
  assert.equal(card.presentation.quote, fields.quote);
  assert.equal(card.presentation.body, '需要提前报名');
  assert.equal(card.subject.type, 'COMMENT');
}
assert.equal(readable.legacyContext, '原评论', 'old context-only notifications still render');
assert.equal(
  model.toNotificationCard(
    item('long-subject', {
      presentation: { title: '时间调整', subjectTitle: '很长的活动标题'.repeat(12) },
    }),
  ).canExpand,
  true,
);
assert.equal(
  model.toNotificationCard(
    item('long-quote', {
      presentation: { title: '新回复', quote: '很长的原文'.repeat(12) },
    }),
  ).canExpand,
  true,
);

const harness = () => {
  let user = 'u1';
  const listeners = new Map();
  const events = {
    LOGIN_SUCCESS: 'login',
    LOGOUT: 'logout',
    NOTIFY_UNREAD_CHANGE: 'badge',
    NOTIFY_LIST_REFRESH: 'refresh',
    NOTIFY_BANNER_SHOW: 'banner',
    NOTIFY_BANNER_TAP: 'tap',
    NOTIFY_BANNER_CLEAR: 'clear',
    NOTIFY_VISIBILITY_CHANGE: 'visibility',
  };
  const emitted = [];
  const bus = {
    on: (name, fn) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    off: (name, fn) => listeners.get(name)?.delete(fn),
    emit: (name, ...args) => {
      emitted.push({ name, args });
      listeners.get(name)?.forEach((fn) => fn(...args));
    },
  };
  let timerId = 0;
  const timers = new Map();
  const globals = {
    setTimeout: (fn) => {
      const id = ++timerId;
      timers.set(id, fn);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const calls = {
    summary: [],
    read: [],
    through: [],
    get: [],
    navigate: [],
    navigationOptions: [],
    errors: [],
    delete: [],
  };
  let summaries = [];
  let reads = [];
  let gets = [];
  let deletes = [];
  let serverUnreadCount = 7;
  const service = {
    listNotifications: async () => {
      throw new Error('No list response configured');
    },
    deleteNotification: async (id) => {
      calls.delete.push(id);
      await deletes.shift();
    },
    isNotificationUnavailable: (error) => error?.statusCode === 404,
    getSummary: async (cursor) => {
      calls.summary.push(cursor);
      const result = await (summaries.shift() ?? summary('head', 0, '', serverUnreadCount));
      serverUnreadCount = result.unreadCount;
      return result;
    },
    batchRead: async (ids) => {
      calls.read.push([...ids]);
      const result = await (reads.shift() ?? { changedCount: 0, unreadCount: 3 });
      serverUnreadCount = result.unreadCount;
      return result;
    },
    readThrough: async (cursor) => {
      calls.through.push(cursor);
      serverUnreadCount = 2;
      return { changedCount: 0, unreadCount: 2 };
    },
    getNotification: async (id) => {
      calls.get.push(id);
      return await (gets.shift() ?? item(id));
    },
    isInvalidNotificationCursor: (error) => error?.problemType === '/problems/invalid-cursor',
  };
  const modules = {
    '../config/index': { __esModule: true, default: { notificationPollIntervalMs: 20000 } },
    '../services/notification': service,
    '../utils/event-bus': { eventBus: bus, EVENTS: events },
    '../stores/helper': { getUserId: () => user, isLoggedIn: () => !!user },
    './auth': { authReady: Promise.resolve(), ensureLogin: async () => {} },
    '../utils/notification-target': {
      navigateNotificationTarget: async (target, options) => {
        calls.navigate.push(target);
        calls.navigationOptions.push(options);
      },
    },
    '../utils/notify': { showErrorToast: (...args) => calls.errors.push(args) },
  };
  const center = load('actions/notification-center.ts', modules, globals);
  return {
    center,
    service,
    calls,
    emitted,
    bus,
    events,
    globals,
    timers,
    setUser: (value) => {
      user = value;
    },
    summaries: (values) => {
      summaries = values;
    },
    reads: (values) => {
      reads = values;
    },
    gets: (values) => {
      gets = values;
    },
    deletes: (values) => {
      deletes = values;
    },
  };
};

const h = harness();
h.summaries([
  summary('baseline', 0, '', 12),
  summary('next', 1, 'n1', 13),
  summary('next2', 1, 'n2', 0),
]);
h.center.start();
await drain();
assert.equal(h.calls.summary[0], undefined);
assert.equal(h.emitted.filter((e) => e.name === 'banner').length, 0);
assert.equal(h.center.getUnreadCount(), 12);
await h.center.pollOnce();
assert.equal(h.calls.summary[1], 'baseline');
assert.equal(h.emitted.filter((e) => e.name === 'banner').length, 1);
assert.equal(h.calls.read.length, 0, 'appear does not read');
await h.center.pollOnce();
assert.equal(
  h.emitted.filter((e) => e.name === 'banner').length,
  2,
  'already-read arrivals may still show',
);
h.bus.emit('tap', h.emitted.find((e) => e.name === 'banner').args[0]);
await drain();
assert.equal(h.calls.read[0][0], 'n1');
assert.equal(h.calls.navigate.length, 1);
assert.equal(h.calls.navigationOptions[0].external, false, 'Banner keeps its parent');
assert.equal(h.center.getUnreadCount(), 3, 'use returned count, not subtraction');
await h.center.markRead(['n1']);
assert.equal(h.center.getUnreadCount(), 3, 'duplicate read changedCount=0 is valid');
await h.center.markReadThrough('global-head');
assert.equal(h.calls.through[0], 'global-head');
assert.equal(h.center.getUnreadCount(), 2);
h.center.stop();
assert.equal(h.timers.size, 0);
await h.center.pollOnce();
assert.equal(h.calls.summary.length, 3);
h.summaries([summary('restart')]);
h.center.start();
await drain();
assert.equal(h.calls.summary.at(-1), undefined, 'foreground restart establishes baseline');

const late = harness();
const pending = deferred();
late.summaries([pending.promise, summary('fresh', 0, '', 4)]);
late.center.start();
await drain();
late.center.stop();
late.center.start();
pending.resolve(summary('old', 3, 'old', 99));
await drain();
assert.equal(late.center.getUnreadCount(), 4);
assert.equal(late.emitted.filter((e) => e.name === 'banner').length, 0);
assert.equal(late.calls.summary.at(-1), undefined);
const expired = deferred();
late.summaries([expired.promise, summary('renewed')]);
const oldPoll = late.center.pollOnce();
await drain();
expired.reject({ problemType: '/problems/invalid-cursor' });
await oldPoll;
await late.center.pollOnce();
assert.equal(late.calls.summary.at(-1), undefined, 'invalid cursor rebuilds baseline');

const external = harness();
external.center.receiveExternalEntry({ notificationId: 'external-only' });
external.summaries([summary('base'), summary('head2', 2, 'external-only')]);
external.gets([
  item('external-only', { target: { type: 'ACTIVITY_DETAIL', activityId: 'deleted' } }),
]);
external.center.start();
await drain();
assert.equal(external.calls.get[0], 'external-only');
assert.equal(external.calls.read[0][0], 'external-only');
assert.equal(external.calls.navigate[0].activityId, 'deleted');
assert.equal(external.calls.navigationOptions[0].external, true);
assert.equal(external.calls.navigationOptions[0].isCurrent(), true);
await external.center.pollOnce();
assert.equal(
  external.emitted.filter((e) => e.name === 'banner').length,
  0,
  'suppressed preview cannot become aggregate banner',
);
external.reads([Promise.reject(new Error('write failed'))]);
await external.center.openNotification({
  id: 'retry',
  target: { type: 'POST_DETAIL', postId: 'p' },
});
assert.equal(
  external.calls.navigate.at(-1).postId,
  'p',
  'read failure must not block reliable navigation',
);
assert.equal(external.center.hasFailedReads(), true);
assert.equal(external.calls.navigationOptions.at(-1).external, false, 'Box keeps its parent');
const navigationCount = external.calls.navigate.length;
await external.center.retryFailedReads();
assert.equal(external.center.hasFailedReads(), false);
assert.equal(external.calls.navigate.length, navigationCount, 'retry writes only');
external.center.stop();
assert.equal(external.calls.navigationOptions[0].isCurrent(), false, 'hide invalidates navigation');

const superseded = harness();
superseded.center.start();
await drain();
const oldRead = deferred();
superseded.reads([oldRead.promise]);
superseded.gets([
  item('entry-a', { target: { type: 'POST_DETAIL', postId: 'a' } }),
  item('entry-b', { target: { type: 'POST_DETAIL', postId: 'b' } }),
]);
superseded.center.receiveExternalEntry({ notificationId: 'entry-a' });
await drain();
superseded.center.receiveExternalEntry({ notificationId: 'entry-b' });
await drain();
oldRead.resolve({ unreadCount: 0, changedCount: 1 });
await drain();
assert.equal(superseded.calls.navigate.length, 1, 'new external entry supersedes pending read');
assert.equal(superseded.calls.navigate[0].postId, 'b');

const identity = harness();
const accountRequest = deferred();
identity.summaries([accountRequest.promise, summary('u2-head', 0, '', 1)]);
identity.center.start();
await drain();
identity.setUser('u2');
identity.bus.emit('login');
accountRequest.resolve(summary('u1-head', 1, 'private-u1', 80));
await drain();
await identity.center.pollOnce();
assert.equal(identity.center.getUnreadCount(), 1);
assert.equal(identity.emitted.filter((e) => e.name === 'banner').length, 0);
identity.setUser(null);
identity.bus.emit('logout');
assert.equal(identity.center.getUnreadCount(), 0);
console.log(
  'notification: HTTP, structured cards, router, polling, read, suppression, external entry and identity tests passed',
);

// Page simulation: render-state transitions, server filters, stale requests and viewport batches.
const p = harness();
let pageDefinition;
const pageRequests = [];
let pageResults = [];
let observerCallback;
let disconnected = 0;
let deferRender = false;
const renderCallbacks = [];
const listLoad = load(
  'behaviors/useListLoad.ts',
  {
    '../utils/defineBehavior': { __esModule: true, default: () => (definition) => definition },
  },
  { ...p.globals, Date: { now: () => 1000 } },
);
const behavior = listLoad.useListLoad({
  skeletonDelay: 140,
  minSkeletonDuration: 280,
  defaultHasMore: false,
});
const pageService = {
  listNotifications: async (query) => {
    pageRequests.push(query);
    return await (pageResults.shift() ?? {
      items: [],
      hasMore: false,
      headCursor: 'head-empty',
    });
  },
  isInvalidNotificationCursor: (error) => error?.problemType === '/problems/invalid-cursor',
};
p.service.listNotifications = pageService.listNotifications;
load(
  'pages/message/message.ts',
  {
    '../../actions/notification-center': p.center,
    '../../actions/auth': { authReady: Promise.resolve(), ensureLogin: async () => {} },
    '../../services/notification': pageService,
    '../../stores/helper': { getUserId: () => 'u1' },
    '../../utils/event-bus': { eventBus: p.bus, EVENTS: p.events },
    '../../utils/tabbar': { getCustomTabBar: () => ({ init() {} }) },
    '../../utils/notify': {
      showErrorToast() {},
      showInfoToast() {},
      getErrorMessage: (e, fallback) => e.userMessage ?? e.message ?? fallback,
    },
    '../../behaviors/useListLoad': { useListLoad: () => behavior },
    '../../utils/definePage': {
      __esModule: true,
      default: (definition) => {
        pageDefinition = definition;
      },
    },
    './message-model': model,
  },
  {
    ...p.globals,
    wx: {
      getWindowInfo: () => ({ statusBarHeight: 20 }),
      getMenuButtonBoundingClientRect: () => ({ top: 26, height: 32 }),
      pageScrollTo() {},
      stopPullDownRefresh() {},
    },
  },
);
const page = {
  ...pageDefinition,
  ...behavior.methods,
  data: { ...pageDefinition.data, ...behavior.data },
  setData(patch, callback) {
    Object.assign(this.data, patch);
    if (callback) {
      if (deferRender) renderCallbacks.push(callback);
      else callback();
    }
  },
  createSelectorQuery() {
    return {
      select() {
        return this;
      },
      boundingClientRect(callback) {
        assert.notEqual(page.data.listLoad.phase, 'initial', 'query only after skeleton exit');
        assert.equal(page.data.listLoad.initialError, false);
        callback({ bottom: 180 });
        return this;
      },
      exec() {},
    };
  },
  createIntersectionObserver() {
    return {
      relativeToViewport() {
        return this;
      },
      observe(selector, callback) {
        assert.equal(selector, '.notification-card');
        observerCallback = callback;
      },
      disconnect() {
        disconnected++;
      },
    };
  },
};
behavior.lifetimes.attached.call(page);
for (const key of ['_visibleIds', '_attemptedIds', '_confirmedReadIds']) {
  assert.equal(pageDefinition[key], null, 'Page definition contains only simple placeholders');
}
page.onLoad();
const secondPage = {
  ...pageDefinition,
  data: { ...pageDefinition.data },
  setData(patch) {
    Object.assign(this.data, patch);
  },
};
secondPage.onLoad();
for (const key of ['_visibleIds', '_attemptedIds', '_confirmedReadIds']) {
  secondPage[key].add('other-instance');
  assert.equal(page[key].has('other-instance'), false, 'runtime Sets belong to each Page instance');
}
p.bus.off(p.events.NOTIFY_UNREAD_CHANGE, secondPage._onUnread);
p.bus.off(p.events.NOTIFY_LIST_REFRESH, secondPage._onRefresh);
p.bus.off(p.events.LOGIN_SUCCESS, secondPage._onIdentity);
p.bus.off(p.events.LOGOUT, secondPage._onIdentity);
pageResults = [
  {
    items: [item('a'), item('b')],
    hasMore: true,
    nextCursor: 'page-2',
    headCursor: 'global-a',
  },
];
page.onShow();
assert.equal(page.data.listLoad.phase, 'initial');
// Simulate a slow response: the real Behavior shows the skeleton before the list arrives.
const showSkeleton = p.timers.get(page._listLoadSkeletonShowTimer);
p.timers.delete(page._listLoadSkeletonShowTimer);
showSkeleton();
page.onReady();
await drain();
assert.equal(page.data.listLoad.phase, 'initial');
assert.equal(
  observerCallback,
  undefined,
  'cards remain unmounted during minimum skeleton duration',
);
const finishSkeleton = p.timers.get(page._listLoadSkeletonHideTimer);
assert.equal(typeof finishSkeleton, 'function');
p.timers.delete(page._listLoadSkeletonHideTimer);
deferRender = true;
finishSkeleton();
assert.equal(page.data.listLoad.phase, 'idle');
assert.equal(observerCallback, undefined, 'observer waits for the view-side setData completion');
deferRender = false;
renderCallbacks.splice(0).forEach((callback) => callback());
assert.equal(typeof observerCallback, 'function');
const idsBeforeExpansion = page.data.messages.map((message) => message.id).join(',');
page.onToggleMessage({ currentTarget: { dataset: { id: 'a' } } });
assert.equal(page.data.messages[0].expanded, true);
assert.equal(page.data.messages.map((message) => message.id).join(','), idsBeforeExpansion);
assert.equal(p.calls.read.length, 0, 'expansion alone never sends a read mutation');
assert.equal(page.data.messages[0].isRead, false);
page.onToggleMessage({ currentTarget: { dataset: { id: 'a' } } });
assert.equal(page.data.messages[0].expanded, false);
assert.equal(page.data.messages.length, 2);
assert.equal(p.calls.read.length, 0, 'network/render alone does not mark read');
observerCallback({ dataset: { id: 'a' }, intersectionRatio: 0.9 });
observerCallback({ dataset: { id: 'b' }, intersectionRatio: 0.6 });
assert.equal(p.calls.read.length, 0, 'viewport dwell is batched');
await page._readVisible();
assert.deepEqual(p.calls.read[0], ['a', 'b']);
assert.ok(page.data.messages.every((message) => message.isRead));
assert.equal(page.data.unreadCount, 3);
pageResults = [
  {
    items: [item('a'), item('b')],
    hasMore: true,
    nextCursor: 'page-2',
    headCursor: 'global-a',
  },
];
await page._loadMessages();
assert.ok(
  page.data.messages.every((message) => message.isRead),
  'a late list snapshot cannot undo an acknowledged read',
);
pageResults = [
  {
    items: [item('b'), item('c')],
    hasMore: false,
    headCursor: 'global-c',
  },
];
await page._loadMessages(true);
assert.equal(pageRequests.at(-1).cursor, 'page-2');
assert.equal(page.data.messages.length, 3);
assert.equal(page.data.listLoad.hasMore, false);
const oldList = deferred();
pageResults = [
  oldList.promise,
  {
    items: [item('system-page', { category: 'SYSTEM' })],
    hasMore: false,
    headCursor: 'global-system',
  },
];
const oldLoading = page._loadMessages();
await drain();
page.onSwitchFilter({ currentTarget: { dataset: { id: 'SYSTEM' } } });
await drain();
oldList.resolve({
  items: [item('late')],
  hasMore: false,
  headCursor: 'late-head',
});
await oldLoading;
await drain();
assert.equal(pageRequests.at(-1).boxCategory, 'SYSTEM');
assert.equal(pageRequests.at(-1).cursor, undefined);
assert.equal(page.data.messages[0].id, 'system-page');
assert.equal(page.data.headCursor, 'global-system');
await page.onMarkAllRead();
assert.equal(p.calls.through.at(-1), 'global-system', 'category read-all uses global head');
assert.equal(page.data.unreadCount, 2, 'all-read never forces zero');
assert.equal(page.data.messages.length, 0);
pageResults = [Promise.reject(new Error('list unavailable'))];
await page._loadMessages();
assert.equal(page.data.listLoad.initialError, true);
pageResults = [{ items: [], hasMore: false, headCursor: 'empty-global' }];
await page._loadMessages();
assert.equal(page.data.listLoad.initialError, false);
assert.equal(page.data.messages.length, 0);
// Leaving during the minimum skeleton duration must cancel the callback and recover on show.
const pendingInitial = deferred();
pageResults = [pendingInitial.promise];
const loadingBeforeHide = page._loadMessages();
await drain();
const pendingShowId = page._listLoadSkeletonShowTimer;
const pendingShow = p.timers.get(pendingShowId);
p.timers.delete(pendingShowId);
pendingShow();
pendingInitial.resolve({
  items: [item('before-hide')],
  hasMore: false,
  headCursor: 'before-hide',
});
await loadingBeforeHide;
assert.equal(page.data.listLoad.phase, 'initial');
const pendingHideId = page._listLoadSkeletonHideTimer;
assert.ok(p.timers.has(pendingHideId));
page.onHide();
assert.equal(p.timers.has(pendingHideId), false, 'hide cancels delayed skeleton completion');
assert.equal(page._dirty, true, 'show will recover an interrupted initial render');
assert.ok(disconnected > 0);
assert.equal(page._observer, null);
assert.equal(page._readTimer, undefined);
pageResults = [
  {
    items: [item('after-show')],
    hasMore: false,
    headCursor: 'after-show',
  },
];
page.onShow();
await drain();
assert.equal(page.data.listLoad.phase, 'idle');
assert.equal(page.data.messages[0].id, 'after-show');
assert.notEqual(page._observer, null);
page.onUnload();

// The actual Banner component: auto/swipe/close never emit a read intent.
let componentDefinition;
load(
  'components/in-app-banner/index.ts',
  {
    '../../utils/wx-promise': {
      wxGetWindowInfo: () => ({ statusBarHeight: 20 }),
      wxNavigateTo: async () => {},
    },
    '../../utils/defineComponent': {
      __esModule: true,
      default: () => (definition) => {
        componentDefinition = definition;
      },
    },
    '../../utils/event-bus': { eventBus: p.bus, EVENTS: p.events },
    '../../utils/routes': routes,
  },
  { ...p.globals, wx: {} },
);
const banner = {
  ...componentDefinition.methods,
  data: { ...componentDefinition.data },
  properties: { previewMode: false, duration: 4000, top: 80 },
  setData(patch) {
    Object.assign(this.data, patch);
  },
};
componentDefinition.lifetimes.attached.call(banner);
const countTaps = () => p.emitted.filter((event) => event.name === 'tap').length;
const startTaps = countTaps();
for (const reason of ['auto', 'swipe', 'close']) {
  banner._enqueue({ id: 'banner', title: '预览', structured: true });
  banner._dismissCurrent(reason);
  banner._resetBanner();
}
assert.equal(countTaps(), startTaps);
banner._enqueue({ id: 'click', title: '预览', structured: true });
banner.onTap();
assert.equal(countTaps(), startTaps + 1);
componentDefinition.pageLifetimes.hide.call(banner);
p.bus.emit('banner', { id: 'hidden', title: 'hidden' });
assert.equal(banner.data.visible, false, 'hidden Page does not queue banners');
componentDefinition.lifetimes.detached.call(banner);
console.log(
  'notification: Page viewport batching, pagination/filter races, load states, global read-through and Banner lifecycle simulations passed',
);

// Runtime protocol checks reject legacy/malformed responses rather than fabricating structured facts.
const errors = load('utils/error.ts');
let protocolList;
let protocolSummary;
let protocolRead;
let protocolItem = item('recover');
const protocolReadRequests = [];
const protocol = load('services/notification.ts', {
  './api': {
    api: {
      notify: {
        listNotifications: async () => protocolList,
        getSummary: async () => protocolSummary,
        getNotification: async () => protocolItem,
        batchRead: async (ids) => {
          protocolReadRequests.push([...ids]);
          return protocolRead;
        },
        readThrough: async () => protocolRead,
      },
    },
  },
  '../utils/error': errors,
});
protocolList = { items: [{ notificationId: 'legacy', isRead: true }] };
await assert.rejects(protocol.listNotifications());
protocolList = {
  items: [{ notificationId: 'legacy', isRead: true, title: '旧消息' }],
  hasMore: false,
  headCursor: 'head',
};
await assert.rejects(
  protocol.listNotifications(),
  'a valid envelope cannot admit legacy message fields',
);
const missingReadAt = item('missing-read-at', { isRead: true });
delete missingReadAt.readAt;
protocolList.items = [missingReadAt];
await assert.rejects(
  protocol.listNotifications(),
  'isRead cannot replace the canonical readAt fact',
);
protocolList = {
  items: [item('valid')],
  hasMore: true,
  headCursor: 'head',
};
await assert.rejects(protocol.listNotifications());
protocolList = {
  items: [item('valid')],
  hasMore: false,
  headCursor: 'head',
};
assert.equal((await protocol.listNotifications()).items[0].id, 'valid');
for (const fields of [{}, ...explicitSnapshots]) {
  protocolItem = item('recover', { presentation: { title: '回复', ...fields } });
  protocolList.items = [protocolItem];
  assert.equal(
    (await protocol.listNotifications()).items[0].presentation.subjectTitle,
    fields.subjectTitle,
  );
  assert.equal((await protocol.getNotification('recover')).presentation.quote, fields.quote);
}
for (const key of ['subjectTitle', 'quote']) {
  for (const invalid of [null, 42, {}, []]) {
    protocolItem = item('recover', { presentation: { title: '回复', [key]: invalid } });
    protocolList.items = [protocolItem];
    await assert.rejects(protocol.listNotifications());
    await assert.rejects(protocol.getNotification('recover'));
  }
}
protocolItem = item('recover');
protocolSummary = summary('head');
assert.equal((await protocol.getSummary()).unreadCount, 7);
protocolSummary = { ...summary('head'), newCount: 2, latestNewNotification: null };
await assert.rejects(protocol.getSummary());
protocolRead = { changedCount: 0, unreadCount: 9 };
assert.equal((await protocol.batchRead(['valid', 'valid'])).unreadCount, 9);
protocolRead = { changedCount: 1, unreadCount: -1 };
await assert.rejects(protocol.batchRead(['valid']));
await assert.rejects(protocol.batchRead([]));
await assert.rejects(protocol.getNotification('different'));
assert.equal(
  protocol.isInvalidNotificationCursor(
    new errors.HttpError(400, 'invalid', {
      problemType: '/problems/invalid-cursor',
    }),
  ),
  true,
);
assert.equal(protocol.isNotificationUnavailable(new errors.HttpError(404, 'gone')), true);
assert.equal(protocol.isNotificationUnavailable(new errors.HttpError(503, 'unavailable')), false);
assert.equal(protocol.isNotificationUnavailable(new Error('404 in text')), false);
console.log(
  'notification: malformed provider responses, read validation and safe cursor error classification passed',
);

// An overlapping summary cannot overwrite the newer read result, and only one poll is in flight.
const orderedCase = harness();
const slowSummary = deferred();
orderedCase.summaries([slowSummary.promise]);
orderedCase.center.start();
await drain();
await orderedCase.center.pollOnce();
assert.equal(orderedCase.calls.summary.length, 1);
const readAfterSummary = orderedCase.center.markRead(['read-while-polling']);
await drain();
assert.equal(orderedCase.calls.read.length, 0);
slowSummary.resolve(summary('baseline', 0, '', 40));
await readAfterSummary;
assert.equal(orderedCase.center.getUnreadCount(), 3);

// Failed recovery is not a fake read. A late recovery from another account never navigates.
const unavailable = harness();
unavailable.gets([Promise.reject(new Error('not found'))]);
unavailable.center.receiveExternalEntry({ notificationId: 'gone' });
unavailable.center.start();
await drain();
assert.equal(unavailable.calls.read.length, 0);
assert.equal(unavailable.calls.navigate.length, 0);
assert.equal(unavailable.calls.errors.length, 1);
const staleEntry = harness();
const delayedRecovery = deferred();
staleEntry.gets([delayedRecovery.promise, Promise.reject(new Error('not found'))]);
staleEntry.center.receiveExternalEntry({ notificationId: 'private' });
staleEntry.center.start();
await drain();
staleEntry.setUser('another-user');
staleEntry.bus.emit('login');
delayedRecovery.resolve(
  item('private', { target: { type: 'POST_DETAIL', postId: 'private-post' } }),
);
await drain();
assert.equal(staleEntry.calls.read.length, 0);
assert.equal(staleEntry.calls.navigate.length, 0);

// Invalid bounded read only refreshes the boundary; a new boundary requires another user action.
page._visible = true;
page.setData({ headCursor: 'expired-head', unreadCount: 4 });
const originalThrough = p.center.markReadThrough;
let boundedCalls = 0;
p.center.markReadThrough = async () => {
  boundedCalls++;
  throw { problemType: '/problems/invalid-cursor' };
};
pageResults = [{ items: [], hasMore: false, headCursor: 'replacement-head' }];
await page.onMarkAllRead();
assert.equal(boundedCalls, 1);
assert.equal(page.data.headCursor, 'replacement-head');
p.center.markReadThrough = originalThrough;
await page.onMarkAllRead();
assert.equal(p.calls.through.at(-1), 'replacement-head');
page.onHide();
console.log(
  'notification: single-flight/count ordering, external ownership and expired read-through regressions passed',
);

// 2026-09-30 Contract reconciliation: verify existing behavior without changing the consumer.
protocolRead = { changedCount: 0, unreadCount: 9 };
await protocol.batchRead(['n1', 'n1', 'n2']);
assert.equal(protocolReadRequests.at(-1).join(','), 'n1,n2');
await protocol.batchRead(Array.from({ length: 50 }, () => 'same-notification'));
assert.equal(protocolReadRequests.at(-1).length, 1);
await protocol.batchRead(Array.from({ length: 50 }, (_, index) => `n-${index}`));
assert.equal(protocolReadRequests.at(-1).length, 50);
const beforeOversize = protocolReadRequests.length;
await assert.rejects(protocol.batchRead(Array.from({ length: 51 }, (_, index) => `n-${index}`)));
assert.equal(protocolReadRequests.length, beforeOversize);
// The raw domain API does not reject allowed duplicates or alter their request body.
const rawDuplicateIds = Array.from({ length: 50 }, () => 'raw-duplicate');
await api.api.notify.batchRead(rawDuplicateIds);
assert.equal(httpCalls.at(-1).args[1].notificationIds.length, 50);

// Entry order intentionally contradicts both createdAt and public ID order.
const serverOrdered = [
  item('a-late-entry', { createdAt: '2026-09-28T12:00:00+08:00' }),
  item('z-previous-entry', { createdAt: '2026-09-30T12:00:00+08:00' }),
];
protocolList = {
  items: serverOrdered,
  hasMore: false,
  headCursor: 'opaque-global-head',
};
const orderedResponse = await protocol.listNotifications({ boxCategory: 'INTERACTION' });
const orderedCards = model.mergeNotificationCards([], orderedResponse.items);
assert.equal(orderedCards.map((card) => card.id).join(','), 'a-late-entry,z-previous-entry');
assert.equal(
  model
    .mergeNotificationCards(orderedCards, [serverOrdered[1], item('next-page')])
    .map((card) => card.id)
    .join(','),
  'a-late-entry,z-previous-entry,next-page',
);

// Canonical historical example: SYSTEM is its type, while ACTIVITY remains its reliable category.
const historicalFallback = {
  id: 'notification-historical-change-example',
  category: 'ACTIVITY',
  type: 'SYSTEM',
  presentation: { title: '活动时间已调整', body: '请查看主办方发布的最新安排。' },
  readAt: '2026-09-29T12:05:00+08:00',
  createdAt: '2026-09-29T12:00:00+08:00',
};
protocolList = {
  items: [historicalFallback],
  hasMore: false,
  headCursor: 'history-head',
};
const historicalCard = model.toNotificationCard((await protocol.listNotifications()).items[0]);
assert.equal(historicalCard.type, 'SYSTEM');
assert.equal(historicalCard.category, 'ACTIVITY');
assert.equal(historicalCard.tone, 'activity');
assert.equal(historicalCard.presentation.title, historicalFallback.presentation.title);
assert.equal(historicalCard.presentation.body, historicalFallback.presentation.body);
assert.equal(historicalCard.presentation.changes.length, 0);
assert.equal(historicalCard.target, undefined);
assert.equal(historicalCard.canNavigate, false);
assert.equal(
  historicalCard.layout,
  'general',
  'historical text is not guessed to be a structured change',
);
assert.equal(historicalCard.readAt, historicalFallback.readAt);
assert.equal(historicalCard.isRead, true);
await protocol.batchRead([historicalFallback.id]);
assert.equal(protocolReadRequests.at(-1)[0], historicalFallback.id);

// Points r6 correction remains a SYSTEM text snapshot with ordinary read behavior.
const correctedPoint = item('point-corrected', {
  category: 'SYSTEM',
  type: 'POINT_GRANT_CORRECTED',
  presentation: { title: '积分核发已更正', body: '原核发7分，现核发3分。' },
});
const correctedCard = model.toNotificationCard(correctedPoint);
assert.equal(correctedCard.tone, 'system');
assert.equal(correctedCard.layout, 'general');
assert.equal(correctedCard.canNavigate, false);
assert.equal(correctedCard.presentation.body, correctedPoint.presentation.body);
await protocol.batchRead([correctedPoint.id]);
assert.equal(protocolReadRequests.at(-1)[0], correctedPoint.id);
const correctedClick = harness();
await correctedClick.center.openNotification(correctedPoint);
assert.equal(correctedClick.calls.read.length, 1);
assert.equal(correctedClick.calls.navigate.length, 0);

// Consumer identity dedupe does not redefine the provider's Like occurrence rules.
const firstLike = item('like-first', {
  type: 'POST_LIKED',
  subject: { type: 'POST', resourceId: 'post' },
});
const repeatedLike = model.mergeNotificationCards(model.mergeNotificationCards([], [firstLike]), [
  firstLike,
]);
assert.equal(repeatedLike.length, 1);
const independentLike = model.mergeNotificationCards(repeatedLike, [
  { ...firstLike, id: 'another-provider-notification' },
]);
assert.equal(independentLike.length, 2, 'client must not invent actor/subject occurrence dedupe');
console.log(
  'notification: reconciliation duplicate requests, server stream order, Like identity and historical SYSTEM fallback passed',
);

// Lifecycle interactions use the actual owner + Page + Behavior with a stateful server double.
// Its clock and responses model Contract boundaries; this is NOT a real Backend verification.
const notFound = () => Object.assign(new Error('notification unavailable'), { statusCode: 404 });
const missingClick = harness();
missingClick.center.start();
await drain();
missingClick.reads([Promise.reject(notFound())]);
await missingClick.center.openNotification(
  item('deleted-on-another-device', {
    target: { type: 'POST_DETAIL', postId: 'old-target' },
  }),
);
assert.equal(missingClick.calls.navigate.length, 0, '404 must stop the old target');
assert.equal(missingClick.center.hasFailedReads(), false, 'unavailable IDs cannot poison retries');
assert.equal(missingClick.center.isUnavailable('deleted-on-another-device'), true);
await missingClick.center.retryFailedReads();
assert.equal(missingClick.calls.read.length, 1, 'no legacy or single-item read fallback');
missingClick.center.receiveExternalEntry({ notificationId: 'deleted-on-another-device' });
await drain();
assert.equal(missingClick.calls.get.length, 0, 'confirmed removal cannot recover from a cache');

const mixedBatch = harness();
mixedBatch.reads([Promise.reject(notFound())]);
await assert.rejects(mixedBatch.center.markRead(['expired-member', 'valid-member']));
assert.equal(
  mixedBatch.center.isUnavailable('valid-member'),
  false,
  '404 cannot identify a batch member',
);
assert.equal(mixedBatch.calls.read.length, 1);
assert.equal(mixedBatch.calls.get.length, 0, 'never probe members to replay a failed atomic read');
assert.equal(
  mixedBatch.emitted.filter((event) => event.name === 'refresh').length,
  0,
  'no fake read success',
);

const lateRecovery = harness();
const oldRecovery = deferred();
lateRecovery.gets([oldRecovery.promise]);
lateRecovery.center.receiveExternalEntry({ notificationId: 'removed-during-recovery' });
lateRecovery.center.start();
await drain();
await lateRecovery.center.deleteNotification('removed-during-recovery');
oldRecovery.resolve(
  item('removed-during-recovery', { target: { type: 'POST_DETAIL', postId: 'old' } }),
);
await drain();
assert.equal(lateRecovery.calls.navigate.length, 0);
assert.equal(
  lateRecovery.calls.read.length,
  0,
  'late single recovery cannot resurrect deleted notification',
);
const hiddenSnapshot = harness();
hiddenSnapshot.center.start();
await drain();
const oldInbox = deferred();
hiddenSnapshot.service.listNotifications = async () => await oldInbox.promise;
const hiddenLoading = hiddenSnapshot.center.loadNotifications({});
await drain();
hiddenSnapshot.center.stop();
oldInbox.resolve({
  items: [item('stale-hidden')],

  hasMore: false,
  headCursor: 'old',
});
hiddenSnapshot.summaries([summary('old', 0, '', 88)]);
await hiddenLoading;
assert.notEqual(
  hiddenSnapshot.center.getUnreadCount(),
  88,
  'late inbox summary cannot publish after foreground session ends',
);

p.center.start();
await drain();
let tabDefinition;
load('custom-tab-bar/index.ts', {
  '../utils/event-bus': { eventBus: p.bus, EVENTS: p.events },
  '../utils/wx-promise': { wxPageScrollTo() {}, wxSwitchTab() {} },
  '../utils/defineComponent': {
    __esModule: true,
    default: () => (definition) => {
      tabDefinition = definition;
    },
  },
  '../actions/notification-center': p.center,
  '../utils/routes': routes,
});
const tab = {
  ...tabDefinition.methods,
  data: structuredClone(tabDefinition.data),
  setData(patch) {
    for (const [key, value] of Object.entries(patch)) {
      const match = /^tabList\[(\d+)\]\.badge$/.exec(key);
      if (match) this.data.tabList[Number(match[1])].badge = value;
      else this.data[key] = value;
    }
  },
};
tabDefinition.lifetimes.attached.call(tab);
page.onLoad();
const windowMs = 90 * 24 * 60 * 60 * 1000;
const created = Date.parse('2026-07-31T08:00:00Z');
let serverNow = created + windowMs - 1;
let serverRows = [
  item('expiring-unread', { createdAt: new Date(created).toISOString() }),
  item('expiring-read', {
    createdAt: new Date(created).toISOString(),
    readAt: '2026-08-01T08:00:00Z',
  }),
  item('live', { createdAt: new Date(created + 10000).toISOString() }),
];
let deleted = new Set();
let writeCalls = 0;
let deleteFailure;
let nextList;
let listFailure;
let summaryFailure;
const visibleRows = () =>
  serverRows.filter(
    (row) => !deleted.has(row.id) && Date.parse(row.createdAt) + windowMs > serverNow,
  );
p.service.getSummary = async () => {
  if (summaryFailure) throw summaryFailure;
  return summary(
    'lifecycle-head',
    0,
    '',
    visibleRows().filter((row) => row.readAt === null).length,
  );
};
p.service.listNotifications = async (query) => {
  pageRequests.push(query);
  if (listFailure) throw listFailure;
  if (nextList) {
    const result = nextList;
    nextList = undefined;
    return await result;
  }
  const rows = visibleRows().filter(
    (row) => !query.boxCategory || row.category === query.boxCategory,
  );
  const offset = query.cursor ? Number(query.cursor) : 0;
  const hasMore = rows.length > offset + 3;
  return {
    items: rows.slice(offset, offset + 3),
    hasMore,
    ...(hasMore ? { nextCursor: String(offset + 3) } : {}),
    headCursor: offset ? 'later-page-head' : 'lifecycle-head',
  };
};
p.service.deleteNotification = async (id) => {
  writeCalls++;
  if (deleteFailure) throw deleteFailure;
  deleted.add(id);
};
p.service.batchRead = async (ids) => {
  const rows = visibleRows();
  if (ids.some((id) => !rows.some((row) => row.id === id))) throw notFound();
  ids.forEach((id) => {
    rows.find((row) => row.id === id).readAt = new Date(serverNow).toISOString();
  });
  return {
    changedCount: ids.length,
    unreadCount: rows.filter((row) => row.readAt === null).length,
  };
};
page.setData({ activeFilter: '', readError: false });
page.onShow();
await drain();
assert.equal(
  page.data.messages.length,
  3,
  'one millisecond before deadline both read/unread remain',
);
assert.equal(page.data.unreadCount, 2);
assert.equal(tab.data.tabList[2].badge, 2);
serverNow++;
await p.center.pollOnce();
await drain();
assert.equal(
  page.data.messages.map((row) => row.id).join(','),
  'live',
  'deadline removes both read and unread',
);
assert.equal(page.data.unreadCount, 1, 'natural expiry updates Badge without any write');
assert.equal(tab.data.tabList[2].badge, 1, 'actual TabBar consumes the same server count');
assert.equal(writeCalls, 0);
serverNow++;
await p.center.pollOnce();
await drain();
assert.equal(page.data.messages.length, 1, 'after cutoff no cached expiry resurrection');

const tap = (id) => ({ currentTarget: { dataset: { id } } });
await page.onDeleteMessage(tap('live'));
await drain();
assert.equal(page.data.messages.length, 0);
assert.equal(page.data.unreadCount, 0);
assert.equal(tab.data.tabList[2].badge, 0);
assert.equal(page.data.deletingId, '');
assert.equal(p.center.isUnavailable('live'), true);
await p.center.deleteNotification('live');
await drain();
assert.equal(page.data.unreadCount, 0, 'repeat DELETE never subtracts twice');

const fresh = (id, extra = {}) =>
  item(id, { createdAt: new Date(serverNow).toISOString(), ...extra });
serverRows = [fresh('batch-gone'), fresh('batch-valid')];
await page._loadMessages();
deleted.add('batch-gone');
page._visibleIds.add('batch-gone');
page._visibleIds.add('batch-valid');
await page._readVisible();
await drain();
assert.equal(page.data.messages.map((row) => row.id).join(','), 'batch-valid');
assert.equal(page.data.messages[0].isRead, false, 'atomic 404 leaves valid batch member unread');
assert.equal(page.data.unreadCount, 1);
assert.equal(serverRows[1].readAt, null, 'no partial retry mutation');
serverRows = [fresh('remove'), fresh('keep'), fresh('next'), fresh('last')];
await page._loadMessages();
assert.equal(page.data.messages.length, 3);
const stalePage = deferred();
nextList = stalePage.promise;
const pendingPage = page._loadMessages(true);
await drain();
const deletion = page.onDeleteMessage(tap('remove'));
const writesBeforeDuplicate = writeCalls;
await page.onDeleteMessage(tap('remove'));
assert.equal(writeCalls, writesBeforeDuplicate, 'pending delete is guarded');
stalePage.resolve({
  items: [fresh('remove'), fresh('last')],
  hasMore: false,
  headCursor: 'newer-head',
});
await pendingPage;
assert.equal(page.data.headCursor, 'lifecycle-head', 'pagination retains fixed global head');
await deletion;
await drain();
assert.equal(
  page.data.messages.some((row) => row.id === 'remove'),
  false,
);
assert.equal(page.data.unreadCount, 3);
// A stale cached page returned even after removal is filtered by the login-session tombstone.
nextList = Promise.resolve({
  items: [fresh('remove'), fresh('live'), fresh('keep')],
  hasMore: false,
  headCursor: 'old-cache',
});
await page._loadMessages();
assert.equal(page.data.messages.map((row) => row.id).join(','), 'keep');

deleteFailure = new Error('network timeout: result unknown');
await page.onDeleteMessage(tap('keep'));
await drain();
assert.equal(
  page.data.messages.some((row) => row.id === 'keep'),
  true,
  'failure preserves server-visible item',
);
assert.equal(p.center.isUnavailable('keep'), false, 'failed DELETE is not confirmed removal');
deleteFailure = undefined;
// A response lost after server commit is resolved by reads, without automatic DELETE retry.
p.service.deleteNotification = async (id) => {
  writeCalls++;
  deleted.add(id);
  throw new Error('lost response');
};
const beforeLostResponse = writeCalls;
await page.onDeleteMessage(tap('keep'));
await drain();
assert.equal(writeCalls, beforeLostResponse + 1);
assert.equal(
  page.data.messages.some((row) => row.id === 'keep'),
  false,
);
assert.equal(page.data.unreadCount, 2);

deleted.add('next'); // Another device deletes a previously displayed notification.
await p.center.pollOnce();
await drain();
assert.equal(page.data.messages.map((row) => row.id).join(','), 'last');
assert.equal(page.data.unreadCount, 1);
page.onHide();
assert.equal(page.data.messages.length, 0, 'hidden Page cannot restore old backend snapshots');
deleted.add('last');
page.onShow();
await drain();
assert.equal(page.data.messages.length, 0);
assert.equal(page.data.unreadCount, 0, 're-entry fetches both list and summary');

serverRows = [fresh('list-error')];
await page._loadMessages();
deleted.add('list-error');
listFailure = new Error('list unavailable');
await p.center.pollOnce();
await drain();
assert.equal(
  page.data.messages.length,
  0,
  'failed reconciliation cannot retain removed cached cards',
);
assert.equal(page.data.listLoad.initialError, true);
listFailure = undefined;
serverRows = [fresh('summary-error')];
await page._loadMessages();
summaryFailure = new Error('summary unavailable');
p.service.deleteNotification = async (id) => {
  deleted.add(id);
};
await page.onDeleteMessage(tap('summary-error'));
await drain();
assert.equal(page.data.messages.length, 0, 'confirmed delete survives summary outage');
assert.equal(p.center.isUnreadKnown(), false, 'no fabricated Badge when post-delete summary fails');
assert.equal(tab.data.tabList[2].badge, 0, 'unknown count hides stale TabBar Badge');
summaryFailure = undefined;
await page._loadMessages();
assert.equal(page.data.unreadKnown, true);
assert.equal(page.data.unreadCount, 0);
page.onUnload();
tabDefinition.lifetimes.detached.call(tab);
p.center.stop();
console.log(
  'notification: lifecycle DELETE, 90-day boundary, atomic 404, no stale navigation/recovery/pages, cross-device refresh, duplicate guards, unknown write outcomes and re-entry passed (server/wx doubles only)',
);
