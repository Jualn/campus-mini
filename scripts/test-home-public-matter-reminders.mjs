import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compile = (file) =>
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;

const raw = {
  evaluatedAt: '2099-09-13T10:00:00+08:00',
  source: 'SUBSCRIPTIONS',
  items: [
    {
      publicMatterId: '9223372036854775800',
      name: '大学英语四级考试',
      nodeName: '报名截止',
      reminderAt: '2099-09-14T12:03:00+08:00',
    },
  ],
};

const serviceExports = {};
vm.runInNewContext(compile('services/home-public-matter-reminder.ts'), {
  exports: serviceExports,
  require: () => ({
    api: { home: { getPublicMatterReminders: async () => raw } },
  }),
  Date,
  Set,
  Error,
  Number,
});

const snapshot = serviceExports.normalizeHomePublicMatterReminders(
  raw,
  Date.parse('2099-09-13T10:00:10+08:00'),
);
assert.equal(snapshot.items[0].publicMatterId, '9223372036854775800');
assert.equal(snapshot.items[0].reminderAtMs, Date.parse(raw.items[0].reminderAt));
assert.throws(() =>
  serviceExports.normalizeHomePublicMatterReminders({ ...raw, evaluatedAt: '2099-09-13T10:00:00' }),
);
assert.throws(() =>
  serviceExports.normalizeHomePublicMatterReminders({
    ...raw,
    items: [{ ...raw.items[0], reminderAt: raw.evaluatedAt }],
  }),
);
assert.throws(() =>
  serviceExports.normalizeHomePublicMatterReminders({
    ...raw,
    items: [raw.items[0], { ...raw.items[0] }],
  }),
);
assert.throws(() =>
  serviceExports.normalizeHomePublicMatterReminders({
    ...raw,
    items: Array.from({ length: 6 }, (_, index) => ({
      ...raw.items[0],
      publicMatterId: index.toString(),
    })),
  }),
);

const modelExports = {};
vm.runInNewContext(compile('pages/index/home-model.ts'), {
  exports: modelExports,
  require: () => ({}),
  Date,
  Set,
  Math,
});
assert.equal(
  modelExports.formatShanghaiDateTime(Date.parse('2026-12-31T16:05:00Z')),
  '2027年1月1日 00:05',
);
assert.deepEqual(
  { ...modelExports.getReminderCountdownDisplay(59_999) },
  {
    value: '即将到期',
    unit: '',
    soon: true,
    ariaLabel: '不足1分钟，即将到期',
  },
);
assert.deepEqual(
  { ...modelExports.getReminderCountdownDisplay((24 * 60 + 2 * 60 + 3) * 60_000) },
  {
    value: '1',
    unit: '天',
    soon: false,
    ariaLabel: '还剩1天',
  },
);
assert.deepEqual(
  { ...modelExports.getReminderCountdownDisplay(2 * 60 * 60_000) },
  {
    value: '2',
    unit: '小时',
    soon: false,
    ariaLabel: '还剩2小时',
  },
);
assert.equal(
  modelExports.estimateReminderNow(snapshot, snapshot.receivedAtMs + 20_000),
  snapshot.evaluatedAtMs + 20_000,
);
assert.equal(modelExports.toHomeReminderCards(snapshot.items, snapshot.evaluatedAtMs).length, 1);
const fiveCards = modelExports.toHomeReminderCards(
  Array.from({ length: 5 }, (_, index) => ({
    ...snapshot.items[0],
    publicMatterId: index.toString(),
  })),
  snapshot.evaluatedAtMs,
);
assert.equal(new Set(fiveCards.map((item) => item.theme)).size, 5);
assert.ok(fiveCards.every((item) => !('icon' in item)));
assert.equal(fiveCards[0].dateText, '2099.09.14');
assert.equal(fiveCards[0].timeText, '12:03');
assert.equal(
  modelExports.toHomeReminderCards(snapshot.items, snapshot.items[0].reminderAtMs).length,
  0,
);

const transport = [];
const apiExports = {};
vm.runInNewContext(compile('services/api.ts'), {
  exports: apiExports,
  require: () => ({
    http: {
      get: (...args) => {
        transport.push(args);
        return Promise.resolve(raw);
      },
    },
  }),
});
await apiExports.api.home.getPublicMatterReminders();
assert.equal(transport[0][0], '/v1/home/public-matter-reminders');
assert.equal(transport[0][2].auth, 'required');

