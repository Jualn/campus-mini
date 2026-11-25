// Native dependencies are mocked. These checks do not prove server authorization.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const requests = [];
const http = new Proxy({}, {
  get: (_, method) => (...args) => {
    requests.push({ method, args });
    return Promise.resolve({});
  },
});
const modules = new Map();
function load(file) {
  if (file === 'utils/request.ts') return { http, httpWithMeta: http };
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  modules.set(file, exports);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, {
    exports,
    require: (specifier) => load(path.posix.normalize(path.posix.join(path.posix.dirname(file), `${specifier}.ts`))),
  });
  return exports;
}
const { api } = load('services/api.ts');
const { ACTIVITY_PUBLISH_UNAVAILABLE } = load('utils/activity-publishing.ts');
const { appStore } = load('stores/index.ts');
const helpers = load('stores/helper.ts');
for (const name of ['ROLES', 'hasRole', 'isAdmin', 'isOperator', 'isUser'])
  assert.equal(name in helpers, false, `${name} must not remain an authorization API`);

const config = JSON.parse(fs.readFileSync('app.json', 'utf8'));
assert.equal(config.subPackages.find((item) => item.root === 'subpkg_activity').pages.includes('pages/publish/publish'), false);
for (const [token, role] of [['', 0], ['ordinary', 1], ['extra-grant', 1], ['revoked', 3]]) {
  appStore.setState({ token, userInfo: { id: token ? 'subject' : '', nickname: '', avatarUrl: '', role } });
  const count = requests.length;
  for (const action of [
    () => api.activity.create({ title: 'attempt' }),
    () => api.activity.upload('local-file'),
    () => api.activity.activtyPublishStream('task', undefined),
  ]) assert.throws(action, { message: ACTIVITY_PUBLISH_UNAVAILABLE });
  assert.equal(requests.length, count, 'bypassing UI cannot revive retired ordinary-token writes');
}

// Ordinary community and public-profile transport does not acquire an RBAC gate.
await api.post.create({ content: 'community' });
await api.user.getPublicProfile('public-user');
await api.auth.login({ code: 'test-code' });
assert.equal(requests.length, 3);
assert.equal(requests[2].args[2].auth, 'none');

let campus;
const notices = [];
const source = ts.transpileModule(fs.readFileSync('pages/campus/campus.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(source, {
  exports: {},
  require: (specifier) => {
    if (specifier.endsWith('/activity-publishing')) return load('utils/activity-publishing.ts');
    if (specifier.endsWith('/definePage')) return { __esModule: true, default: (value) => { campus = value; } };
    if (specifier.endsWith('/notify')) return { notifyToast: (value) => notices.push(value) };
    return new Proxy({}, { get: (_, name) => name === '__esModule' ? true : () => ({}) });
  },
});
assert.equal(campus.data.canPublishActivity, false);
const page = { data: { ...campus.data }, setData(value) { Object.assign(this.data, value); }, onPublishPost() { this.postOpened = true; } };
campus.onTapFab.call(page);
assert.equal(page.postOpened, true, 'ordinary post publishing remains available');
campus.onPublishActivity.call(page);
assert.equal(notices.at(-1).title, ACTIVITY_PUBLISH_UNAVAILABLE);
assert.doesNotMatch(fs.readFileSync('pages/campus/campus.ts', 'utf8'), /getUserInfo\('role'\)/);
console.log('PASS RBAC consumer migration: retired role helpers, activity route/API/AI entry denial, ordinary post/profile/login preservation');
