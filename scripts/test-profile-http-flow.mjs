// Run by ProfileConsumerHttpTest against an isolated loopback HTTP server.
// Real Page/Action/Store/Service/API/HTTP + real Spring MVC; platform/media/Service are test doubles.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = process.argv[2];
assert.match(endpoint ?? '', /^http:\/\/127\.0\.0\.1:\d+$/);
const requests = [];
let definition;
let navigations = 0;
let selectedKind = 'avatar';
const noop = () => {};
const wx = {
  request(options) {
    requests.push({
      method: options.method,
      data: options.data ? JSON.parse(JSON.stringify(options.data)) : undefined,
    });
    const task = http.request(
      options.url,
      { method: options.method, headers: options.header },
      (res) => {
        let bytes = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          bytes += chunk;
        });
        res.on('end', () =>
          options.success({
            statusCode: res.statusCode,
            data: JSON.parse(bytes),
            header: res.headers,
          }),
        );
      },
    );
    task.on('error', options.fail);
    if (options.data) task.write(JSON.stringify(options.data));
    task.end();
  },
};
const mocks = new Map([
  ['config/index.ts', { default: { baseURL: endpoint, timeout: 2000 } }],
  ['utils/auth-session.ts', { waitForAuthStable: async () => {} }],
  ['utils/auth-transport.ts', { getAuthToken: async () => 'synthetic-local-token' }],
  ['utils/storage.ts', { STORAGE_KEYS: { USER_INFO: 'user' }, storage: { set: noop } }],
  ['utils/logger.ts', { createLogger: () => ({ info: noop, warn: noop, error: noop }) }],
  [
    'utils/definePage.ts',
    {
      default: (value) => {
        definition = value;
      },
    },
  ],
  [
    'utils/wx-promise.ts',
    {
      wxShowToast: async () => {},
      wxShowLoading: async () => {},
      wxHideLoading: async () => {},
      wxNavigateBack: async () => {
        navigations++;
      },
    },
  ],
  ['utils/transfer.ts', {}],
  ['utils/stream.ts', {}],
  ['actions/post.ts', {}],
  ['subpkg_user/behaviors/useAsyncLoad.ts', { useAsyncLoad: () => ({}) }],
  [
    'actions/media.ts',
    {
      selectImages: async () => [{ filePath: `local-${selectedKind}-preview` }],
      uploadFilesToCos: async (_target, files) =>
        files.map((file) => {
          const kind = file.filePath.includes('background') ? 'background' : 'avatar';
          return { url: `https://example.com/candidate-${kind}`, objectKey: `owned/new-${kind}` };
        }),
    },
  ],
]);
const modules = new Map();
function load(relative) {
  const key = path.relative(root, path.resolve(root, relative)).replaceAll('\\', '/');
  if (mocks.has(key)) return mocks.get(key);
  if (modules.has(key)) return modules.get(key);
  const exports = {};
  modules.set(key, exports);
  const source = ts.transpileModule(fs.readFileSync(path.join(root, key), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: false,
    },
  }).outputText;
  vm.runInNewContext(
    source,
    { exports, wx, require: (name) => load(path.resolve(root, path.dirname(key), `${name}.ts`)) },
    { filename: key },
  );
  return exports;
}
const { appStore } = load('stores/index.ts');
appStore.set('userInfo', { id: '7', nickname: '登录摘要', avatarUrl: '', role: 1 });
const owner = load('actions/current-user.ts');
load('subpkg_user/pages/edit-profile/edit-profile.ts');
const old = await owner.getCurrentProfile();
assert.equal(old.bio, '原简介');
assert.equal(old.isPlatformOperator, false);
async function editor() {
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    _selectedAvatarFile: [],
    _selectedBackgroundFile: [],
    _asyncLoadBegin: noop,
    _asyncLoadSuccess: noop,
    _asyncLoadFail: (message) => {
      throw Error(message);
    },
    setData(patch) {
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.split('.');
        const field = parts.pop();
        parts.reduce((state, part) => state[part], this.data)[field] = value;
      }
    },
  };
  await page._loadProfile();
  return page;
}
const input = (page, field, value) =>
  page.onInput({ currentTarget: { dataset: { field } }, detail: { value } });