let pageOptions;
let userId = '';
const requests = [];
const reminderService = {
  getHomePublicMatterReminders: () =>
    new Promise((resolve, reject) => requests.push({ resolve, reject })),
};
const appStore = {
  watch(_key, listener) {
    listener({ id: userId });
    return () => undefined;
  },
};
vm.runInNewContext(compile('pages/index/index.ts'), {
  exports: {},
  require: (name) => {
    if (name.endsWith('/definePage'))
      return { __esModule: true, default: (value) => (pageOptions = value) };
    if (name.endsWith('/home-public-matter-reminder')) return reminderService;
    if (name.endsWith('/home-model')) return modelExports;
    if (name.endsWith('/stores')) return { appStore };
    if (name.endsWith('/stores/helper'))
      return { getUserInfo: () => userId || null, isLoggedIn: () => Boolean(userId) };
    if (name.endsWith('/scrollStore')) return { scrollStore: {} };
    if (name.endsWith('/auth')) return { authReady: Promise.resolve() };
    if (name.endsWith('/usePostActions')) return { usePostActions: () => ({}) };
    if (name.endsWith('/useListLoad')) return { useListLoad: () => ({}) };
    if (name.endsWith('/logger')) return { createLogger: () => ({ error: () => undefined }) };
    if (name.endsWith('/constants')) return { TARGET_TYPES: { POST: { value: 1 } } };
    return {};
  },
  setInterval: () => 1,
  clearInterval: () => undefined,
  Date,
  Set,
  Promise,
});
const page = {
  ...pageOptions,
  data: { ...pageOptions.data },
  setData(patch) {
    Object.assign(this.data, patch);
  },
};
page._pageVisible = true;
userId = 'user-a';
page._handleReminderIdentity(userId);
const merged = page._loadHomeReminders();
assert.equal(requests.length, 1, '同身份并发读取应合并');
requests[0].resolve(snapshot);
await merged;
assert.equal(page.data.homeReminderList[0].publicMatterId, raw.items[0].publicMatterId);

const oldRequest = page._loadHomeReminders();
userId = 'user-b';
page._handleReminderIdentity(userId);
assert.equal(page.data.homeReminderList.length, 0, '切换身份应立即清除旧数据');
assert.equal(requests.length, 3);
requests[1].resolve(snapshot);
await oldRequest;
assert.equal(page.data.homeReminderList.length, 0, '旧身份响应不得写回');
const secondSnapshot = {
  ...snapshot,
  items: [{ ...snapshot.items[0], publicMatterId: 'user-b-matter', name: '新账号事项' }],
};
requests[2].resolve(secondSnapshot);
await page._reminderInFlight;
assert.equal(page.data.homeReminderList[0].publicMatterId, 'user-b-matter');

const retained = page._loadHomeReminders();
requests[3].reject(new Error('network'));
await retained;
assert.equal(page.data.homeReminderList[0].publicMatterId, 'user-b-matter');
assert.equal(page.data.homeReminderError, true);
const retryAfterError = page._loadHomeReminders();
assert.equal(page.data.homeReminderError, true, '重试期间应保留原错误区域，避免闪烁');
requests[4].resolve(secondSnapshot);
await retryAfterError;
assert.equal(page.data.homeReminderError, false);
userId = '';
page._handleReminderIdentity(userId);
await page._loadHomeReminders();
assert.equal(requests.length, 5, '未登录时不得请求提醒接口');
assert.equal(page.data.homeReminderList.length, 0);
userId = 'user-b';
page._handleReminderIdentity(userId);
assert.equal(requests.length, 6, '退出后同账号重登必须发起新读取');
requests[5].resolve(secondSnapshot);
await page._reminderInFlight;
assert.equal(page.data.homeReminderList[0].publicMatterId, 'user-b-matter');

const wxml = fs.readFileSync('pages/index/index.wxml', 'utf8');
assert.match(wxml, /wx:if="\{\{homeReminderError \|\| homeReminderList\.length\}\}"/);
assert.ok(!wxml.includes('正在加载事项提醒'));
assert.ok(wxml.includes('{{reminder.nodeName}}'));
assert.ok(wxml.includes('{{reminder.dateText}}'));
assert.ok(wxml.includes('{{reminder.timeText}}'));
assert.ok(wxml.includes('{{reminder.countdownValue}}'));
assert.ok(wxml.includes('{{reminder.countdownUnit}}'));
assert.ok(wxml.includes('reminder-theme--{{reminder.theme}}'));
assert.equal(typeof pageOptions.onRetryHomeReminders, 'function');

console.log(
  'PASS: reminder contract validation, Shanghai display, countdown, auth, request merge, identity freshness, retained error state and empty hiding',
);
