// Deterministic Page/Behavior/transport simulation; not WeChat runtime evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const cache = new Map(), mocks = new Map(), timers = new Map(), requests = [], feedback = [];
let definition, timerId = 0, recovered = 0, selected = [], saved = 0;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const pending = [];
const listRequest = (...args) => { const d = deferred(); pending.push({ ...d, args }); return d.promise; };
const noop = () => {};
const wx = { canIUse: () => false, stopPullDownRefresh: noop, request: (o) => requests.push(o) };
const mock = (file, value) => mocks.set(path.resolve(root, file), value);
mock('utils/logger.ts', { createLogger: () => ({ info: noop, error: noop }) });
mock('config/index.ts', { default: { baseURL: 'https://example.invalid', timeout: 1000 } });
mock('utils/transfer.ts', {}); mock('utils/stream.ts', {});
mock('utils/auth-transport.ts', { getAuthToken: async () => 'token', recoverAuthToken: async () => { recovered++; } });
mock('utils/wx-promise.ts', { wxShowLoading: noop, wxHideLoading: noop });
mock('utils/definePage.ts', { default: (x) => { definition = x; } });
mock('utils/defineBehavior.ts', { default: () => (x) => x });
mock('utils/notify.ts', { getErrorMessage: (e, fallback) => e.userMessage ?? fallback, notifyToast: (o) => feedback.push(o) });
mock('subpkg_red/services/article.ts', { listArticles: listRequest, articleError: (e) => e.userMessage ?? '失败', isSceneCode: () => false });
mock('utils/time-util.ts', { formatTime: (x) => x, TimeStyle: { POST: '' } });
mock('actions/post.ts', { fetchPostList: listRequest });
mock('services/post-dictionary.ts', {});
mock('actions/current-user.ts', { getCurrentIdentity: () => ({ id: '' }), watchCurrentAccount: () => () => {} });
mock('utils/event-bus.ts', { EVENTS: {}, eventBus: { on() {}, off() {} } });
mock('subpkg_user/behaviors/useAsyncLoad.ts', { useAsyncLoad: () => ({}) });
mock('actions/media.ts', { selectImages: async () => selected });
mock('actions/user.ts', { saveEditProfileAndSync: async () => { saved++; } });
mock('services/user.ts', {});
function load(file) {
  file = path.resolve(root, file);
  if (mocks.has(file)) return mocks.get(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: false },
  }).outputText;
  vm.runInNewContext(code, { exports, wx, Page: (x) => { definition = x; },
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    require: (id) => load(path.resolve(path.dirname(file), `${id}.ts`)),
  }, { filename: file });
  return exports;
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function instance(def = definition) {
  return { ...def, ...def.methods, data: JSON.parse(JSON.stringify(def.data)),
    setData(patch) { for (const [key, value] of Object.entries(patch)) {
      const keys = key.split('.'), last = keys.pop();
      keys.reduce((o, k) => o[k], this.data)[last] = value;
    } },
  };
}

// Both list consumers preserve refresh snapshots and retry the failed operation.
for (const kind of ['article', 'post']) {
  load(kind === 'article' ? 'subpkg_red/pages/article-list/list.ts' : 'subpkg_community/pages/post-list/list.ts');
  const page = instance(), key = kind === 'article' ? 'items' : 'posts';
  page.data.enabled = true;
  const run = (append = false) => kind === 'article' ? page.load(append) : page.load(!append);
  const response = (ids, cursor) => kind === 'article'
    ? { items: ids.map((id) => ({ id })), nextCursor: cursor }
    : { list: ids.map((id) => ({ id })), cursor, hasMore: !!cursor };
  let operation = run(); pending.shift().resolve(response(['a'], 'next')); await operation;
  operation = run();
  assert.equal(page.data[key][0].id, 'a', `${kind}: refresh keeps content`);
  pending.shift().reject({ userMessage: '无权访问' }); await operation;
  assert.equal(page.data.error, '无权访问');
  page.retry();
  let request = pending.shift();
  assert.equal(kind === 'article' ? request.args[1] : request.args[0].cursor, undefined);
  request.resolve(response(['b'], 'next2')); await flush();
  assert.equal(page.data[key][0].id, 'b');
  operation = run(true);
  const duplicate = run(true); await duplicate;
  assert.equal(pending.length, 1, 'repeated bottom event sends one request');
  pending.shift().reject({ userMessage: '超时' }); await operation;
  page.retry(); request = pending.shift();
  assert.equal(kind === 'article' ? request.args[1] : request.args[0].cursor, 'next2');
  request.resolve(response(['b', 'c'])); await flush();
  assert.equal(page.data[key].length, 2);
  const older = run(), olderRequest = pending.shift();
  const newer = run(), newerRequest = pending.shift();
  newerRequest.resolve(response(['current'], 'current-next')); await newer;
  olderRequest.resolve(response(['old'], 'old-next')); await older;
  assert.equal(page.data[key][0].id, 'current', 'older refresh cannot replace newer query');
  assert.equal(kind === 'article' ? page._cursor : page.data.cursor, 'current-next');
  operation = run(); request = pending.shift(); page.onUnload();
  request.resolve(response(['stale'])); await operation;
  assert.equal(page.data[key][0].id, 'current', 'unload discards result');
}

