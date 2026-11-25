// Local consumer regression only; no live server authorization or device evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const calls = [];
const http = Object.fromEntries(['get', 'post', 'put', 'del', 'upload', 'stream'].map((method) => [
  method, (...args) => { calls.push([method, ...args]); return Promise.resolve({}); },
]));
const modules = new Map();
let page;
const mocks = new Map([
  ['utils/request.ts', { http, httpWithMeta: http }],
  ['utils/logger.ts', { createLogger: () => ({}) }],
  ['utils/notify.ts', { notifyToast: (notice) => calls.push(['toast', notice]) }],
]);
function load(file) {
  if (mocks.has(file)) return mocks.get(file);
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  modules.set(file, exports);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, {
    exports,
    require: (specifier) => load(path.posix.normalize(path.posix.join(path.posix.dirname(file), `${specifier}.ts`))),
    Page: (definition) => { page = definition; },
    wx: {},
  }, { filename: file });
  return exports;
}
const { api } = load('services/api.ts');
const { appStore } = load('stores/index.ts');
const helpers = load('stores/helper.ts');
for (const name of ['ROLES', 'hasRole', 'isAdmin', 'isOperator', 'isUser']) assert.equal(helpers[name], undefined);

// An old label, stale persistence or an unrecognized label never opens retired writes.
for (const [token, role] of [['', 0], ['ordinary', 1], ['old-opr', 2], ['old-admin', 3], ['unknown', 99]]) {
  appStore.setState({ token, userInfo: { id: token ? 'user-a' : '', nickname: '', avatarUrl: '', role } });
  for (const operation of [
    () => api.activity.create({}),
    () => api.activity.upload('/private-local-file'),
    () => api.activity.activtyPublishStream('task', undefined),
  ]) assert.throws(operation, /小程序活动发布暂不可用/);
}
assert.equal(calls.length, 0, 'bypassing the view cannot send retired writes');

// Ordinary reads and community writes continue to use their existing network boundary.
await api.activity.fetchActivityDetail('activity-a');
assert.equal(calls.at(-1)[1], '/v1/activity/activity-a');
const before = calls.length;
await api.post.create({ content: 'ordinary campus post' });
assert.equal(calls.length, before + 1);
assert.equal(calls.at(-1)[1], '/v1/post');

// Load the real publish Page; submitting even a forged render state stops before media upload.
for (const file of ['subpkg_activity/actions/activity.ts', 'actions/media.ts']) mocks.set(file, {});
load('subpkg_activity/pages/publish/publish.ts');
assert.equal(page.data.publishUnavailableMessage, '小程序活动发布暂不可用');
page.data.publishUnavailableMessage = '';
page.data.qrcodeImage = { status: 'local', path: '/private-local-file' };
await page.submitActivity.call(page);
assert.equal(calls.at(-1)[0], 'toast');
assert.equal(calls.at(-1)[1].title, '小程序活动发布暂不可用');
const campus = fs.readFileSync('pages/campus/campus.ts', 'utf8');
assert.doesNotMatch(campus, /getUserInfo\(['"]role['"]\)/);
assert.match(campus, /canPublishActivity: false/);
assert.doesNotMatch(campus, /_navigateTo\(['"]\/subpkg_activity\/pages\/publish/);
const wxml = fs.readFileSync('subpkg_activity/pages/publish/publish.wxml', 'utf8');
assert.match(wxml, /wx:if="{{publishUnavailableMessage}}"/);
assert.match(wxml, /wx:else id="page-root"/);

// Contract precondition: the sole RBAC current-capabilities operation is admin-only.
const contract = JSON.parse(fs.readFileSync('../contracts/api/paths/rbac.yaml', 'utf8'));
assert.equal(contract['/v1/admin/authorization/me/capabilities'].get.security[0].adminBearerAuth.length, 0);
assert.equal(Object.keys(contract).filter((key) => key.includes('/me/capabilities')).length, 1);
console.log('PASS RBAC current-scope acceptance: retired roles/writes, direct-submit guard, ordinary flows, admin-only Contract');
