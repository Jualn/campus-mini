// Real Page → v2 API → shared request; mocked WeChat/network, not device evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const scene = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';
const pagePath = 'subpkg_setting/pages/admin-login-confirm/index';
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
assert.ok(
  app.subPackages
    .find((item) => item.root === 'subpkg_setting')
    .pages.includes('pages/admin-login-confirm/index'),
);
for (const extension of ['ts', 'json', 'wxml', 'wxss'])
  assert.ok(fs.existsSync(`${pagePath}.${extension}`));

const modules = new Map();
const requests = [],
  logs = [],
  plans = [],
  timers = new Map();
let now = Date.parse('2026-10-07T10:00:00Z');
let token = 'mini-session';
let status = 'SCANNED';
let authBarrier = Promise.resolve();
let recovered = 0,
  transportRecovered = 0,
  timerId = 0;
let definition;
const navigation = [],
  notices = [];
let pageDepth = 2;
class ClockDate extends Date {
  static now() {
    return now;
  }
}
const result = (state = status) => ({
  target: 'ADMIN_WEB',
  session: {
    sessionId: 'opaque-session',
    status: state,
    expiresAt: '2026-10-07T10:02:00Z',
    pollIntervalMs: 1500,
    ...(['CONFIRMED', 'CONSUMED'].includes(state) ? { confirmedAt: '2026-10-07T10:00:30Z' } : {}),
    ...(state === 'CONSUMED' ? { consumedAt: '2026-10-07T10:00:32Z' } : {}),
  },
});
const ok = (data) => ({ statusCode: 200, data, header: {} });
const problem = (statusCode, type, header = {}) => ({ statusCode, data: { type }, header });
const mocks = new Map([
  [
    'config/index.ts',
    { __esModule: true, default: { baseURL: 'https://example.invalid', timeout: 10000 } },
  ],
  ['utils/logger.ts', { createLogger: () => ({ info: (...args) => logs.push(args) }) }],
  [
    'utils/wx-promise.ts',
    {
      wxShowLoading: async () => {},
      wxHideLoading: async () => {},
      wxNavigateBack: async () => {
        navigation.push('back');
      },
      wxReLaunch: async (options) => {
        navigation.push(options.url);
      },
    },
  ],
  [
    'utils/notify.ts',
    {
      showSuccessToast: (text) => notices.push(text),
      showErrorToast: (text) => notices.push(text),
    },
  ],
  ['utils/transfer.ts', {}],
  ['utils/stream.ts', {}],
  [
    'utils/auth-transport.ts',
    {
      getAuthToken: async () => token,
      recoverAuthToken: async () => {
        transportRecovered++;
        return token;
      },
    },
  ],
  ['actions/auth.ts', { ensureLogin: async () => authBarrier, getToken: () => token }],
  [
    'utils/auth-session.ts',
    {
      waitForAuthStable: async () => authBarrier,
      refreshAuth: async () => {
        recovered++;
        token = 'refreshed-mini-session';
        return true;
      },
    },
  ],
]);
function load(relative) {
  relative = relative.replaceAll('\\', '/');
  if (mocks.has(relative)) return mocks.get(relative);
  if (modules.has(relative)) return modules.get(relative);
  const exports = {};
  modules.set(relative, exports);
  const source = ts.transpileModule(fs.readFileSync(relative, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(
    source,
    {
      exports,
      require: (specifier) =>
        load(
          path.posix.normalize(path.posix.join(path.posix.dirname(relative), `${specifier}.ts`)),
        ),
      Date: ClockDate,
      setInterval: (callback) => {
        const id = ++timerId;
        timers.set(id, callback);
        return id;
      },
      clearInterval: (id) => timers.delete(id),
      Page: (options) => {
        definition = options;
      },
      getCurrentPages: () => Array.from({ length: pageDepth }, () => ({})),
      wx: {
        request: (options) => {
          requests.push(options);
          const plan = plans.shift();
          const response = plan
            ? plan(options)
            : ok(
                result(
                  options.url.endsWith(':confirm')
                    ? 'CONFIRMED'
                    : options.url.endsWith(':reject')
                      ? 'REJECTED'
                      : status,
                ),
              );
          Promise.resolve(response).then(options.success, options.fail);
        },
      },
    },
    { filename: relative },
  );
  return exports;
}
const { appStore } = load('stores/index.ts');
appStore.set('userInfo', { id: 'subject-a', nickname: 'A', avatarUrl: '', role: 1 });
const api = load('subpkg_setting/services/admin-qr-login.ts');
const pageModule = load(`${pagePath}.ts`);
const localDate = new Date(2026, 9, 7, 20, 15).getTime();
assert.equal(
  pageModule.formatLoginExpiry(localDate, new Date(2026, 9, 7, 20, 10).getTime()),
  '今天 20:15',
);
assert.equal(
  pageModule.formatLoginExpiry(new Date(2026, 9, 8, 0, 1).getTime(), localDate),
  '10月8日 00:01',
);
assert.equal(
  pageModule.formatLoginExpiry(new Date(2027, 0, 1, 0, 1).getTime(), localDate),
  '2027年1月1日 00:01',
);
assert.equal(pageModule.formatLoginRemaining(90), '1 分 30 秒');
assert.equal(pageModule.formatLoginRemaining(9), '9 秒');
const pageConfig = JSON.parse(fs.readFileSync(`${pagePath}.json`, 'utf8'));
assert.equal(pageConfig.navigationBarBackgroundColor, '#ffffff');
assert.equal(pageConfig.navigationBarTextStyle, 'black');
const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
async function open(raw = scene) {
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  page.onLoad({ scene: raw });
  page.onShow();
  await flush();
  return page;
}

assert.equal(api.parseAdminLoginScene(scene), scene);
assert.equal(
  api.parseAdminLoginScene(
    [...scene].map((char) => `%${char.charCodeAt(0).toString(16)}`).join(''),
  ),
  scene,
);
for (const raw of [
  undefined,
  '',
  '%',
  'x'.repeat(31),
  'x'.repeat(33),
  'jualn-admin-login:legacy',
  `sceneCode=${scene}`,
  `https://example.invalid/${scene}`,
  '%2541' + scene.slice(1),
]) {
  assert.equal(api.parseAdminLoginScene(raw), null);
  const count = requests.length;
  const page = await open(raw ?? '');
  assert.equal(requests.length, count);
  assert.equal(page.data.canAct, false);
  page.onUnload();
}

const gate = deferred();
authBarrier = gate.promise;
const countBeforeAuth = requests.length;
const awaitingAuth = await open();
assert.equal(requests.length, countBeforeAuth, 'scan waits for ordinary authentication');
gate.resolve();
await flush();
authBarrier = Promise.resolve();
assert.equal(awaitingAuth.data.canAct, true, 'ordinary role is not a client authorization gate');
assert.equal(requests.at(-1).url, 'https://example.invalid/v1/admin/auth/qr-login-scans');
assert.deepEqual(JSON.parse(JSON.stringify(requests.at(-1).data)), { sceneCode: scene });
assert.equal(requests.at(-1).header.Authorization, 'Bearer mini-session');
assert.equal(
  requests.some((request) => request.url.endsWith(':confirm')),
  false,
  'opening never confirms',
);
awaitingAuth.onConfirm();
awaitingAuth.onConfirm();
awaitingAuth.onReject();
await flush();
assert.equal(
  requests.filter((request) => request.url.endsWith(':confirm')).length,
  1,
  'double click sends once',
);
assert.equal(awaitingAuth.data.status, 'CONFIRMED');
assert.equal(navigation.at(-1), 'back', 'successful confirmation returns to previous page');
assert.equal(timers.size, 0, 'exit stops page-owned timers');
assert.equal(awaitingAuth.data.canAct, false);
awaitingAuth.onReject();
await flush();
assert.equal(
  requests.some((request) => request.url.endsWith(':reject')),
  false,
  'cannot reject confirmed login',
);
awaitingAuth.onUnload();

const rejectPage = await open();
pageDepth = 1;
rejectPage.onReject();
await flush();
assert.equal(rejectPage.data.status, 'REJECTED');
assert.equal(rejectPage.data.canAct, false);
assert.equal(navigation.at(-1), '/pages/index/index', 'external scan without history returns home');
assert.equal(notices.at(-1), '已取消本次登录');
rejectPage.onUnload();
pageDepth = 2;
for (const terminal of ['CONFIRMED', 'CONSUMED', 'EXPIRED', 'REJECTED', 'CANCELLED']) {
  status = terminal;
  const page = await open();
  assert.equal(page.data.status, terminal);
  assert.equal(page.data.canAct, false);
  page.onUnload();
}
status = 'SCANNED';
const expiring = await open();
now = Date.parse('2026-10-07T10:02:00Z');
expiring._tick();
assert.equal(expiring.data.canAct, false);
const expiredCount = requests.length;
expiring.onConfirm();
await flush();
assert.equal(requests.length, expiredCount);
expiring.onUnload();
now = Date.parse('2026-10-07T10:00:00Z');

for (const [code, type, text] of [
  [403, '/problems/admin-access-denied', '暂无后台访问权限'],
  [404, '/problems/qr-login-invalid-scene', '二维码不可用'],
  [409, '/problems/qr-login-subject-conflict', '二维码已被其他账号扫描'],
  [409, '/problems/qr-login-session-expired', '二维码已过期'],
  [409, '/problems/qr-login-session-cancelled', '登录请求已取消'],
  [409, '/problems/qr-login-session-rejected', '登录请求已拒绝'],
]) {
  plans.push(() => problem(code, type));
  const page = await open();
  assert.equal(page.data.title, text);
  assert.equal(page.data.canAct, false);
  assert.equal(page.data.canRetry, false);
  page.onUnload();
}

const recoveryPage = await open();
plans.push(() => problem(401, '/problems/unauthorized'));
const confirmCount = requests.filter((request) => request.url.endsWith(':confirm')).length;
recoveryPage.onConfirm();
await flush();
assert.equal(recovered, 1);
assert.equal(transportRecovered, 0, 'transport does not replay a subject-bound action');
assert.equal(
  requests.filter((request) => request.url.endsWith(':confirm')).length,
  confirmCount + 1,
);
assert.equal(requests.at(-1).url.endsWith('/qr-login-scans'), true, '401 recovers via scan only');
assert.equal(recoveryPage.data.canAct, true);
recoveryPage.onUnload();

plans.push(
  () => problem(401, '/problems/unauthorized'),
  () => problem(401, '/problems/unauthorized'),
);
const beforeRepeated401 = recovered;
const repeated401 = await open();
assert.equal(recovered, beforeRepeated401 + 1, 'repeated 401 recovery is bounded');
assert.equal(repeated401.data.canRetry, true);
assert.equal(repeated401.data.canAct, false);
repeated401.onUnload();

plans.push(() => ok({ ...result(), target: 'UNEXPECTED_TARGET' }));
const malformed = await open();
assert.equal(malformed.data.canAct, false, 'invalid provider responses never enable confirmation');
malformed.onUnload();

const race = await open();
const late = deferred();
plans.push(() => late.promise);
race.onConfirm();
await flush();
appStore.set('userInfo', { id: 'subject-b', nickname: 'B', avatarUrl: '', role: 1 });
await flush();
assert.equal(race.data.status, 'SCANNED');
late.resolve(ok(result('CONFIRMED')));
await flush();
assert.equal(race.data.status, 'SCANNED', 'old subject response cannot overwrite new scan');
race.onUnload();

const unknown = await open();
const navigationBeforeUnknown = navigation.length;
plans.push(() => Promise.reject({ errMsg: 'request:fail timeout' }));
unknown.onConfirm();
await flush();
assert.equal(unknown.data.canAct, false);
assert.equal(unknown.data.canRetry, true);
assert.equal(
  navigation.length,
  navigationBeforeUnknown,
  'unknown outcome does not exit before server confirmation',
);
status = 'CONFIRMED';
unknown.onRetry();
await flush();
assert.equal(unknown.data.status, 'CONFIRMED', 'scan reconciles a lost confirm response');
unknown.onUnload();
status = 'SCANNED';

for (const retryAfter of ['10', 'Wed, 07 Oct 2026 10:00:10 GMT']) {
  plans.push(() => problem(429, '/problems/rate-limited', { 'Retry-After': retryAfter }));
  const rateLimited = await open();
  const count = requests.length;
  rateLimited.onRetry();
  await flush();
  assert.equal(requests.length, count);
  now += 9999;
  rateLimited._tick();
  assert.equal(rateLimited.data.canRetry, false);
  now += 1;
  rateLimited._tick();
  assert.equal(rateLimited.data.canRetry, true);
  rateLimited.onRetry();
  await flush();
  assert.equal(rateLimited.data.canAct, true);
  rateLimited.onUnload();
  now = Date.parse('2026-10-07T10:00:00Z');
}

const departing = await open();
const pending = deferred();
plans.push(() => pending.promise);
departing.onConfirm();
await flush();
departing.onHide();
assert.equal(timers.size, 0);
departing.onUnload();
const renderBefore = JSON.stringify(departing.data);
pending.resolve(ok(result('CONFIRMED')));
await flush();
assert.equal(JSON.stringify(departing.data), renderBefore, 'unloaded pages discard late responses');
assert.equal(departing._scene, '');
assert.equal(
  logs.flat(Infinity).some((value) => typeof value === 'string' && value.includes(scene)),
  false,
  'scene is hidden from request logs',
);
assert.equal(
  requests.every((request) => !request.header['X-Admin-Login-Secret']),
  true,
);

// Existing callers retain default 401 recovery; the new opt-out is local to v2.
plans.push(
  () => problem(401, '/problems/unauthorized'),
  () => ok({ value: true }),
);
await load('utils/request.ts').http.get('/legacy-test');
assert.equal(transportRecovered, 1);

// Verify the real auth boundary also blocks implicit recovery before sending a mutation.
mocks.delete('utils/auth-transport.ts');
mocks.set('utils/storage.ts', { storage: { get: () => token }, STORAGE_KEYS: { TOKEN: 'token' } });
const realAuthTransport = load('utils/auth-transport.ts');
const authChange = deferred();
authBarrier = authChange.promise;
const snapshotRequest = realAuthTransport.getAuthToken('required', false);
token = 'another-mini-session';
authChange.resolve();
await assert.rejects(snapshotRequest, /Authentication changed/);
authBarrier = Promise.resolve();
token = '';
const recoveryCount = recovered;
await assert.rejects(realAuthTransport.getAuthToken('required', false), /Authentication changed/);
assert.equal(recovered, recoveryCount, 'no implicit pre-send recovery for subject-bound workflows');
console.log(
  'PASS admin QR v2: scene, auth, scan/confirm/reject, terminals, expiry, errors, Retry-After, unknown outcome, account/unload races, redaction and legacy auth recovery',
);