// A delayed initial skeleton must not override the newer refresh state.
const behavior = load('behaviors/useListLoad.ts').useListLoad();
const list = instance(behavior); behavior.lifetimes.attached.call(list);
list._listLoadBeginInitial(); assert.equal(timers.size, 1);
list._listLoadBeginRefresh(); assert.equal(timers.size, 0);
assert.equal(list.data.listLoad.phase, 'refresh');
list._listLoadEndRefresh({ success: false, hasContent: true });
assert.equal(list.data.listLoad.initialError, false);
behavior.lifetimes.detached.call(list);

// Cancel selection and field validation preserve the form; no stale picker write.
load('subpkg_user/pages/edit-profile/edit-profile.ts');
const editor = instance();
editor.data.form.avatarUrl = 'old';
await editor.onChangeAvatar(); assert.equal(editor.data.form.avatarUrl, 'old');
assert.equal(feedback.length, 0); assert.equal(editor.data.selecting, false);
editor.data.hasChanged = true; editor.data.form.nickname = ' ';
await editor.onSave(); assert.match(editor.data.fieldErrors.nickname, /填写/);
assert.equal(saved, 0); assert.equal(feedback.length, 0);
const picker = deferred(); selected = picker.promise;
const selection = editor.onChangeAvatar(); editor.onUnload();
picker.resolve([{ filePath: 'new' }]); await selection;
assert.equal(editor.data.form.avatarUrl, 'old');

// Transport: reads may recover once; writes never implicitly replay.
const { http } = load('utils/request.ts');
const { NetworkError, AuthError, getHttpErrorMessage } = load('utils/error.ts');
assert.match(new NetworkError('', { errMsg: 'request:fail timeout' }).userMessage, /超时/);
for (const status of [400, 401, 403, 404, 409, 412, 429, 500, 503])
  assert.ok(getHttpErrorMessage(status));
let operation = http.get('/read'); await flush();
requests.shift().success({ statusCode: 401, data: {}, header: {} }); await flush();
assert.equal(recovered, 1);
requests.shift().success({ statusCode: 200, data: { ok: true }, header: {} }); await operation;
for (const method of ['post', 'put', 'del']) {
  operation = http[method]('/write', {}); await flush();
  requests.shift().success({ statusCode: 401, data: {}, header: {} });
  await assert.rejects(operation, AuthError); assert.equal(requests.length, 0);
}
assert.equal(recovered, 1);
operation = http.post('/write', {}); await flush();
requests.shift().fail({ errMsg: 'request:fail timeout' });
await assert.rejects(operation, (e) => /结果暂未确认/.test(e.userMessage));
assert.equal(requests.length, 0);
mocks.delete(path.resolve(root, 'utils/wx-promise.ts'));
const { chooseMessageFile } = load('utils/wx-promise.ts');
wx.chooseMessageFile = (o) => o.fail({ errMsg: 'chooseMessageFile:fail cancel' });
assert.equal((await chooseMessageFile()).length, 0);
wx.chooseMessageFile = (o) => o.fail({ errMsg: 'chooseMessageFile:fail permission denied' });
await assert.rejects(chooseMessageFile());
console.log('PASS frontend interactions: refresh preservation/retry cursor/duplicates/unload, skeleton race, picker cancellation/field errors, read auth recovery/write no replay/unknown outcome. VM and wx doubles only.');
