// Consumer boundary simulation. No real backend, upload or device evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const calls = [];
let nativeCalls = 0;
let nativeResponse;
const wx = {
  request(options) {
    nativeCalls++;
    options.success(nativeResponse);
  },
};
let response;
let error;
const http = Object.fromEntries(
  ['get', 'post'].map((method) => [
    method,
    async (...args) => {
      calls.push({ method, args });
      if (error) throw error;
      return response;
    },
  ]),
);
const mocks = new Map([
  ['utils/request.ts', { http }],
  ['utils/logger.ts', { createLogger: () => ({ error() {}, warn() {} }) }],
  ['utils/wx-promise.ts', {}],
]);
function createLoader() {
  const cache = new Map();
  function load(name) {
    const key = path.relative(root, path.resolve(root, name)).replaceAll('\\', '/');
    if (mocks.has(key)) return mocks.get(key);
    if (cache.has(key)) return cache.get(key);
    const exports = {};
    cache.set(key, exports);
    const source = fs.readFileSync(path.join(root, key), 'utf8');
    const js = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: false,
      },
    }).outputText;
    vm.runInNewContext(
      js,
      {
        exports,
        wx,
        require: (relative) => load(path.resolve(root, path.dirname(key), `${relative}.ts`)),
      },
      { filename: key },
    );
    return exports;
  }
  return load;
}

const load = createLoader();
const service = load('services/user.ts');
const { HttpError, getHttpErrorMessage } = load('utils/error.ts');
response = {
  userId: 'same-name-1',
  nickname: '同学甲',
  avatarUrl: null,
  backgroundUrl: null,
  bio: '',
  isPlatformOperator: false,
};
assert.deepEqual(JSON.parse(JSON.stringify(await service.getCurrentProfile())), response);
assert.equal(calls.at(-1).args[0], '/v1/users/me/profile');
assert.equal(calls.at(-1).args[2].sensitive, true);
delete response.backgroundUrl;
await assert.rejects(service.getCurrentProfile(), /Invalid canonical/, 'Missing required background is not a cleared background');
response.backgroundUrl = null;
const completeProfile = response;
response = { ...response };
delete response.backgroundUrl;
await assert.rejects(service.getCurrentProfile(), /Invalid canonical/, 'Missing background is not a cleared background');
response = { ...completeProfile, userId: 'operator/2', isPlatformOperator: true, backgroundUrl: 'https://example.com/background' };
assert.equal((await service.getPublicProfile('operator/2')).isPlatformOperator, true);
assert.equal((await service.getPublicProfile('operator/2')).backgroundUrl, 'https://example.com/background');
assert.equal(calls.at(-1).args[0], '/v1/users/operator%2F2/profile');
assert.equal(response.nickname, '同学甲', 'Duplicate display names are valid');
response = { ...response, role: 2, openid: 'must-not-propagate' };
assert.equal('role' in (await service.getCurrentProfile()), false);
response = { ...response, userId: 2 };
await assert.rejects(service.getCurrentProfile(), /Invalid canonical/);
response = {
  userId: 'same-name-1',
  nickname: '同学甲',
  avatarUrl: null,
  backgroundUrl: null,
  bio: '',
  isPlatformOperator: false,
};
const simulated = service;
await simulated.updateUserInfo({ bio: '', role: 2, userId: 'wrong', avatarUrl: 'untrusted' });
assert.equal(calls.at(-1).method, 'post');
assert.equal(calls.at(-1).args[0], '/v1/users/me/profile');
assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).args[1])), { bio: '' });
await simulated.updateUserInfo({ avatarObjectKey: 'owned/avatar' });
assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).args[1])), {
  avatarObjectKey: 'owned/avatar',
});

const rejected = getHttpErrorMessage(
  422,
  'raw provider message',
  '/problems/profile-content-rejected',
);
const unavailable = getHttpErrorMessage(
  503,
  'raw provider message',
  '/problems/profile-safety-check-unavailable',
);
assert.match(rejected, /未通过/);
assert.match(unavailable, /暂不可用/);
assert.notEqual(rejected, unavailable);
assert.equal(service.getProfileErrorMessage(new HttpError(404)), '用户不存在或暂不可查看');

