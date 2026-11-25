// Real Page/helper modules with controlled wx/business seams; never calls a provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const noop = () => {};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const state = { userInfo: { id: 'a', nickname: 'A', avatarUrl: '' }, currentProfile: null };
const subscriptions = new Map();
const store = {
  get: key => state[key],
  set(key, value) {
    state[key] = value;
    for (const fn of [...(subscriptions.get(key) ?? [])]) fn(value);
  },
  watch(key, fn) {
    if (!subscriptions.has(key)) subscriptions.set(key, new Set());
    subscriptions.get(key).add(fn);
    return () => subscriptions.get(key).delete(fn);
  },
};
const flags = [], feedback = [], saves = [], reads = [];
let selected = [], upload = [], definition, timer = 0;
let pageStack = [];
const wx = {
  canIUse: () => true,
  enableAlertBeforeUnload: () => flags.push(true),
  disableAlertBeforeUnload: () => flags.push(false),
  hideShareMenu: noop, showShareMenu: noop, stopPullDownRefresh: noop,
  showLoading: noop, hideLoading: noop,
};
const mocks = new Map();
const mock = (file, value) => mocks.set(path.resolve(root, file), value);
mock('stores/index.ts', { appStore: store });
mock('utils/auth-session.ts', { waitForAuthStable: async () => {} });
mock('utils/storage.ts', { storage: { set: noop }, STORAGE_KEYS: {} });
mock('utils/logger.ts', { createLogger: () => ({ info: noop, warn: noop, error: noop }) });
mock('services/user.ts', { getProfileErrorMessage: e => e.message });
mock('utils/notify.ts', {
  getErrorMessage: (e, fallback) => e.userMessage ?? e.message ?? fallback,
  notifyToast: o => feedback.push(o), showErrorToast: e => feedback.push(e),
  showInfoToast: e => feedback.push(e), showSuccessToast: e => feedback.push(e),
});
mock('utils/wx-promise.ts', {
  wxGetWindowInfo: () => ({ statusBarHeight: 20, screenHeight: 800, windowHeight: 760, safeArea: { bottom: 780 } }),
  wxHideLoading: noop, wxShowLoading: noop, wxNavigateBack: noop,
  wxShowModal: async () => ({ confirm: true }),
  wxOnKeyboardHeightChange: noop, wxOffKeyboardHeightChange: noop,
});
mock('subpkg_user/behaviors/useAsyncLoad.ts', { useAsyncLoad: () => ({}) });
mock('actions/user.ts', {
  getEditProfileForm: async () => ({ nickname: state.userInfo.nickname, bio: '', avatarUrl: '', backgroundUrl: '' }),
  saveEditProfileAndSync: async body => saves.push(body),
});
mock('actions/media.ts', { selectImages: async () => selected, uploadFilesToCos: async () => upload });
mock('services/person-binding.ts', { watchPersonBinding: () => noop });
mock('subpkg_user/services/growth-record.ts', { readRecordType: x => x });
mock('subpkg_user/services/growth-media.ts', {});
mock('subpkg_user/services/growth-creation.ts', {});
mock('services/post-community.ts', { community: {} });
mock('services/business-subscriptions.ts', { createBusinessSubscription: () => ({ prepare: async () => {}, request: async () => true, dispose: noop }) });
mock('services/post-dictionary.ts', { getPostCategories: async () => ({ items: [], nextCursor: null }) });
mock('services/post.ts', {});
mock('actions/post.ts', {});
mock('actions/post-creation.ts', { pendingPostCreation: () => null });
const cache = new Map();
function load(file) {
  file = path.resolve(root, file);
  if (mocks.has(file)) return mocks.get(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: false },
  }).outputText;
  vm.runInNewContext(code, {
    exports, wx, Page: d => { definition = d; }, Component: d => { definition = d; }, Behavior: d => d,
    getCurrentPages: () => pageStack,
    setTimeout: () => ++timer, clearTimeout: noop,
    require: name => load(path.resolve(path.dirname(file), `${name}.ts`)),
  }, { filename: file });
  return exports;
}
function instance(file) {
  load(file);
  return {
    ...definition, data: structuredClone(definition.data),
    setData(patch) {
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.split('.'), last = parts.pop();
        parts.reduce((at, part) => at[part], this.data)[last] = value;
      }
    },
    _asyncLoadBegin: noop, _asyncLoadSuccess: noop, _asyncLoadFail: noop,
  };
}

const current = load('actions/current-user.ts');
let accountChanges = 0;
const off = current.watchCurrentAccount(() => accountChanges++);
store.set('userInfo', { ...state.userInfo, nickname: 'A2', avatarUrl: 'new-avatar' });
assert.equal(accountChanges, 0);
store.set('userInfo', { id: 'b', nickname: 'B' });
assert.equal(accountChanges, 1);
off();

