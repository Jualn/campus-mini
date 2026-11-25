import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';

function loader(overrides = {}, globals = {}) {
  const cache = new Map();
  const load = (file) => {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    }).outputText;
    vm.runInNewContext(code, {
      exports,
      console,
      ...globals,
      require(name) {
        return name in overrides
          ? overrides[name]
          : load(path.resolve(path.dirname(file), `${name}.ts`));
      },
    });
    return exports;
  };
  return load;
}

// Accepted final handoff supersedes the original Activity V1 snapshot.
const target = JSON.parse(
  fs.readFileSync('../contracts/docs/coordination/unified-v1/handoff.json', 'utf8'),
);
assert.equal(target.revision, 'unified-v1-r6');
for (const file of target.files) {
  assert.equal(
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join('../contracts', file.path)))
      .digest('hex'),
    file.sha256,
    file.path,
  );
}
const load = loader();
const mapper = load('subpkg_activity/services/activity-card-mapper.ts');
const raw = {
  activityId: 'a',
  title: 'A',
  category: 'LECTURE',
  audienceScope: { type: 'CAMPUS' },
  lifecycleStatus: 'ACTIVE',
  availability: { state: 'OPEN' },
};
for (const [state, expected] of [
  ['NOT_STARTED', '未开始'],
  ['ONGOING', '进行中'],
  ['ENDED', '已结束'],
  ['CANCELLED', '已取消举办'],
  ['UNKNOWN', '阶段待确认'],
]) {
  assert.equal(mapper.toCard({ ...raw, stage: { state } }).statusLabel, expected);
}
assert.equal(
  mapper.toCard({ ...raw, lifecycleStatus: 'ENDED', availability: { state: 'CLOSED' } })
    .statusLabel,
  '阶段待确认',
);

const calls = [];
const api = loader({
  '../../utils/request': { http: { get: async (...args) => calls.push(args) }, httpWithMeta: {} },
})('subpkg_activity/services/event-api.ts').eventApi;
await api.registrations.listMine({ cursor: 'opaque', pageSize: 20 });
assert.equal(calls[0][0], '/v1/users/me/activity-registrations');
assert.equal(calls[0][1].cursor, 'opaque');
assert.equal(calls[0][2].auth, 'required');
assert.equal(calls[0][2].sensitive, true);

let definition,
  watcher,
  owner = 'u1';
const pending = [],
  routes = [];
const create = () =>
  loader(
    {
      '../../../utils/definePage': {
        default: (options) => {
          definition = options;
        },
        __esModule: true,
      },
      '../../../actions/current-user': {
        getCurrentIdentity: () => ({ id: owner }),
        watchCurrentIdentity: (fn) => {
          watcher = fn;
          return () => {
            watcher = null;
          };
        },
      },
      '../../../actions/auth': { ensureLogin: async () => {} },
      '../../../utils/error': { isHttpError: (error) => !!error.statusCode },
      '../../../utils/notify': { getErrorMessage: (error) => error.message ?? '请求失败' },
      '../../services/event-api': {
        eventApi: {
          registrations: {
            listMine: (query) =>
              new Promise((resolve, reject) => pending.push({ query, resolve, reject })),
          },
        },
      },
    },
    { wx: { navigateTo: (options) => routes.push(options.url), stopPullDownRefresh() {} } },
  )('subpkg_activity/pages/my-registrations/list.ts');
