// Focused UI behavior regressions. Page, transport and wx are controlled substitutes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const cache = new Map();
const mocks = new Map();
const pages = [];
const navigation = [];
const previews = [];
let publishContext;
let modalConfirm = true;
const mock = (name, value) => mocks.set(name, value);
const clone = (value) => JSON.parse(JSON.stringify(value));
const httpHandler = async (method, url) => {
  if (method === 'get' && url === '/v1/users/me/growth-publishing-context') return publishContext;
  throw new Error(`Unexpected request: ${method} ${url}`);
};
const http = Object.fromEntries(
  ['get', 'post', 'put', 'patch', 'del'].map((method) => [
    method,
    (url, data, options) => httpHandler(method, url, data, options),
  ]),
);

mock('utils/request.ts', { http, httpWithMeta: http });
mock('utils/definePage.ts', { __esModule: true, default: (definition) => pages.push(definition) });
mock('utils/defineComponent.ts', {
  __esModule: true,
  default: () => (definition) => pages.push(definition),
});
mock('behaviors/sheet-mixin.ts', { useSheet: () => ({}) });
mock('services/post-dictionary.ts', {
  getPostCategories: async () => ({
    items: [{ id: 'category-1', name: '校园生活', status: 'ACTIVE', postTypes: ['NORMAL'] }],
    nextCursor: null,
  }),
});
mock('utils/leave-guard.ts', { createLeaveGuard: () => () => undefined });
mock('utils/logger.ts', { createLogger: () => ({ error() {}, warn() {}, info() {} }) });
mock('utils/notify.ts', { getErrorMessage: (error) => error?.message ?? 'error' });
mock('utils/wx-promise.ts', {
  wxShowModal: async () => ({ confirm: modalConfirm }),
  chooseMessageFile: async () => [],
});
mock('actions/media.ts', { selectImages: async () => [] });
mock('actions/current-user.ts', {
  getCurrentIdentity: () => ({ id: 'user-1' }),
  watchCurrentAccount: () => () => undefined,
  watchCurrentIdentity: () => () => undefined,
});
mock('services/person-binding.ts', {
  getMyPersonBinding: async () => ({ state: 'BOUND', personId: 'person-1', bindingId: 'binding-1' }),
  watchPersonBinding: () => () => undefined,
  assertCurrentPerson: async () => undefined,
  requireCurrentPerson: async () => ({}),
});
mock('subpkg_user/services/growth-creation.ts', {
  pendingGrowthCreation: () => null,
  retainGrowthCreation: () => null,
  runGrowthCreation: async () => null,
});
mock('subpkg_user/services/growth-media.ts', {});

function load(name) {
  name = name.replaceAll('\\', '/');
  if (mocks.has(name)) return mocks.get(name);
  if (cache.has(name)) return cache.get(name);
  const file = path.join(root, name);
  const exports = {};
  cache.set(name, exports);
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(
    output,
    {
      exports,
      require: (id) =>
        load(path.relative(root, path.resolve(path.dirname(file), `${id}.ts`))),
      wx: {
        navigateTo: (options) => navigation.push(options),
        previewImage: (options) => previews.push(options),
      },
      Date,
      Math,
      Set,
      Map,
      Error,
      Promise,
      setTimeout,
      clearTimeout,
    },
    { filename: file },
  );
  return exports;
}

function instance(definition) {
  return {
    ...definition,
    data: clone(definition.data),
    setData(patch, callback) {
      Object.assign(this.data, patch);
      callback?.();
    },
  };
}

const { resolveContentTitle } = load('utils/content-presentation.ts');
assert.equal(resolveContentTitle('如何准备挑战杯？', '我想了解校赛的时间安排。'), '如何准备挑战杯？');
assert.equal(resolveContentTitle('周末参加了志愿服务', '周末参加了志愿服务，记录一次实践。'), '');
assert.equal(resolveContentTitle('周末参加了志愿服务...', '周末参加了志愿服务，记录一次实践。'), '');
assert.equal(resolveContentTitle('周末参加了志愿服务…', '周末参加了志愿服务，记录一次实践。'), '');
assert.equal(resolveContentTitle('  同一段内容  ', '同一段内容'), '');
assert.equal(resolveContentTitle('无标题', '正文'), '');
assert.equal(resolveContentTitle(null, '正文'), '');
console.log('PASS independent titles remain and generated/opening summaries are not duplicated');