const grow = instance('subpkg_user/pages/growth-edit/edit.ts');
grow.onLoad({});
grow.inputContent({ detail: { value: '未保存的感悟' } });
grow._files = [{ file: { name: 'proof' } }];
store.set('userInfo', { ...state.userInfo, nickname: 'B2' });
assert.equal(grow.data.content, '未保存的感悟');
assert.equal(grow._files.length, 1);
store.set('userInfo', { id: 'a', nickname: 'A' });
assert.equal(grow.data.content, '');
assert.equal(grow._files.length, 0);
grow.onUnload();

const profile = instance('subpkg_user/pages/edit-profile/edit-profile.ts');
profile.onLoad(); await flush();
profile.onInput({ currentTarget: { dataset: { field: 'nickname' } }, detail: { value: '草稿昵称' } });
store.set('userInfo', { ...state.userInfo, nickname: '远端显示名' });
assert.equal(profile.data.form.nickname, '草稿昵称');
const picker = deferred(); selected = picker.promise;
const selecting = profile.onChangeAvatar();
store.set('userInfo', { id: 'b', nickname: 'B' });
picker.resolve([{ filePath: 'old-account-image' }]); await selecting;
assert.equal(profile.data.form.avatarUrl, '');
assert.equal(profile.data.form.nickname, '');
// Even a late upload cannot turn an A draft into a B profile mutation.
await profile._loadProfile();
profile.onInput({ currentTarget: { dataset: { field: 'nickname' } }, detail: { value: 'B草稿' } });
profile._selectedAvatarFile = [{ filePath: 'b-image' }];
const transfer = deferred(); upload = transfer.promise;
const saving = profile.onSave();
store.set('userInfo', { id: 'a', nickname: 'A' });
transfer.resolve([{ url: 'old-url', objectKey: 'old-key' }]); await saving;
assert.equal(saves.length, 0);
assert.equal(profile.data.form.nickname, '');
profile.onUnload();

const guard = load('utils/leave-guard.ts').createLeaveGuard();
const count = flags.length;
guard(true); guard(true); guard(false); guard(false);
assert.deepEqual(flags.slice(count), [true, false], 'native guard only changes when dirty changes');
wx.canIUse = () => false;
const unsupported = load('utils/leave-guard.ts').createLeaveGuard();
unsupported(true); unsupported(false);
assert.equal(flags.length, count + 2, 'unsupported native capability is not invoked');
wx.canIUse = () => true;

// Official lists refresh atomically and retry exactly the failed cursor.
mock('subpkg_red/services/official-content.ts', {
  OFFICIAL_CATEGORIES: [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }],
  listOfficialContents: (category, cursor) => {
    const d = deferred(); reads.push({ category, cursor, ...d }); return d.promise;
  },
});
const official = instance('subpkg_red/pages/content-list/list.ts');
let operation = official.load(); reads.shift().resolve({ items: [{ id: 'one' }], nextCursor: 'next', hasMore: true }); await operation;
operation = official.load(); assert.equal(official.data.items[0].id, 'one');
reads.shift().reject(new Error('weak network')); await operation;
assert.equal(official._cursor, 'next'); assert.equal(official.data.items[0].id, 'one');
operation = official.load(true); reads.shift().reject(new Error('more failed')); await operation;
official.retry(); const retry = reads.shift(); assert.equal(retry.cursor, 'next');
retry.resolve({ items: [{ id: 'two' }], hasMore: false }); await flush();
assert.equal(official.data.items.length, 2);
operation = official.load(); const stale = reads.shift();
official.changeCategory({ detail: { value: '1' } }); const fresh = reads.shift();
fresh.resolve({ items: [{ id: 'B-only' }], hasMore: false }); await flush();
stale.resolve({ items: [{ id: 'stale' }], hasMore: false }); await operation;
assert.equal(official.data.items[0].id, 'B-only');
official.onUnload();