const writes = () => requests.filter((request) => request.method === 'POST');

let page = await editor();
input(page, 'bio', '新简介');
const pending = page.onSave();
assert.equal(owner.peekCurrentProfile().bio, '原简介', 'No optimistic authoritative update');
await pending;
assert.equal(owner.peekCurrentProfile().bio, '新简介');
assert.deepEqual(writes().at(-1).data, { bio: '新简介' });
assert.equal(owner.peekCurrentProfile().nickname, old.nickname);
assert.equal(appStore.get('userInfo').nickname, old.nickname);
assert.equal(navigations, 1);

page = await editor();
await page.onChangeAvatar();
assert.equal(page.data.form.avatarUrl, 'local-avatar-preview');
assert.equal(owner.peekCurrentProfile().avatarUrl, null);
await Promise.all([page.onSave(), page.onSave()]);
assert.deepEqual(writes().at(-1).data, { avatarObjectKey: 'owned/new-avatar' });
assert.equal(writes().length, 2, 'Double tap makes one mutation');
assert.equal(owner.peekCurrentProfile().avatarUrl, 'https://example.com/final-avatar');
assert.equal(appStore.get('userInfo').avatarUrl, 'https://example.com/final-avatar');

page = await editor();
selectedKind = 'background';
await page.onChangeBackground();
assert.equal(page.data.form.backgroundUrl, 'local-background-preview');
assert.equal(owner.peekCurrentProfile().backgroundUrl, null, 'Candidate background stays private');
await page.onSave();
assert.deepEqual(writes().at(-1).data, { backgroundObjectKey: 'owned/new-background' });
assert.equal(owner.peekCurrentProfile().backgroundUrl, 'https://example.com/final-background');
assert.equal(owner.peekCurrentProfile().avatarUrl, 'https://example.com/final-avatar');

page = await editor();
selectedKind = 'avatar';
await page.onChangeAvatar();
selectedKind = 'background';
await page.onChangeBackground();
input(page, 'nickname', '组合昵称');
await page.onSave();
assert.deepEqual(writes().at(-1).data, {
  nickname: '组合昵称',
  avatarObjectKey: 'owned/new-avatar',
  backgroundObjectKey: 'owned/new-background',
});

const effective = owner.peekCurrentProfile();
for (const [nickname, message] of [
  ['reject', /未通过/],
  ['offline', /暂不可用/],
]) {
  page = await editor();
  input(page, 'nickname', nickname);
  input(page, 'bio', '候选简介');
  await page.onChangeBackground();
  const count = writes().length;
  await page.onSave();
  assert.equal(writes().length, count + 1, 'No automatic retry');
  assert.equal(owner.peekCurrentProfile(), effective, '422/503 preserve all effective fields');
  assert.equal(page.data.form.bio, '候选简介');
  assert.equal(page.data.form.backgroundUrl, 'local-background-preview');
  assert.equal(
    page._selectedBackgroundFile.length,
    1,
    'Failed background can be explicitly resubmitted',
  );
  assert.match(page.data.saveError, message);
  assert.equal(navigations, 4);
}
page = await editor();
input(page, 'nickname', '新昵称');
await page.onSave();
assert.equal(owner.peekCurrentProfile().nickname, '新昵称');
assert.equal(appStore.get('userInfo').nickname, '新昵称');
assert.equal(owner.peekCurrentProfile().bio, '新简介');
assert.equal(
  requests.filter((request) => request.method === 'GET').length,
  1,
  'Success synchronizes response without another GET',
);
assert.equal(
  requests.some((request) => request.method === 'PATCH' || request.method === 'PUT'),
  false,
);
console.log(
  'PASS profile HTTP flow: Page → Action/Store → Service/API → HTTP → Spring MVC; partial updates, avatar/background references, double tap, 422/503, final state',
);
