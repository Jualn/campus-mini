import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const canonical = fs.readFileSync(
  path.resolve(root, '../contracts/api/schemas/notification.yaml'),
  'utf8',
);
const fixture = [
  ...canonical.matchAll(
    /- \{category: ([A-Z_]+), notificationType: ([A-Z_]+), channel: ([A-Z_]+), available: (true|false), permission: ([A-Z_]+), unavailableReasons: \[([^\]]*)\]\}/g,
  ),
].map(([, category, notificationType, channel, available, permission, reasons]) => ({
  category,
  notificationType,
  channel,
  available: available === 'true',
  permission,
  unavailableReasons: reasons ? reasons.split(', ') : [],
}));
assert.equal(fixture.length, 99, 'fixtures track the accepted complete canonical example');
const clone = (value) => JSON.parse(JSON.stringify(value));
const categories = [...new Set(fixture.map((item) => item.category))];
const channels = ['IN_APP', 'WECHAT_MINI_PROGRAM', 'WECHAT_OFFICIAL_ACCOUNT'];
const defaults = () => ({
  defaultVersion: '1',
  items: categories.flatMap((category) =>
    channels.map((channel) => ({
      category,
      channel,
      enabled: channel === 'IN_APP',
      source: 'SYSTEM_DEFAULT',
    })),
  ),
});
const capabilities = () => ({ evaluatedAt: '2026-11-20T10:00:00+08:00', items: clone(fixture) });
const option = (templateId, title, subscriptionKind = 'ONE_TIME', cats = ['COMMENT', 'REPLY']) => ({
  templateId,
  title,
  subscriptionKind,
  categories: cats,
  notificationTypes: ['POST_COMMENTED'],
});
let preferences = defaults();
let catalog = {
  evaluatedAt: '2026-11-20T10:00:00+08:00',
  configurationRevision: 'r1',
  maxTemplatesPerRequest: 3,
  items: [option('template-a', '评论提醒'), option('template-b', '回复提醒')],
};
let userId = 'user-a';
let page;
let settings = { mainSwitch: true, itemSettings: {} };
let settingsFail = false;
let platform = 'ios';
let version = '8.0.0';
const nativeCalls = [],
  writes = [],
  toasts = [],
  listeners = new Map();
