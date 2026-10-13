import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compile = (file) => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const load = (file) => {
  const exports = {};
  vm.runInNewContext(compile(file), { exports });
  return exports;
};
const menu = load('pages/index/red-menu.ts');
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
assert.equal(app.pages[0], 'pages/index/index');
assert.deepEqual(app.tabBar.list.map((item) => item.pagePath), [
  'pages/index/index', 'pages/campus/campus', 'pages/message/message', 'pages/me/me',
]);
assert.ok(app.preloadRule['pages/campus/campus']);
assert.equal(app.preloadRule['pages/index/index'], undefined);
const topics = menu.RED_CATEGORIES.flatMap((category) => category.items);
assert.equal(menu.RED_CATEGORIES.length, 6);
assert.equal(topics.length, 31);
assert.equal(new Set(topics.map((item) => item.id)).size, 31);
assert.equal(topics.find((item) => item.id === 'red-book-corner').children.length, 3);
let page;
const tabCalls = [];
vm.runInNewContext(compile('pages/index/index.ts'), {
  exports: {},
  require: (name) => {
    if (name === './red-menu') return menu;
    if (name.endsWith('/tabbar')) return { getCustomTabBar: () => ({
      init: () => tabCalls.push('init'), toggleVisible: (visible) => tabCalls.push(visible),
    }) };
    throw new Error('Unexpected primary-home dependency: ' + name);
  },
  Page: (definition) => { page = definition; },
  wx: { getWindowInfo: () => ({ statusBarHeight: 24 }),
    getMenuButtonBoundingClientRect: () => ({ width: 80, top: 32, height: 32 }),
    pageScrollTo: () => Promise.resolve() },
});
page.setData = (patch) => Object.assign(page.data, patch);
assert.equal(page.data.currentCategory.key, menu.RED_CATEGORIES[0].key);
page.onLoad(); assert.equal(page.data.statusBarHeight, 24);
page.onShow(); assert.deepEqual(tabCalls, ['init', true]);
for (const category of menu.RED_CATEGORIES) {
  page.openCategory({ currentTarget: { dataset: { key: category.key } } });
  assert.equal(page.data.currentCategory.key, category.key);
  assert.equal(page.data.expandedItemId, '');
  const id = category.items[0].id;
  page.toggleTopic({ currentTarget: { dataset: { id } } });
  assert.equal(page.data.expandedItemId, id);
  page.toggleTopic({ currentTarget: { dataset: { id: 'invalid' } } });
  assert.equal(page.data.expandedItemId, id);
  page.toggleTopic({ currentTarget: { dataset: { id } } });
  assert.equal(page.data.expandedItemId, '');
}
assert.equal(page.onShareAppMessage().path, '/pages/index/index');
let redirect;
vm.runInNewContext(compile('subpkg_red/pages/index/index.ts'), {
  exports: {}, require: () => ({ wxSwitchTab: ({ url }) => { redirect = url; return Promise.resolve(); } }),
  Page: (definition) => definition.onLoad(),
});
assert.equal(redirect, '/pages/index/index');
let component;
let unreadListener;
vm.runInNewContext(compile('custom-tab-bar/index.ts'), {
  exports: {},
  require: (name) => {
    if (name.endsWith('/defineComponent')) return { __esModule: true, default: () => (definition) => { component = definition; } };
    if (name.endsWith('/routes')) return load('utils/routes.ts');
    if (name.endsWith('/event-bus')) return { eventBus: { on: (_, listener) => { unreadListener = listener; } }, EVENTS: { NOTIFY_UNREAD_CHANGE: 'unread' } };
    if (name.endsWith('/notification-center')) return { getUnreadCount: () => 7 };
    if (name.endsWith('/wx-promise')) return {};
    throw new Error('Unexpected tab dependency: ' + name);
  },
});
const badges = [];
component.lifetimes.attached.call({ setBadge: (index, count) => badges.push({ index, count }) });
unreadListener(9);
assert.equal(component.data.tabList[2].url, '/pages/message/message');
assert.deepEqual(badges, [{ index: 2, count: 7 }, { index: 2, count: 9 }]);
const wxml = fs.readFileSync('pages/index/index.wxml', 'utf8');
assert.ok(wxml.indexOf('red-directory') < wxml.indexOf('校园服务'));
assert.ok(!wxml.includes('listLoad'));
assert.ok(wxml.includes('url="/pages/campus/campus" open-type="switchTab"'));
console.log('PASS: primary-home routes, six categories, 31 topics, selection, share compatibility and message badge ownership (simulation/static checks).');