// Post media cancellation is silent; a genuine picker failure explains recovery.
const post = instance('subpkg_community/pages/post-edit/post-edit.ts'); post._owner = state.userInfo.id;
selected = []; const before = feedback.length;
await post.onAddImage(); assert.equal(feedback.length, before); assert.equal(post.data.selecting, false);
selected = Promise.reject(new Error('permission denied'));
await post.onAddImage(); assert.equal(feedback.length, before + 1);
assert.equal(post.data.selecting, false);
const latePicker = deferred(); selected = latePicker.promise;
const pick = post.onAddImage(); post._alive = false;
latePicker.resolve([{ filePath: 'late' }]); await pick;
assert.equal(post.data.images.length, 0);
wx.getMenuButtonBoundingClientRect = () => ({ top: 52, height: 32, width: 86 });
post.onLoad({ postType: 'MENTOR_QA' });
assert.equal(post.data.panelTop, 100, 'question panel stays 16px below the capsule');
assert.equal(post.data.bodyHeight, 492, 'scroll body uses the capsule-safe panel height');
assert.match(fs.readFileSync(path.join(root, 'subpkg_community/pages/post-edit/post-edit.wxml'), 'utf8'), /style="top:{{panelTop}}px;"/);
post.onUnload();
delete wx.getMenuButtonBoundingClientRect;

for (const file of ['subpkg_red/pages/content-list/list.wxml', 'subpkg_red/pages/content-detail/detail.wxml']) {
  assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /wx:(?:if|elif)="[^{]/);
}
const favorites = JSON.parse(fs.readFileSync(path.join(root, 'subpkg_red/pages/article-favorites/list.json')));
assert.equal(favorites.navigationStyle, 'custom');

const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json')));
assert.equal(app.window.navigationStyle, 'custom');
for (const route of [
  'subpkg_activity/pages/my-registrations/list',
  'subpkg_user/pages/growth-list/list',
  'subpkg_user/pages/party-identity/index',
  'subpkg_user/pages/learning-task-list/list',
  'subpkg_user/pages/person-points/index',
  'subpkg_user/pages/points-apply/index',
  'subpkg_user/pages/points-applications/index',
  'subpkg_user/pages/points-application/index',
  'subpkg_community/pages/my-community/list',
]) {
  const config = JSON.parse(fs.readFileSync(path.join(root, route + '.json')));
  assert.equal(config.navigationStyle, undefined, route);
  assert.equal(config.usingComponents['page-navigation'], '/components/page-navigation/index', route);
  assert.match(fs.readFileSync(path.join(root, route + '.wxml'), 'utf8'), /^<page-navigation title="/);
}

const platform = mocks.get(path.resolve(root, 'utils/wx-promise.ts'));
const getWindowInfo = platform.wxGetWindowInfo;
platform.wxGetWindowInfo = () => ({ windowWidth: 375, statusBarHeight: 44 });
wx.getMenuButtonBoundingClientRect = () => ({ left: 281, top: 48, width: 86, height: 32 });
load('components/page-navigation/index.ts');
const navigation = {
  ...definition.methods,
  data: structuredClone(definition.data),
  setData(data) { Object.assign(this.data, data); },
  triggerEvent(event) { this.event = event; },
};
const statusColors = [];
wx.setNavigationBarColor = ({ frontColor }) => statusColors.push(frontColor);
definition.lifetimes.attached.call(navigation);
statusColors.length = 0;
assert.deepEqual(navigation.data, { statusBarHeight: 44, rowHeight: 40, titleInset: 102 });
platform.wxGetWindowInfo = () => ({ windowWidth: 320, statusBarHeight: 0 });
wx.getMenuButtonBoundingClientRect = () => ({ left: 224, top: 6, width: 88, height: 32 });
definition.pageLifetimes.resize.call(navigation);
assert.deepEqual(navigation.data, { statusBarHeight: 0, rowHeight: 44, titleInset: 104 });
wx.getMenuButtonBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });
definition.pageLifetimes.resize.call(navigation);
assert.deepEqual(navigation.data, { statusBarHeight: 0, rowHeight: 44, titleInset: 104 });
assert.equal(definition.properties.fixed.value, false);
definition.properties.surface.observer.call(navigation, 'page', 'card');
assert.deepEqual(statusColors, []);
definition.properties.surface.observer.call(navigation, 'brand', 'page');
definition.properties.surface.observer.call(navigation, 'page', 'brand');
assert.deepEqual(statusColors, ['#ffffff', '#000000']);
delete wx.setNavigationBarColor;
navigation.onBack();
assert.equal(navigation.event, 'back');
const settingsNav = fs.readFileSync(path.join(root, 'subpkg_setting/pages/setting/setting.wxml'), 'utf8');
assert.match(settingsNav, /<page-navigation[^>]* fixed auto-back="{{false}}" bind:back="onBack"/);
for (const route of ['article-list/list', 'article-detail/detail', 'article-favorites/list', 'content-list/list', 'content-detail/detail']) {
  const template = fs.readFileSync(path.join(root, 'subpkg_red/pages', route + '.wxml'), 'utf8');
  const topNavigation = route === 'article-detail/detail'
    ? /^<view id="reader-navigation"><page-navigation[^>]* fixed surface="{{scene\.brandNavigation \? 'brand' : 'page'}}"/
    : route === 'article-list/list'
      ? /^<page-navigation[^>]* fixed surface="{{scene\.brandNavigation \? 'brand' : 'page'}}"/
      : /^<page-navigation[^>]* fixed surface="page"/;
  assert.match(template, topNavigation);
}
platform.wxGetWindowInfo = getWindowInfo;
delete wx.getMenuButtonBoundingClientRect;
console.log('PASS shared page navigation: inherited custom mode, capsule geometry, resize and fallback');

