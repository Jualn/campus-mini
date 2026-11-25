import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Requires a matching isolated Backend fixture launcher (the old CrossEnd launcher is retired).
// No default business server or credentials; syntax checks do not establish HTTP integration.
const base = process.env.NOTIFICATION_HTTP_BASE;
const fixtureBase = process.env.NOTIFICATION_FIXTURE_BASE;
const evidence = process.env.NOTIFICATION_EVIDENCE;
for (const value of [base, fixtureBase]) assert.match(value ?? '', /^http:\/\/127\.0\.0\.1:\d+$/);
assert.ok(evidence && process.env.NOTIFICATION_FIXTURE_KEY, 'isolated Java harness required');
const exchanges = [];
const checks = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const gate = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
async function wire(method, route, token, body, label = 'http') {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12000),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : '';
  exchanges.push({
    label,
    method,
    route,
    status: response.status,
    cacheControl: response.headers.get('cache-control'),
    body: route.startsWith('/v1/auth') ? '<login credential redacted>' : data,
  });
  return { status: response.status, data, header: Object.fromEntries(response.headers) };
}
async function fixture(action, fields = {}) {
  const response = await fetch(fixtureBase + '/fixture', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Fixture-Key': process.env.NOTIFICATION_FIXTURE_KEY,
    },
    body: JSON.stringify({ action, ...fields }),
    signal: AbortSignal.timeout(12000),
  });
  assert.equal(response.status, 200, `fixture ${action}`);
  return response.json();
}
const created = async (key, fields = {}) =>
  String((await fixture('create', { key, ...fields })).id);
const check = (name) => {
  checks.push({ name, status: 'PASS' });
  console.log(`PASS ${name}`);
};

const noAuth = await wire('GET', '/v1/users/me/notifications/summary');
assert.equal(noAuth.status, 401);
const login = async (code) => {
  const result = await wire('POST', '/v1/auth/login', undefined, { code });
  assert.equal(result.status, 200);
  assert.equal(result.data.code, 200);
  return result.data.data;
};
const [sessionA, sessionB, other] = [
  await login('cross-session-a'),
  await login('cross-session-b'),
  await login('cross-other-user'),
];
assert.ok(sessionA.token !== sessionB.token, 'two real non-shared Sa sessions');
assert.equal(String(sessionA.userInfo.id), String(sessionB.userInfo.id));
assert.notEqual(String(sessionA.userInfo.id), String(other.userInfo.id));
assert.equal(
  (await wire('GET', '/v1/users/me/notifications/summary', 'invalid-token')).status,
  401,
);
check(
  'real HTTP login, distinct same-account sessions, Redis-backed authentication and unauthorized denial',
);