// Draft -> media reference -> partial payload, while failed saves retain draft and effective state.
let definition;
let submitted;
let uploadCount = 0;
let authoritative = response;
let saveFailure;
const nav = [];
mocks.set('utils/definePage.ts', {
  default: (value) => {
    definition = value;
  },
});
mocks.set('subpkg_user/behaviors/useAsyncLoad.ts', { useAsyncLoad: () => ({}) });
mocks.set('utils/wx-promise.ts', {
  wxShowLoading: async () => {},
  wxHideLoading: async () => {},
  wxNavigateBack: async () => {
    nav.push('back');
  },
});
mocks.set('actions/media.ts', {
  uploadFilesToCos: async (_type, files) => {
    uploadCount++;
    return files.map((file) => {
      const kind = file.filePath.includes('background') ? 'background' : 'avatar';
      return { url: `https://example.com/${kind}`, objectKey: `owned/${kind}` };
    });
  },
});
mocks.set('actions/user.ts', {
  saveEditProfileAndSync: async (payload) => {
    submitted = payload;
    if (saveFailure) throw saveFailure;
    authoritative = { ...authoritative, ...payload };
  },
});
mocks.set('utils/notify.ts', { notifyToast() {}, getErrorMessage: (e) => e.userMessage ?? '失败' });
createLoader()('subpkg_user/pages/edit-profile/edit-profile.ts');
const form = { nickname: '同学甲', bio: '原简介', avatarUrl: 'old', backgroundUrl: 'old-background' };
const page = {
  ...definition,
  data: {
    ...definition.data,
    form: { ...form, bio: '' },
    _original: form,
    hasChanged: true,
    nicknameLength: 3,
    bioLength: 0,
  },
  setData(patch) {
    Object.assign(this.data, patch);
  },
};
await page.onSave();
assert.deepEqual(JSON.parse(JSON.stringify(submitted)), { bio: '' });
assert.equal(uploadCount, 0);
assert.equal(nav.length, 1);
page._selectedAvatarFile = [{ filePath: 'temporary-avatar' }];
page.data.form = { ...form, avatarUrl: 'temporary-avatar' };
page.data.nicknameLength = 3;
saveFailure = new HttpError(422, 'rejected', { userMessage: rejected });
const oldEffective = authoritative;
await page.onSave();
assert.deepEqual(JSON.parse(JSON.stringify(submitted)), { avatarObjectKey: 'owned/avatar' });
assert.equal(authoritative, oldEffective);
assert.equal(page.data.form.avatarUrl, 'temporary-avatar', 'Local preview remains a draft');
assert.equal(page._selectedAvatarFile.length, 1, 'Failure allows explicit retry');
assert.equal(page.data.saveError, rejected);
assert.equal(nav.length, 1, 'Failure never navigates as saved');
saveFailure = new HttpError(503, 'unavailable', { userMessage: unavailable });
await page.onSave();
assert.equal(page.data.saveError, unavailable);
assert.equal(authoritative, oldEffective);

page._selectedAvatarFile = [];
page._selectedBackgroundFile = [{ filePath: 'temporary-background' }];
page.data.form = { ...form, backgroundUrl: 'temporary-background' };
await page.onSave();
assert.deepEqual(JSON.parse(JSON.stringify(submitted)), { backgroundObjectKey: 'owned/background' });
assert.equal(authoritative, oldEffective, 'Background failure never changes effective profile');
assert.equal(page._selectedBackgroundFile.length, 1, 'Failed background remains a draft');
saveFailure = null;
page._selectedAvatarFile = [{ filePath: 'temporary-avatar' }];
page.data.form.avatarUrl = 'temporary-avatar';
await page.onSave();
assert.deepEqual(JSON.parse(JSON.stringify(submitted)), {
  avatarObjectKey: 'owned/avatar', backgroundObjectKey: 'owned/background',
});
assert.equal(page._selectedBackgroundFile.length, 0);
assert.equal(page._selectedAvatarFile.length, 0);
await simulated.updateUserInfo({ backgroundObjectKey: 'owned/background', backgroundUrl: 'untrusted' });
assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).args[1])), { backgroundObjectKey: 'owned/background' });
assert.match(fs.readFileSync(path.join(root, 'components/user-profile/index.wxml'), 'utf8'), /userInfo\.backgroundUrl/);

const publicSource = fs.readFileSync(path.join(root, 'subpkg_user/pages/user/user.ts'), 'utf8');
const publicView = fs.readFileSync(path.join(root, 'subpkg_user/pages/user/user.wxml'), 'utf8');
assert.doesNotMatch(publicSource, /getUserLikedPosts|_loadLikes/);
assert.doesNotMatch(publicView, /点赞|likes/);
for (const file of ['services/user.ts', 'actions/user.ts', 'actions/current-user.ts']) {
  assert.doesNotMatch(
    fs.readFileSync(path.join(root, file), 'utf8'),
    /verified:\s*true|role\s*===/,
  );
}
console.log(
  'PASS profile-contract: canonical reads, identities, partial payloads, draft/save failure semantics, private likes',
);

// Exercise the real shared HTTP error boundary with simulated wx callbacks.
mocks.delete('utils/request.ts');
mocks.set('config/index.ts', { default: { baseURL: 'https://example.com', timeout: 1000 } });
mocks.set('utils/logger.ts', { createLogger: () => ({ info() {} }) });
mocks.set('utils/auth-transport.ts', { getAuthToken: async () => 'test-token' });
mocks.set('utils/transfer.ts', {});
mocks.set('utils/stream.ts', {});
const transportLoad = createLoader();
const transport = transportLoad('utils/request.ts').http;
nativeResponse = { statusCode: 200, data: response, header: {} };
assert.equal(
  (await transport.get('/v1/users/me/profile', undefined, { sensitive: true })).userId,
  response.userId,
);
for (const [status, type, expected] of [
  [422, '/problems/profile-content-rejected', /未通过/],
  [503, '/problems/profile-safety-check-unavailable', /暂不可用/],
]) {
  nativeResponse = { statusCode: status, data: { type }, header: {} };
  await assert.rejects(
    transport.get('/v1/users/me/profile'),
    (e) => e.problemType === type && expected.test(e.userMessage),
  );
}
nativeResponse = { statusCode: 200, data: response, header: {} };
const writesBefore = nativeCalls;
await transport.post('/v1/users/me/profile', { bio: '' }, { sensitive: true });
assert.equal(nativeCalls, writesBefore + 1, 'POST is sent exactly once');
assert.equal(typeof transport.patch, 'undefined', 'No unsupported native PATCH API');
console.log('PASS profile HTTP: direct response, stable ProblemDetails mapping, canonical POST');
