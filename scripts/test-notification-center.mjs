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
const api = load('services/api.ts', { '../utils/request': { http }, '../utils/config': {} });
await api.api.notify.getStructuredList({ boxCategory: 'ACTIVITY', cursor: 'page-token' });
await api.api.notify.getSummary('head-token');
await api.api.notify.getNotification('opaque/id');
await api.api.notify.batchRead(['opaque']);
await api.api.notify.readThrough('global-head');
assert.equal(httpCalls[0].args[1].representation, 'structured');
assert.equal(httpCalls[0].args[1].boxCategory, 'ACTIVITY');
assert.equal(httpCalls[1].args[1].afterCursor, 'head-token');
assert.equal(httpCalls[2].args[0], '/v1/users/me/notifications/opaque%2Fid');
assert.equal(httpCalls[3].args[0], '/v1/users/me/notifications:batch-read');
assert.equal(httpCalls[4].args[1].throughCursor, 'global-head');
assert.ok(httpCalls.every((call) => call.args.at(-1).sensitive));

const routes = load('utils/routes.ts');
const navigation = [];
const hints = [];
const router = load('utils/notification-target.ts', {
  './routes': routes,
  './wx-promise': { wxNavigateTo: async (route) => navigation.push(route.url) },
  './notify': { showInfoToast: (message) => hints.push(message) },
});
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
  const calls = { summary: [], read: [], through: [], get: [], navigate: [], errors: [] };
  let summaries = [];
  let reads = [];
  let gets = [];
  const service = {
    getSummary: async (cursor) => {
      calls.summary.push(cursor);
      return await (summaries.shift() ?? summary('head'));
    },
    batchRead: async (ids) => {
      calls.read.push([...ids]);
      return await (reads.shift() ?? { changedCount: 0, unreadCount: 3 });
    },
    readThrough: async (cursor) => {
      calls.through.push(cursor);
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
      navigateNotificationTarget: async (target) => calls.navigate.push(target),
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
const navigationCount = external.calls.navigate.length;
await external.center.retryFailedReads();
assert.equal(external.center.hasFailedReads(), false);
assert.equal(external.calls.navigate.length, navigationCount, 'retry writes only');

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
      representation: 'structured',
      items: [],
      hasMore: false,
      headCursor: 'head-empty',
    });
  },
  isInvalidNotificationCursor: (error) => error?.problemType === '/problems/invalid-cursor',
};
load(
  'pages/message/message.ts',
  {
    '../../actions/notification-center': p.center,
    '../../actions/auth': { authReady: Promise.resolve(), ensureLogin: async () => {} },
    '../../services/notification': pageService,
    '../../stores/helper': { getUserId: () => 'u1' },
    '../../utils/event-bus': { eventBus: p.bus, EVENTS: p.events },
    '../../utils/tabbar': { getCustomTabBar: () => ({ init() {} }) },
    '../../utils/notify': { showErrorToast() {}, showInfoToast() {} },
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
    representation: 'structured',
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
    representation: 'structured',
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
    representation: 'structured',
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
    representation: 'structured',
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
  representation: 'structured',
  items: [item('late')],
  hasMore: false,
  headCursor: 'late-head',
});
await oldLoading;
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
pageResults = [
  { representation: 'structured', items: [], hasMore: false, headCursor: 'empty-global' },
];
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
  representation: 'structured',
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
    representation: 'structured',
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
        getStructuredList: async () => protocolList,
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
  representation: 'structured',
  items: [item('valid')],
  hasMore: true,
  headCursor: 'head',
};
await assert.rejects(protocol.listNotifications());
protocolList = {
  representation: 'structured',
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
pageResults = [
  { representation: 'structured', items: [], hasMore: false, headCursor: 'replacement-head' },
];
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
  representation: 'structured',
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
  representation: 'structured',
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