const { canOpenPublicPostDetail } = load('utils/post-community.ts');
const lifecycleNow = Date.parse('2026-11-24T10:00:00+08:00');
const publicLifecycle = {
  acceptedAt: '2026-11-24T09:59:00+08:00',
  submissionVersion: 'v1',
  effectiveVersion: 'v1',
  visibility: 'PUBLIC',
  safety: 'PASSED',
  authorDeleted: false,
  adminHidden: false,
};
assert.equal(canOpenPublicPostDetail(publicLifecycle, lifecycleNow), true);
assert.equal(canOpenPublicPostDetail({ ...publicLifecycle, effectiveVersion: null }, lifecycleNow), false);
assert.equal(canOpenPublicPostDetail({ ...publicLifecycle, visibility: 'PRIVATE' }, lifecycleNow), false);
assert.equal(canOpenPublicPostDetail({ ...publicLifecycle, adminHidden: true }, lifecycleNow), false);
assert.equal(
  canOpenPublicPostDetail(
    {
      ...publicLifecycle,
      visibility: 'TEMPORARY',
      safety: 'CHECKING',
      temporaryVisibleUntil: '2026-11-24T10:05:00+08:00',
    },
    lifecycleNow,
  ),
  true,
);
assert.equal(
  canOpenPublicPostDetail(
    { ...publicLifecycle, visibility: 'TEMPORARY', temporaryVisibleUntil: '2026-11-24T09:55:00+08:00' },
    lifecycleNow,
  ),
  false,
);
console.log('PASS publish navigation opens only lifecycle-confirmed public details');

publishContext = {
  personId: 'person-1',
  evaluatedAt: '2026-11-24T10:00:00+08:00',
  organizations: [
    { organizationId: 'org-1', name: '第一党支部', allowedRecordTypes: ['GROWTH', 'POLITICAL_BIRTHDAY'] },
  ],
};
load('subpkg_user/pages/growth-edit/edit.ts');
const political = instance(pages.at(-1));
political.onLoad({ recordType: 'POLITICAL_BIRTHDAY' });
political._visible = true;
await political.load();
assert.equal(political.data.organizationIndex, 0);
assert.equal(political.data.typeNames[political.data.typeIndex], '政治生日');
assert.equal(political._organizationId, 'org-1');
console.log('PASS political-birthday context and a sole eligible organization preselect safely');

political._files = [
  { file: { path: '/tmp/a.jpg', name: 'a.jpg', kind: 'IMAGE' }, attempt: {} },
  { file: { path: '/tmp/b.mp4', name: 'b.mp4', kind: 'VIDEO' }, attempt: {} },
  { file: { path: '/tmp/c.jpg', name: 'c.jpg', kind: 'IMAGE' }, attempt: {} },
];
political.previewLocal({ currentTarget: { dataset: { index: 2 } } });
assert.deepEqual(clone(previews.at(-1)), { current: '/tmp/c.jpg', urls: ['/tmp/a.jpg', '/tmp/c.jpg'] });
console.log('PASS local growth image preview excludes videos and protected remote URLs');

publishContext = {
  ...publishContext,
  organizations: [
    { organizationId: 'org-1', name: '第一党支部', allowedRecordTypes: ['GROWTH'] },
    { organizationId: 'org-2', name: '第二党支部', allowedRecordTypes: ['POLITICAL_BIRTHDAY'] },
  ],
};
const ambiguous = instance(pages.at(-1));
ambiguous.onLoad({});
ambiguous._visible = true;
await ambiguous.load();
assert.equal(ambiguous.data.organizationIndex, -1);
ambiguous.changeOrganization({ detail: { value: '1' } });
assert.equal(ambiguous.data.organizationIndex, 1);
assert.equal(ambiguous.data.typeNames[ambiguous.data.typeIndex], '政治生日');
console.log('PASS multiple organizations require a choice and preserve the sole supported type');