const profileNavigation = load('utils/user-profile-navigation.ts');
const navigationCalls = [];
const navigateBack = platform.wxNavigateBack;
platform.wxNavigateBack = () => navigationCalls.push('back');
platform.wxNavigateTo = ({ url }) => navigationCalls.push(url);
const authorPage = { route: 'subpkg_user/pages/user/user', options: { userId: 'author' } };
const postDetailPage = { route: 'subpkg_community/pages/detail/detail', options: {} };
pageStack = [authorPage];
await profileNavigation.openUserProfile(state.userInfo.id);
await profileNavigation.openUserProfile('author');
assert.deepEqual(navigationCalls, []);
pageStack.push(postDetailPage);
await profileNavigation.openUserProfile('author');
await profileNavigation.openUserProfile('another author');
assert.deepEqual(navigationCalls, ['back', '/subpkg_user/pages/user/user?userId=another%20author']);
pageStack = [authorPage, { route: 'subpkg_user/pages/user/user', options: { userId: 'someone' } }, postDetailPage];
await profileNavigation.openUserProfile('author');
assert.equal(navigationCalls.at(-1), '/subpkg_user/pages/user/user?userId=author');
const pendingNavigation = deferred();
platform.wxNavigateTo = ({ url }) => {
  navigationCalls.push(url);
  return pendingNavigation.promise;
};
const beforeDoubleTap = navigationCalls.length;
const firstTap = profileNavigation.openUserProfile('another author');
await profileNavigation.openUserProfile('another author');
assert.equal(navigationCalls.length, beforeDoubleTap + 1);
pendingNavigation.resolve();
await firstTap;
pageStack = [];
platform.wxNavigateBack = navigateBack;
delete platform.wxNavigateTo;
console.log('PASS profile links: self and current author stay put; adjacent author returns one page; other authors open normally');

console.log('PASS UI/UX continuity: account vs display identity, dirty guards, stale profile picker/upload, atomic official refresh/cursor retry/query races, media cancellation/errors, native collection navigation and template states. VM only.');

// Selected growth states are read from authorized existing endpoints, never optimistic guesses.
const growthMock = mocks.get(path.resolve(root, 'subpkg_user/services/growth-record.ts'));
const likeRead = deferred(), favoriteRead = deferred();
growthMock.getGrowthLikeState = () => likeRead.promise;
mocks.get(path.resolve(root, 'services/post-community.ts')).community.favorite = () => favoriteRead.promise;
const growthDetail = instance('subpkg_user/pages/growth-detail/detail.ts');
growthDetail._visible = true; growthDetail._id = 'post-1';
const interaction = growthDetail.loadInteractions(0, ['LIKE','FAVORITE']);
likeRead.resolve(true); favoriteRead.resolve({favorited:true}); await interaction;
assert.equal(growthDetail.data.liked,true); assert.equal(growthDetail.data.favorited,true);
assert.equal(growthDetail.data.likeReady,true); assert.equal(growthDetail.data.favoriteReady,true);
const staleLike = deferred(); growthMock.getGrowthLikeState = () => staleLike.promise;
const staleInteraction = growthDetail.loadInteractions(0,['LIKE']);
growthDetail._generation++; growthDetail.data.liked=false;
staleLike.resolve(true); await staleInteraction; assert.equal(growthDetail.data.liked,false);
console.log('PASS growth interaction selection and late permission-state response isolation');

const guardExports = {}, firstEditor = {}, secondEditor = {};
let activeEditor = firstEditor;
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'utils/leave-guard.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
  {exports:guardExports,wx,getCurrentPages:()=>[activeEditor]});
const ownedGuard=guardExports.createLeaveGuard();const beforeOwned=flags.length;
ownedGuard(true);activeEditor=secondEditor;ownedGuard(false);
assert.deepEqual(flags.slice(beforeOwned),[true],'a hidden editor cannot disable another page alert');
activeEditor=firstEditor;ownedGuard.resume();assert.deepEqual(flags.slice(beforeOwned),[true,false]);
console.log('PASS native leave-alert ownership across background completion and return');