const eventBus = {
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
  },
  off(event, fn) {
    listeners.get(event)?.delete(fn);
  },
  emit(event) {
    for (const fn of listeners.get(event) || []) fn();
  },
};
const api = {
  notify: {
    getPreferences: async () => clone(preferences),
    getChannelCapabilities: async () => capabilities(),
    batchUpdatePreferences: async ({ changes }) => {
      writes.push(clone(changes));
      for (const change of changes) {
        Object.assign(
          preferences.items.find(
            (item) => item.category === change.category && item.channel === change.channel,
          ),
          {
            enabled: change.enabled === null ? change.channel === 'IN_APP' : change.enabled,
            source: change.enabled === null ? 'SYSTEM_DEFAULT' : 'USER_OVERRIDE',
          },
        );
      }
      return clone(preferences);
    },
    getSubscriptionOptions: async () => clone(catalog),
  },
};
const wx = {
  getAppBaseInfo: () => ({ version }),
  getDeviceInfo: () => ({ platform }),
  getSetting: (options) =>
    settingsFail ? options.fail() : options.success({ subscriptionsSetting: clone(settings) }),
  openSetting: (options) => {
    settings.mainSwitch = true;
    options.success();
    options.complete();
  },
  requestSubscribeMessage: (options) => nativeCalls.push(options),
};
const mocks = new Map(
  Object.entries({
    'services/api.ts': { api },
    'utils/error.ts': { isHttpError: (error) => error?.statusCode != null },
    'stores/helper.ts': { getUserId: () => userId },
    'utils/event-bus.ts': { eventBus, EVENTS: { LOGIN_SUCCESS: 'login', LOGOUT: 'logout' } },
    'utils/wx-promise.ts': { wxGetAccountInfoSync: () => ({ miniProgram: {} }) },
    'utils/notify.ts': { notifyToast: (value) => toasts.push(value), showErrorToast() {} },
    'actions/auth.ts': {},
  }).map(([file, value]) => [path.resolve(root, file), value]),
);
const cache = new Map();
function load(file) {
  file = path.resolve(root, file);
  if (mocks.has(file)) return mocks.get(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(
    code,
    {
      exports,
      wx,
      Page: (definition) => {
        page = definition;
      },
      require: (name) => load(path.resolve(path.dirname(file), name + '.ts')),
    },
    { filename: file },
  );
  return exports;
}
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const tap = (key) => ({ currentTarget: { dataset: { key } } });
const service = load('subpkg_setting/services/notification-preferences.ts');
const subscription = load('subpkg_setting/services/notification-subscriptions.ts');
const action = load('subpkg_setting/actions/notification-preferences.ts');
assert.equal(service.buildPreferenceSnapshot(defaults(), capabilities()).rows.length, 27);
for (const broken of [
  () => ({ ...defaults(), items: defaults().items.slice(0, 6) }),
  () => ({ ...defaults(), items: [...defaults().items, defaults().items[0]] }),
])
  assert.throws(() => service.buildPreferenceSnapshot(broken(), capabilities()));
assert.throws(() =>
  service.buildPreferenceSnapshot(defaults(), { ...capabilities(), items: fixture.slice(0, 36) }),
);
const expanded = defaults();
expanded.items.push({ category: 'FUTURE', channel: 'FUTURE', enabled: true, source: 'FUTURE' });
assert.equal(service.buildPreferenceSnapshot(expanded, capabilities()).rows.length, 27);
const batchesCatalog = {
  ...catalog,
  items: [
    option('a', '同名'),
    option('b', '同名'),
    option('c', '长期', 'LONG_TERM'),
    option('d', '其他'),
    option('a', '同名'),
  ],
};
const batches = subscription.buildSubscriptionBatches(batchesCatalog, 'COMMENT', 3);
assert.equal(batches.flatMap((batch) => batch.items).length, 4);
assert.ok(
  batches.every(
    (batch) => new Set(batch.items.map((item) => item.title)).size === batch.items.length,
  ),
);
assert.ok(
  batches.every((batch) => new Set(batch.items.map((item) => item.subscriptionKind)).size === 1),
);
assert.ok(
  subscription
    .buildSubscriptionBatches(batchesCatalog, 'COMMENT', 1)
    .every((batch) => batch.items.length === 1),
);
assert.equal(subscription.getLocalTemplateLimit(), 3);
version = '7.0.5';
assert.equal(subscription.getLocalTemplateLimit(), 1);
platform = 'android';
version = '7.0.6';
assert.equal(subscription.getLocalTemplateLimit(), 1);
version = '7.0.7';
assert.equal(subscription.getLocalTemplateLimit(), 3);
platform = 'unknown';
assert.equal(subscription.getLocalTemplateLimit(), 1);
platform = 'ios';
version = '8.0.0';
for (const status of ['reject', 'ban', 'filter', 'future', undefined])
  assert.notEqual(subscription.subscriptionResultText(status), '本次订阅成功');
for (const status of ['accept', 'acceptWithAlert', 'acceptWithAudio', 'acceptWithForcePush'])
  assert.equal(subscription.subscriptionResultText(status), '本次订阅成功');

load('subpkg_setting/pages/setting/setting.ts');
page.setData = (patch) => Object.assign(page.data, patch);
page.onLoad();
page.onShow();
await flush();
assert.equal(page.data.groups.length, 9);
assert.ok(page.data.groups.every((group) => group.rows.length === 2));
assert.equal(nativeCalls.length, 0, 'loading never requests consent');
await page.onNotificationPreferenceChange({
  ...tap('COMMENT__WECHAT_MINI_PROGRAM'),
  detail: { value: true },
});
assert.equal(writes.length, 1);
assert.equal(
  preferences.items.find(
    (item) => item.category === 'REPLY' && item.channel === 'WECHAT_MINI_PROGRAM',
  ).enabled,
  false,
);
assert.equal(nativeCalls.length, 0, 'saving intention never requests consent');
assert.equal(page.onSubscribeReminder, undefined, 'settings no longer lists per-template consent actions');
assert.equal(nativeCalls.length, 0, 'saving preference never requests consent after awaiting a network write');
settingsFail = true;
page._readWechatSettings();
assert.equal(page.data.wechatMainSwitch, 'unknown');
settingsFail = false;
page.onOpenSubscriptionSettings();
await flush();
assert.equal(page.data.wechatMainSwitch, 'on');

// Failures retain the last confirmed preference, without synthesizing defaults.
const updatePreferences = api.notify.batchUpdatePreferences;
api.notify.batchUpdatePreferences = async () => {
  throw { statusCode: 503 };
};
await page.onNotificationPreferenceChange({
  ...tap('COMMENT__WECHAT_MINI_PROGRAM'),
  detail: { value: false },
});
assert.equal(page.data.groups.find((group) => group.category === 'COMMENT').rows.find(row => row.channel === 'WECHAT_MINI_PROGRAM').enabled, true);
assert.equal(toasts.at(-1).title, '保存失败，请重试');
api.notify.batchUpdatePreferences = updatePreferences;
const readPreferences = api.notify.getPreferences;
api.notify.getPreferences = async () => {
  throw { statusCode: 503 };
};
await page._loadNotificationArea();
assert.equal(page.data.preferenceState, 'error');
assert.equal(page.data.groups.find((group) => group.category === 'COMMENT').rows.find(row => row.channel === 'WECHAT_MINI_PROGRAM').enabled, true);
api.notify.getPreferences = readPreferences;
await page._loadNotificationArea();

const readCatalog = api.notify.getSubscriptionOptions;
api.notify.getSubscriptionOptions = async () => ({ ...catalog, maxTemplatesPerRequest: undefined });
await assert.rejects(subscription.getSubscriptionOptions());
api.notify.getSubscriptionOptions = async () => ({
  ...catalog,
  items: [catalog.items[0], catalog.items[0]],
});
await assert.rejects(subscription.getSubscriptionOptions());
api.notify.getSubscriptionOptions = readCatalog;
userId = null;
eventBus.emit('logout');
assert.equal(page.data.groups.length, 0);
userId = 'user-a';
eventBus.emit('login');
await flush();
page.onUnload();

// Business intents preload all network/state, then call native consent synchronously in the tap.
const business = load('services/business-subscriptions.ts');
let reads = 0;
api.notify.getPreferences = async () => clone(preferences);
api.notify.getSubscriptionOptions = async (query) => { reads++; return { ...clone(catalog), ...query }; };
const configure = (category = 'COMMENT', enabled = true) => {
  eventBus.emit('login');
  settings = { mainSwitch: true, itemSettings: {} };
  preferences = defaults();
  preferences.items.find(p => p.category === category && p.channel === 'WECHAT_MINI_PROGRAM').enabled = enabled;
  catalog = { evaluatedAt: '2026-11-21T10:00:00+08:00', configurationRevision: 'business-r1', maxTemplatesPerRequest: 3,
    items: [option('shared', '审核结果', 'ONE_TIME', [category])] };
};
const intent = () => business.createBusinessSubscription(() => true);
configure();
let businessIntent = intent();
await businessIntent.prepare('POST_PUBLISH');
let readBeforeTap = reads;
let countBefore = nativeCalls.length;
let operation = businessIntent.request('POST_PUBLISH');
assert.equal(nativeCalls.length, countBefore + 1, 'native request is synchronous before any awaited network');
assert.equal(reads, readBeforeTap);
assert.equal(businessIntent.pending, true);
nativeCalls.at(-1).success({ shared: 'reject' }); nativeCalls.at(-1).complete();
assert.equal(await operation, true, 'rejection permits business submission');
assert.equal(preferences.items.find(p => p.category === 'COMMENT' && p.channel === 'WECHAT_MINI_PROGRAM').enabled, true);
countBefore = nativeCalls.length;
assert.equal(await businessIntent.request('POST_PUBLISH'), true);
assert.equal(nativeCalls.length, countBefore, 'recent rejection suppresses repeat prompts');
for (const outcome of ['accept', 'ban', 'filter', 'future', undefined, 'failure']) {
  configure(); businessIntent = intent(); await businessIntent.prepare('POST_PUBLISH');
  operation = businessIntent.request('POST_PUBLISH');
  if (outcome === 'failure') nativeCalls.at(-1).fail({ errCode: 999 });
  else nativeCalls.at(-1).success({ shared: outcome });
  nativeCalls.at(-1).complete();
  assert.equal(await operation, true, `${outcome} never blocks the business`);
}
configure('POINTS', false); businessIntent = intent(); await businessIntent.prepare('POINTS_APPLY');
countBefore = nativeCalls.length;
assert.equal(await businessIntent.request('POINTS_APPLY'), true);
assert.equal(nativeCalls.length, countBefore, 'closed category skips consent and keeps business usable');
configure('LEARNING_TASK'); businessIntent = intent(); await businessIntent.prepare('LEARNING_SUBMIT');
operation = businessIntent.request('LEARNING_SUBMIT');
nativeCalls.at(-1).success({ shared: 'accept' }); nativeCalls.at(-1).complete();
assert.equal(await operation, true);
assert.equal(preferences.items.find(p => p.category === 'POINTS' && p.channel === 'WECHAT_MINI_PROGRAM').enabled, false,
  'shared template consent never enables another business category');
configure(); businessIntent = intent(); await businessIntent.prepare('POST_PUBLISH');
operation = businessIntent.request('POST_PUBLISH');
eventBus.emit('logout'); eventBus.emit('login');
nativeCalls.at(-1).success({ shared: 'reject' }); nativeCalls.at(-1).complete();
assert.equal(await operation, false, 'old session cannot continue a business write or record rejection');
configure(); businessIntent = intent(); await businessIntent.prepare('POST_PUBLISH');
operation = businessIntent.request('POST_PUBLISH'); businessIntent.dispose(); nativeCalls.at(-1).complete();
assert.equal(await operation, false, 'unloaded page cannot continue submission');
configure(); businessIntent = intent(); await businessIntent.prepare('POST_PUBLISH');
business.invalidateBusinessSubscriptions(); countBefore = nativeCalls.length;
assert.equal(await businessIntent.request('POST_PUBLISH'), true);
assert.equal(nativeCalls.length, countBefore, 'saving preferences invalidates old consent snapshots');
configure(); settings.itemSettings = { shared: 'reject' };
businessIntent = intent(); await businessIntent.prepare('POST_PUBLISH'); countBefore = nativeCalls.length;
await businessIntent.request('POST_PUBLISH'); assert.equal(nativeCalls.length, countBefore);
configure(); settings.mainSwitch = false;
businessIntent = intent(); await businessIntent.prepare('POST_PUBLISH'); countBefore = nativeCalls.length;
await businessIntent.request('POST_PUBLISH'); assert.equal(nativeCalls.length, countBefore);
configure(); businessIntent = intent(); countBefore = nativeCalls.length;
assert.equal(await businessIntent.request('POST_PUBLISH'), true, 'missing preload never blocks business');
assert.equal(nativeCalls.length, countBefore);
configure(); catalog.items = Array.from({ length: 5 }, (_, i) => option(`id-${i}`, `title-${i}`, 'ONE_TIME', ['COMMENT']));
businessIntent = intent(); await businessIntent.prepare('POST_PUBLISH'); countBefore = nativeCalls.length;
operation = businessIntent.request('POST_PUBLISH');
assert.equal(nativeCalls.at(-1).tmplIds.length, 3); nativeCalls.at(-1).complete(); await operation;
assert.equal(nativeCalls.length, countBefore + 1, 'large scenes never chain native prompts');
configure(); catalog.items = [option('a', '同名', 'ONE_TIME', ['COMMENT']), option('b', '同名', 'ONE_TIME', ['COMMENT']), option('c', '长期', 'LONG_TERM', ['COMMENT'])];
businessIntent = intent(); await businessIntent.prepare('POST_PUBLISH'); operation = businessIntent.request('POST_PUBLISH');
assert.deepEqual(Array.from(nativeCalls.at(-1).tmplIds), ['a']); nativeCalls.at(-1).complete(); await operation;
configure(); businessIntent = intent(); await businessIntent.prepare('ACTIVITY_REGISTER', '42'); countBefore = nativeCalls.length;
await businessIntent.request('ACTIVITY_REGISTER', '43'); assert.equal(nativeCalls.length, countBefore, 'resource snapshots cannot cross targets');
const originalNative = wx.requestSubscribeMessage;
wx.requestSubscribeMessage = () => { throw new Error('native unavailable'); };
assert.equal(await businessIntent.request('ACTIVITY_REGISTER', '42'), true);
wx.requestSubscribeMessage = originalNative;

// The actual domain API uses the authenticated shared boundary and no client identifiers.
const requests = [];
const apiExports = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(path.resolve(root, 'services/api.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports: apiExports, require: () => ({ http: { get: (...args) => requests.push(args) } }) },
);
apiExports.api.notify.getSubscriptionOptions();
assert.equal(requests[0][0], '/v1/users/me/notification-subscription-options');
assert.equal(requests[0][1], undefined);
assert.equal(requests[0][2].sensitive, true);
const wxml = fs.readFileSync(
  path.resolve(root, 'subpkg_setting/pages/setting/setting.wxml'),
  'utf8',
);
assert.doesNotMatch(wxml, /onTestSubscription|legacyNotify|bindMp|服务号|模板ID|剩余次数/);
assert.doesNotMatch(
  fs.readFileSync(path.resolve(root, 'subpkg_setting/pages/setting/setting.ts'), 'utf8'),
  /BG9O2XEY|TEST_SUBSCRIBE_TEMPLATE/,
);
console.log(
  'PASS formal notification settings: complete 27/99, independent preferences, authenticated catalog, safe batches, result labels, settings recovery and stale session guards. Mock wx only; no provider delivery.',
);