create();
const page = {
  ...definition,
  data: structuredClone(definition.data),
  setData(patch) {
    Object.assign(this.data, patch);
  },
};
const item = (id, access = 'UNAVAILABLE') => ({
  activity: {
    activityId: `activity:${id}`,
    title: id,
    publicAccess: access,
    category: 'VOLUNTEERING',
    stage: { state: 'ENDED' },
  },
  registration: {
    registrationId: id,
    status: 'SUBMITTED',
    submittedAt: '2026-11-02',
    answers: [{ fieldKey: 'secret', value: 'private' }],
  },
  registrationEtag: '"etag"',
});
const tick = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
page.onLoad();
page.onShow();
await tick();
pending.shift().resolve({ items: [item('a')], nextCursor: 'c1' });
await tick();
assert.equal(page.data.items[0].statusLabel, '预约成功');
assert.equal(page.data.items[0].stageLabel, '已结束');
assert.equal(
  page.data.items[0].registration.answers,
  undefined,
  'list render state does not need private answers',
);
page.openActivity({ currentTarget: { dataset: { id: 'a' } } });
assert.equal(routes.length, 0);
page.openRegistration({ currentTarget: { dataset: { id: 'a' } } });
assert.match(routes.pop(), /activityId=activity%3Aa&history=1$/);
for (const [origin, expected] of [['ADMIN', '管理员已作废'], ['SELF', '本人已取消'], ['UNKNOWN', '已取消'], [undefined, '已取消']]) {
  page.refresh();
  await tick();
  const cancelled = item('a');
  cancelled.registration.status = 'CANCELLED';
  if (origin) cancelled.registration.cancellationOrigin = origin;
  cancelled.registration.cancellationReason = '报名条件不符';
  pending.shift().resolve({ items: [cancelled], nextCursor: 'c1' });
  await tick();
  assert.equal(page.data.items[0].statusLabel, expected);
  assert.equal(page.data.items[0].cancellationReason, '报名条件不符');
  assert.equal(page.data.items[0].registration.answers, undefined);
}
page.onReachBottom();
await tick();
assert.equal(pending[0].query.cursor, 'c1');
pending.shift().resolve({ items: [item('a'), item('b', 'AVAILABLE')], nextCursor: 'c2' });
await tick();
assert.deepEqual(
  Array.from(page.data.items, (item) => item.id),
  ['a', 'b'],
);
page.openActivity({ currentTarget: { dataset: { id: 'b' } } });
assert.match(routes.pop(), /activityId=activity%3Ab$/);
page.onReachBottom();
await tick();
pending.shift().reject(new Error('offline'));
await tick();
assert.equal(page._cursor, 'c2');
page.onReachBottom();
await tick();
assert.equal(pending.length, 0, 'load-more error waits for explicit retry');
page.more();
await tick();
pending.shift().reject({ statusCode: 400, problemType: '/problems/invalid-cursor' });
await tick();
assert.equal(page.data.invalidCursor, true);
page.more();
await tick();
assert.equal(pending[0].query.cursor, undefined);
pending.shift().reject(new Error('offline'));
await tick();
assert.equal(page.data.items.length, 2, 'failed refresh preserves current records');
page.refresh();
await tick();
const stale = pending.shift();
page.refresh();
await tick();
pending.shift().resolve({ items: [item('new')] });
await tick();
stale.resolve({ items: [item('stale')] });
await tick();
assert.equal(page.data.items[0].id, 'new');
page.refresh();
await tick();
const oldAccount = pending.shift();
owner = 'u2';
watcher();
await tick();
assert.equal(page.data.items.length, 0);
oldAccount.resolve({ items: [item('private-u1')] });
await tick();
assert.equal(page.data.items.length, 0);
const afterUnload = pending.shift();
page.onUnload();
afterUnload.resolve({ items: [item('late')] });
await tick();
assert.equal(page.data.items.length, 0);
assert.equal(watcher, null);

let detailDefinition;
loader({
  '../../../utils/definePage': {
    __esModule: true,
    default: (options) => {
      detailDefinition = options;
    },
  },
  '../../../utils/error': { isHttpError: (error) => !!error.statusCode },
  '../../../behaviors/useSharePoster': { useSharePoster: () => ({}) },
  '../../behaviors/useAsyncLoad': { useAsyncLoad: () => ({}) },
  '../../../utils/wx-promise': {},
  '../../../utils/logger': { createLogger: () => ({ error() {} }) },
  '../../../utils/notify': {},
  '../../utils/activityPoster': {},
  '../../utils/navigation': {},
  '../../actions/activity': {
    getActivityDetailState: async () => {
      throw { statusCode: 404 };
    },
  },
})('subpkg_activity/pages/detail/detail.ts');
const detailPage = {
  ...detailDefinition,
  data: structuredClone(detailDefinition.data),
  setData(patch) {
    Object.assign(this.data, patch);
  },
  _asyncLoadBegin() {},
  _asyncLoadFail(message) {
    this.failure = message;
  },
};
detailPage._loadActivity('historical-notification-target');
await tick();
assert.equal(detailPage.data.publicUnavailable, true);
assert.match(detailPage.failure, /已撤下或暂不可公开访问/);
assert.match(detailPage.failure, /不代表本人已报名/);
console.log(
  'PASS: Activity V1 pinned input, stage, private history API/navigation, pagination, errors and session races',
);