function client(session, label) {
  const modules = new Map();
  const pending = new Set();
  const navigation = [];
  const hints = [];
  let held;
  let failDelete = false;
  let loseDeleteResponse = false;
  const config = { baseURL: base, timeout: 12000, notificationPollIntervalMs: 600000 };
  const logger = { info() {}, debug() {}, warn() {}, error() {} };
  const globals = {
    console,
    getCurrentPages: () => [],
    setTimeout: (callback, delay) => {
      const timer = setTimeout(callback, delay);
      timer.unref();
      return timer;
    },
    clearTimeout,
    wx: {
      request(options) {
        const work = (async () => {
          try {
            const url = new URL(options.url);
            if (options.method === 'GET')
              for (const [key, value] of Object.entries(options.data ?? {}))
                url.searchParams.set(key, String(value));
            if (failDelete && options.method === 'DELETE') {
              failDelete = false;
              await fetch('http://127.0.0.1:1', { signal: AbortSignal.timeout(500) });
            }
            const authorization = options.header?.Authorization;
            assert.ok(
              authorization === `Bearer ${session.token}`,
              'actual request boundary must attach the current session',
            );
            const response = await wire(
              options.method,
              url.pathname + url.search,
              authorization.slice('Bearer '.length),
              options.method === 'GET' ? undefined : options.data,
              label,
            );
            if (loseDeleteResponse && options.method === 'DELETE') {
              loseDeleteResponse = false;
              throw new Error('injected lost response after real server commit');
            }
            if (held?.matches(options.method, url)) {
              const current = held;
              held = undefined;
              current.arrived.resolve(response);
              await current.release.promise;
            }
            options.success({
              statusCode: response.status,
              data: response.data,
              header: response.header,
            });
          } catch (error) {
            options.fail({ errMsg: String(error) });
          }
        })();
        pending.add(work);
        void work.finally(() => pending.delete(work));
        return { abort() {} };
      },
      getWindowInfo: () => ({ statusBarHeight: 20 }),
      getMenuButtonBoundingClientRect: () => ({ top: 26, height: 32 }),
      stopPullDownRefresh() {},
      pageScrollTo() {},
    },
  };
  const stub = (relative, value) => modules.set(path.resolve(relative), value);
  stub('config/index.ts', { __esModule: true, default: config });
  stub('utils/logger.ts', { createLogger: () => logger });
  stub('utils/notify.ts', {
    showErrorToast: (error) => hints.push(String(error)),
    showInfoToast: (message) => hints.push(message),
  });
  stub('utils/wx-promise.ts', {
    wxShowLoading() {},
    wxHideLoading() {},
    wxNavigateTo: async (route) => navigation.push(route.url),
    wxRedirectTo: async (route) => navigation.push(route.url),
    wxReLaunch: async () => {},
  });
  stub('utils/auth-transport.ts', {
    getAuthToken: async () => session.token,
    recoverAuthToken: async () => {
      throw new Error('unexpected auth recovery');
    },
  });
  stub('utils/transfer.ts', { upload() {}, download() {} });
  stub('utils/stream.ts', { stream() {} });
  stub('stores/helper.ts', {
    getUserId: () => String(session.userInfo.id),
    isLoggedIn: () => true,
  });
  stub('actions/auth.ts', { authReady: Promise.resolve(), ensureLogin: async () => {} });
  stub('utils/time-util.ts', { formatTime: (value) => value, TimeStyle: { POST: 'post' } });
  stub('utils/defineBehavior.ts', { __esModule: true, default: () => (definition) => definition });
  let definition;
  stub('utils/definePage.ts', {
    __esModule: true,
    default: (value) => {
      definition = value;
    },
  });
  let tabDefinition;
  stub('utils/defineComponent.ts', {
    __esModule: true,
    default: () => (value) => {
      tabDefinition = value;
    },
  });
  stub('utils/tabbar.ts', { getCustomTabBar: () => ({ init() {} }) });
  function load(relative) {
    const file = path.resolve(relative);
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInNewContext(
      code,
      {
        ...globals,
        exports,
        require: (name) => {
          assert.ok(name.startsWith('.'), `unexpected runtime dependency ${name}`);
          return load(path.resolve(path.dirname(file), name + '.ts'));
        },
      },
      { filename: file },
    );
    return exports;
  }
  const center = load('actions/notification-center.ts');
  const service = load('services/notification.ts');
  const behavior = load('behaviors/useListLoad.ts').useListLoad({
    skeletonDelay: 140,
    minSkeletonDuration: 280,
    defaultHasMore: false,
  });
  load('pages/message/message.ts');
  const page = {
    ...definition,
    ...behavior.methods,
    data: structuredClone({ ...definition.data, ...behavior.data }),
    setData(patch, callback) {
      Object.assign(this.data, patch);
      callback?.();
    },
    createSelectorQuery() {
      return {
        select() {
          return this;
        },
        boundingClientRect(callback) {
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
        observe() {},
        disconnect() {},
      };
    },
  };
  behavior.lifetimes.attached.call(page);
  page.onLoad();
  page.onReady();
  load('custom-tab-bar/index.ts');
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
  return {
    center,
    service,
    page,
    tab,
    navigation,
    hints,
    async settle() {
      for (let attempt = 0; attempt < 500; attempt++) {
        await sleep(10);
        if (!pending.size && !page._loading && page.data.listLoad.phase !== 'initial') {
          await sleep(20);
          if (!pending.size && !page._loading) return;
        }
      }
      throw new Error(`${label} did not settle`);
    },
    hold(matches) {
      const value = { matches, arrived: gate(), release: gate() };
      held = value;
      return value;
    },
    failDelete() {
      failDelete = true;
    },
    loseDeleteResponse() {
      loseDeleteResponse = true;
    },
    close() {
      center.stop();
      page.onUnload();
      tabDefinition.lifetimes.detached.call(tab);
      behavior.lifetimes.detached.call(page);
    },
  };
}

const a = client(sessionA, 'session-a');
const b = client(sessionB, 'session-b');
const tap = (id) => ({ currentTarget: { dataset: { id } } });
const ids = (consumer) => consumer.page.data.messages.map((row) => row.id);
async function consistent(consumer) {
  await consumer.settle();
  const summary = await consumer.service.getSummary();
  assert.equal(consumer.center.getUnreadCount(), summary.unreadCount);
  assert.equal(consumer.page.data.unreadCount, summary.unreadCount);
  assert.equal(consumer.tab.data.tabList[2].badge, summary.unreadCount);
}
try {
  const deletedId = await created('deleted', { postTarget: true });
  const unknownId = await created('unknown', { unknownTarget: true });
  const activityId = await created('activity-reminder', { type: 'ACTIVITY_START_REMINDER' });
  const foreignId = await created('foreign', { other: true });
  a.center.start();
  b.center.start();
  a.page.onShow();
  b.page.onShow();
  await a.settle();
  await b.settle();
  assert.ok(ids(a).includes(deletedId) && ids(a).includes(activityId));
  assert.equal((await a.service.getNotification(unknownId)).target.type, 'UNRECOGNIZED_TARGET');
  await a.center.openNotification(await a.service.getNotification(unknownId));
  assert.equal(a.navigation.length, 0, 'unknown target preserves text/read and cannot navigate');
  assert.ok(a.page.data.messages.find((row) => row.id === unknownId).isRead);
  const firstReadAt = (await a.service.getNotification(unknownId)).readAt;
  assert.equal((await a.center.markRead([unknownId])).changedCount, 0);
  assert.equal((await a.service.getNotification(unknownId)).readAt, firstReadAt);
  await consistent(a);
  assert.equal(
    (await wire('GET', `/v1/users/me/notifications/${foreignId}`, sessionA.token)).status,
    404,
  );
  assert.equal(
    (await wire('DELETE', `/v1/users/me/notifications/${deletedId}`, other.token)).status,
    204,
  );
  assert.equal(
    (await wire('GET', `/v1/users/me/notifications/${deletedId}`, sessionA.token)).status,
    200,
  );
  check(
    'first-release list/detail, activity reminder, unknown target/read and cross-user isolation',
  );

  await b.page.onDeleteMessage(tap(deletedId));
  await b.settle();
  assert.ok(!ids(b).includes(deletedId));
  await a.center.openNotification(a.page.data.messages.find((row) => row.id === deletedId));
  await a.settle();
  assert.equal(a.navigation.length, 0, 'real batch-read 404 blocks old POST target');
  assert.equal(a.center.hasFailedReads(), false);
  assert.ok(!ids(a).includes(deletedId));
  assert.equal(
    (await wire('DELETE', `/v1/users/me/notifications/${deletedId}`, sessionB.token)).status,
    204,
  );
  a.page.onHide();
  a.page.onShow();
  await a.settle();
  assert.ok(!ids(a).includes(deletedId));
  await consistent(a);
  const replay = await fixture('create', { key: 'deleted', postTarget: true });
  assert.equal(replay.outcome, 'DUPLICATE');
  assert.equal(String(replay.id), deletedId);
  assert.equal(
    (await wire('GET', `/v1/users/me/notifications/${deletedId}`, sessionA.token)).status,
    404,
  );
  check(
    'cross-session DELETE, repeated 204, real 404 click rejection, re-entry and source replay cannot resurrect',
  );

  const viewportGone = await created('viewport-gone');
  const viewportValid = await created('viewport-valid');
  await a.page._loadMessages();
  await a.settle();
  await b.service.deleteNotification(viewportGone);
  a.page._visibleIds.add(viewportGone);
  a.page._visibleIds.add(viewportValid);
  await a.page._readVisible();
  await a.settle();
  assert.ok(!ids(a).includes(viewportGone));
  assert.equal(a.page.data.messages.find((row) => row.id === viewportValid).isRead, false);
  assert.equal((await a.service.getNotification(viewportValid)).readAt, null);
  await consistent(a);
  check(
    'Page viewport batch receives real atomic 404, removes hidden member and keeps valid member unread',
  );

  const expiredId = await created('natural-expiry');
  await fixture('age', { id: expiredId, secondsUntilExpiry: 3 });
  await fixture('cache');
  await a.page._loadMessages();
  await a.settle();
  assert.ok(ids(a).includes(expiredId));
  const beforeExpiry = (await a.service.getSummary()).unreadCount;
  await sleep(3100); // Pure passage of time, no intervening writes or cleanup.
  await a.center.pollOnce();
  await a.settle();
  assert.ok(!ids(a).includes(expiredId));
  assert.equal((await a.service.getSummary()).unreadCount, beforeExpiry - 1);
  const afterExpiry = (await a.service.getSummary()).unreadCount;
  for (const route of [
    `/v1/users/me/notifications/${expiredId}`,
    '/v1/users/me/notifications/unread-count',
  ]) {
    const response = await wire('GET', route, sessionA.token);
    assert.equal(response.status, route.includes(`/notifications/${expiredId}`) ? 404 : 200);
    if (route === '/v1/users/me/notifications/unread-count') {
      assert.equal(
        typeof response.data.unreadCount,
        'number',
        'canonical count must be a Contract integer',
      );
      assert.equal(response.data.unreadCount, afterExpiry);
    }
  }
  assert.equal(
    (
      await wire('PUT', `/v1/users/me/notifications/${expiredId}/read-state`, sessionA.token, {
        isRead: true,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await wire('POST', '/v1/users/me/notifications:batch-read', sessionA.token, {
        notificationIds: [expiredId, activityId],
      })
    ).status,
    404,
  );
  const currentList = await wire('GET', '/v1/users/me/notifications', sessionA.token);
  assert.equal(currentList.status, 200);
  assert.ok(Array.isArray(currentList.data.items));
  assert.ok(!Object.hasOwn(currentList.data, 'representation'));
  assert.ok(!currentList.data.items.some((row) => [expiredId, deletedId].includes(row.id)));
  const unsupportedRepresentation = await wire(
    'GET',
    '/v1/users/me/notifications?representation=structured',
    sessionA.token,
  );
  assert.equal(
    unsupportedRepresentation.status,
    400,
    'first release rejects representation negotiation',
  );
  let facts = await fixture('stats');
  assert.equal(
    facts.rows.find((row) => String(row.id) === activityId).read_at,
    null,
    'mixed atomic batch writes zero',
  );
  await consistent(a);
  check(
    'natural 90-day expiry despite stale Redis projection: list/detail/read/batch/count/Badge agree',
  );

  const lateId = await created('late-list');
  await a.page._loadMessages();
  await b.page._loadMessages();
  await a.settle();
  await b.settle();
  const held = a.hold(
    (method, url) => method === 'GET' && url.pathname === '/v1/users/me/notifications',
  );
  const loading = a.page._loadMessages();
  await held.arrived.promise;
  await b.page.onDeleteMessage(tap(lateId));
  await b.settle();
  const reconciling = a.center.pollOnce();
  held.release.resolve();
  await loading;
  await reconciling;
  await a.settle();
  assert.ok(!ids(a).includes(lateId));
  await consistent(a);
  const recoverId = await created('late-recovery', { postTarget: true });
  const recovery = a.hold(
    (method, url) => method === 'GET' && url.pathname.endsWith('/' + recoverId),
  );
  a.center.receiveExternalEntry({ notificationId: recoverId });
  await recovery.arrived.promise;
  await b.service.deleteNotification(recoverId);
  recovery.release.resolve();
  await a.settle();
  assert.equal(a.navigation.length, 0);
  assert.equal(
    (await wire('GET', `/v1/users/me/notifications/${recoverId}`, sessionB.token)).status,
    404,
  );
  check(
    'real HTTP responses delayed at wx delivery cannot restore deleted list items or external targets',
  );

  const networkId = await created('network-failure');
  await a.page._loadMessages();
  await a.settle();
  a.failDelete();
  await a.page.onDeleteMessage(tap(networkId));
  await a.settle();
  assert.ok(ids(a).includes(networkId));
  assert.equal(a.center.isUnavailable(networkId), false);
  a.loseDeleteResponse();
  await a.page.onDeleteMessage(tap(networkId));
  await a.settle();
  assert.ok(!ids(a).includes(networkId));
  assert.equal(
    exchanges.filter(
      (entry) =>
        entry.label === 'session-a' &&
        entry.method === 'DELETE' &&
        entry.route.endsWith('/' + networkId),
    ).length,
    1,
    'no automatic DELETE replay',
  );
  await consistent(a);
  check(
    'connection refusal and response loss after real DELETE commit reconcile without false success or automatic replay',
  );

  const concurrentRead = await created('concurrent-read');
  const concurrentDelete = await created('concurrent-delete');
  const concurrent = await Promise.all([
    a.center.markRead([concurrentRead]),
    b.center.deleteNotification(concurrentDelete),
    fixture('create', { key: 'concurrent-new' }),
  ]);
  await a.center.pollOnce();
  await a.settle();
  await consistent(a);
  assert.notEqual((await a.service.getNotification(concurrentRead)).readAt, null);
  assert.equal(
    (await wire('GET', `/v1/users/me/notifications/${concurrentDelete}`, sessionA.token)).status,
    404,
  );
  assert.equal((await a.service.getNotification(String(concurrent[2].id))).readAt, null);
  check('simultaneous real HTTP read/delete and internal new event converge list/summary/Badge');

  for (let index = 0; index < 23; index++) await created('page-' + index);
  await a.page._loadMessages();
  await a.settle();
  assert.ok(a.page.data.nextCursor);
  const head = a.page.data.headCursor;
  const newId = await created('after-fixed-head');
  await a.page._loadMessages(true);
  await a.settle();
  assert.equal(a.page.data.headCursor, head, 'pagination retains initial head');
  const oldMember = ids(a).find((id) => id !== unknownId && id !== activityId);
  await wire('DELETE', `/v1/users/me/notifications/${oldMember}`, sessionB.token);
  const readAll = await a.center.markReadThrough(head);
  assert.ok(readAll.unreadCount >= 1);
  assert.equal(
    (await a.service.getNotification(newId)).readAt,
    null,
    'newer arrival excluded from fixed head',
  );
  await a.page._loadMessages();
  await consistent(a);
  a.page.onSwitchFilter(tap('ACTIVITY'));
  await a.settle();
  assert.ok(a.page.data.messages.every((row) => row.category === 'ACTIVITY'));
  const activityReplay = await fixture('create', {
    key: 'activity-reminder',
    type: 'ACTIVITY_START_REMINDER',
  });
  assert.equal(String(activityReplay.id), activityId);
  await a.service.batchRead([activityId]);
  assert.notEqual((await a.service.getNotification(activityId)).readAt, null);
  await a.center.markReadThrough((await a.service.getSummary()).headCursor);
  await a.center.pollOnce();
  await a.settle();
  await consistent(a);
  assert.equal(a.center.getUnreadCount(), 0);
  facts = await fixture('stats');
  assert.equal(
    facts.rows.find((row) => String(row.id) === expiredId).read_at,
    null,
    'bounded read-through skips expired facts',
  );
  check(
    'pagination/category/global fixed head, concurrent new arrival/read/delete and canonical event dedupe',
  );

  await fixture('cleanup');
  assert.equal((await fixture('stats')).protectedCount, 20);
  assert.equal((await fixture('create', { key: 'natural-expiry' })).outcome, 'DUPLICATE');
  assert.equal(
    (await wire('GET', `/v1/users/me/notifications/${expiredId}`, sessionA.token)).status,
    404,
  );
  check(
    'cleanup preserves 20 unclassified synthetic rows and source replay after physical cleanup stays absent',
  );
} finally {
  a.close();
  b.close();
  fs.writeFileSync(path.join(evidence, 'http-exchanges.json'), JSON.stringify(exchanges, null, 2));
  fs.writeFileSync(
    path.join(evidence, 'client-results.json'),
    JSON.stringify(
      {
        scope:
          'actual Mini Program TS request/API/service/owner/Page/Behavior/TabBar with real HTTP; native wx view and upstream WeChat identity are substitutes',
        checks,
        realDevices: 'NOT RUN',
        officialAccountSend: 'NOT RUN',
        miniProgramSubscriptionSend: 'NOT RUN',
      },
      null,
      2,
    ),
  );
}