const listDefinition = load('subpkg_user/pages/growth-list/list.ts');
assert.ok(listDefinition);
const list = instance(pages.at(-1));
list.onLoad({ recordType: 'POLITICAL_BIRTHDAY' });
list.publish();
assert.match(navigation.at(-1).url, /recordType=POLITICAL_BIRTHDAY/);
console.log('PASS political-birthday list publishing carries its record type');

load('components/post-edit-panel/index.ts');
const panelDefinition = pages.at(-1);
const panel = instance(panelDefinition);
Object.assign(panel, panelDefinition.methods);
panel.closeSheet = function closeSheet() {
  this.closeCount = (this.closeCount ?? 0) + 1;
};
panel.lifetimes.attached.call(panel);
panel.onContentInput({ detail: { value: '保留这条草稿' } });
panel.setData({ busy: true });
await panel.onRequestClose();
assert.equal(panel.closeCount, undefined);
panel.setData({ busy: false });
modalConfirm = false;
await panel.onRequestClose();
assert.equal(panel.closeCount, undefined);
assert.equal(panel.data.dirty, true);
modalConfirm = true;
await panel.onRequestClose();
assert.equal(panel.closeCount, 1);
assert.equal(panel.data.dirty, false);
panel.lifetimes.detached.call(panel);
console.log('PASS home composer keeps dirty/busy sheets open until explicit discard confirmation');

const dragModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'utils/drag.wxs'), 'utf8'), {
  module: dragModule,
  Math,
});
const dragCalls = [];
const dragStyles = [];
const dragHost = {
  selectComponent: () => ({ setStyle: (style) => dragStyles.push(style) }),
  callMethod: (name) => dragCalls.push(name),
};
dragModule.exports.handleClose(
  { currentTarget: { dataset: { closeGuard: true, panelH: 600 } } },
  dragHost,
);
assert.deepEqual(dragCalls, ['onRequestClose']);
assert.equal(dragStyles.length, 0);
dragModule.exports.handleClose({ currentTarget: { dataset: { panelH: 600 } } }, dragHost);
assert.deepEqual(dragCalls, ['onRequestClose', 'onWxsDismiss']);
assert.equal(dragStyles.length, 2);
console.log('PASS guarded WXS close requests confirmation before animation; unguarded sheets are unchanged');

const campusSource = fs.readFileSync(path.join(root, 'pages/campus/campus.ts'), 'utf8');
const homePublish = campusSource.match(/onPublishPost\(\) \{[\s\S]*?\n  \},/)?.[0] ?? '';
assert.match(homePublish, /popupType: 'post-edit'/);
assert.doesNotMatch(homePublish, /subpkg_community\/pages\/post-edit\/post-edit/);
assert.match(campusSource, /title: null/);
assert.doesNotMatch(campusSource, /my-community\/detail\?kind=post/);
const routedEditorSource = fs.readFileSync(
  path.join(root, 'subpkg_community/pages/post-edit/post-edit.ts'),
  'utf8',
);
assert.doesNotMatch(routedEditorSource, /my-community\/detail\?kind=post/);
const panelTemplate = fs.readFileSync(path.join(root, 'components/post-edit-panel/index.wxml'), 'utf8');
assert.match(panelTemplate, /maxlength="1000"/);
assert.match(panelTemplate, /data-close-guard/);
assert.match(panelTemplate, /wx:if="\{\{categories.length \|\| categoryId\}\}"/);
console.log('PASS campus publish stays in the gesture-enabled component without generated titles');

const postEditor = fs.readFileSync(path.join(root, 'subpkg_community/pages/post-edit/post-edit.wxml'), 'utf8');
assert.match(postEditor, /organizationEnabled && postType === 'MENTOR_QA'/);
assert.equal((postEditor.match(/catchtap="onAddImage"/g) ?? []).length, 1);
const growthList = fs.readFileSync(path.join(root, 'subpkg_user/pages/growth-list/list.wxml'), 'utf8');
const growthDetail = fs.readFileSync(path.join(root, 'subpkg_user/pages/growth-detail/detail.wxml'), 'utf8');
assert.doesNotMatch(growthList, /item\.title \|\| item\.typeLabel/);
assert.doesNotMatch(growthDetail, /record\.title \|\| view\.typeLabel/);
console.log('PASS normal composer has no title field or duplicate image action; growth has no placeholder title');
