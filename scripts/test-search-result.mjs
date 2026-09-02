import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { setImmediate } from 'node:timers';
import { URL } from 'node:url';
import ts from 'typescript';

// 运行真实 Page 方法，只替换微信运行时和请求边界；不代替开发者工具视觉验收。
const source = fs.readFileSync(
  new URL('../subpkg_community/pages/search-result/search-result.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const result = (list = [], hasMore = false, nextCursor = '') => ({ list, hasMore, nextCursor });
const input = (page, value) => page.onInput({ detail: { value } });
const switchTab = (page, id) => page.onSwitchTab({ currentTarget: { dataset: { id } } });

function harness() {
  const requests = [];
  const logs = [];
  const history = [];
  let definition;
  const request = (tab, query) =>
    new Promise((resolve, reject) => requests.push({ tab, query, resolve, reject }));
  const imports = {
    '../../../utils/logger': { createLogger: () => ({ error: (...args) => logs.push(args) }) },
    '../../../utils/wx-promise': { wxNavigateBack: () => Promise.resolve() },
    '../../actions/search': {
      recordSearchKeyword: (keyword) => history.push(keyword),
      searchPosts: (query) => request('all', query),
      searchActivities: (query) => request('activity', query),
    },
  };
  vm.runInNewContext(compiled, {
    exports: {},
    require(name) {
      assert.ok(imports[name], `Unexpected import: ${name}`);
      return imports[name];
    },
    Page: (options) => (definition = options),
    wx: { getWindowInfo: () => ({ statusBarHeight: 24 }) },
  });
  function createPage(options = { keyword: '校园' }) {
    const page = {
      ...definition,
      data: JSON.parse(JSON.stringify(definition.data)),
      writes: 0,
      setData(patch) {
        this.writes++;
        Object.assign(this.data, patch);
      },
    };
    page.onLoad(options);
    return page;
  }
  return { createPage, requests, logs, history };
}

test('首次加载与空结果分开；空结果也按分类缓存', async () => {
  const { createPage, requests } = harness();
  const page = createPage();
  assert.equal(page.data.loading, true);
  assert.equal(page.data.loaded, false);
  page.onReachBottom();
  assert.equal(requests.length, 1);
  requests[0].resolve(result());
  await flush();
  assert.equal(page.data.loading, false);
  assert.equal(page.data.loaded, true);
  assert.equal(page.data.error, false);
  switchTab(page, 'activity');
  requests[1].resolve(result());
  await flush();
  switchTab(page, 'all');
  switchTab(page, 'activity');
  assert.equal(requests.length, 2);
  assert.equal(page.data.loaded, true);
});

test('切换分类立即请求；旧分类成功和失败都不能污染当前状态', async () => {
  const { createPage, requests, logs } = harness();
  const page = createPage();
  switchTab(page, 'activity');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].tab, 'activity');
  requests[0].resolve(result([{ id: 'old' }]));
  await flush();
  assert.equal(page.data.postList.length, 0);
  assert.equal(page.data.loading, true);
  switchTab(page, 'all');
  requests[1].reject(new Error('stale failure'));
  await flush();
  assert.equal(page.data.error, false);
  assert.equal(page.data.loading, true);
  assert.equal(logs.length, 0);
  requests[2].resolve(result([{ id: 'latest' }]));
  await flush();
  assert.equal(page.data.postList[0].id, 'latest');
});

test('首屏失败保留错误状态；显式重试可以恢复', async () => {
  const { createPage, requests } = harness();
  const page = createPage();
  requests[0].reject(new Error('offline'));
  await flush();
  assert.equal(page.data.error, true);
  assert.equal(page.data.loaded, false);
  assert.equal(page.data.loading, false);
  page.onReachBottom();
  assert.equal(requests.length, 1);
  page.onRetry();
  page.onRetry();
  assert.equal(requests.length, 2);
  assert.equal(page.data.loading, true);
  requests[1].resolve(result([{ id: 'recovered' }]));
  await flush();
  assert.equal(page.data.loaded, true);
  assert.equal(page.data.error, false);
});

test('分页使用已提交关键词；失败保留结果，重试使用同一游标', async () => {
  const { createPage, requests } = harness();
  const page = createPage();
  requests[0].resolve(result([{ id: 'first' }], true, 'cursor-1'));
  await flush();
  input(page, '尚未提交');
  page.onReachBottom();
  assert.equal(requests[1].query.keyword, '校园');
  assert.equal(requests[1].query.lastId, 'cursor-1');
  requests[1].reject(new Error('offline'));
  await flush();
  assert.equal(page.data.loaded, true);
  assert.equal(page.data.postList.length, 1);
  assert.equal(page.data.error, true);
  page.onRetry();
  assert.equal(requests[2].query.lastId, 'cursor-1');
  requests[2].resolve(result([{ id: 'second' }]));
  await flush();
  assert.equal(page.data.postList.length, 2);
  page.onReachBottom();
  assert.equal(requests.length, 3);
});

test('新关键词可以替换进行中的请求，迟到响应不能回写', async () => {
  const { createPage, requests, history } = harness();
  const page = createPage();
  input(page, '  音乐  ');
  page.onConfirm();
  assert.equal(requests.length, 2);
  assert.equal(page.data.keyword, '音乐');
  assert.equal(requests[1].query.keyword, '音乐');
  requests[1].resolve(result([{ id: 'music' }]));
  await flush();
  requests[0].resolve(result([{ id: 'stale' }]));
  await flush();
  assert.equal(page.data.postList[0].id, 'music');
  assert.deepEqual(history, ['校园', '音乐']);
});

test('按钮清空和键盘删空都会使旧请求失效', async () => {
  for (const clear of [(page) => page.onClear(), (page) => input(page, '')]) {
    const { createPage, requests } = harness();
    const page = createPage();
    clear(page);
    const writes = page.writes;
    requests[0].resolve(result([{ id: 'stale' }]));
    await flush();
    assert.equal(page.writes, writes);
    assert.equal(page.data.searchKeyword, '');
    assert.equal(page.data.loading, false);
    assert.equal(page.data.loaded, false);
  }
});

test('页面实例请求相互独立，卸载后无 setData', async () => {
  const { createPage, requests } = harness();
  const first = createPage();
  const second = createPage({ keyword: '音乐' });
  first.onUnload();
  const writes = first.writes;
  requests[0].reject(new Error('after unload'));
  requests[1].resolve(result([{ id: 'second-page' }]));
  await flush();
  assert.equal(first.writes, writes);
  assert.equal(second.data.postList[0].id, 'second-page');
});

test('未接入考试不出现在分类中，旧路由安全回退，空关键词不请求', () => {
  const { createPage, requests } = harness();
  const page = createPage({ keyword: '考试', tab: 'exam' });
  assert.deepEqual(
    Array.from(page.data.tabs, (tab) => tab.label),
    ['动态', '活动'],
  );
  assert.equal(page.data.activeTab, 'all');
  assert.equal(requests[0].tab, 'all');
  switchTab(page, 'exam');
  assert.equal(page.data.activeTab, 'all');
  const empty = createPage({ keyword: '  ' });
  empty.onReachBottom();
  empty.onConfirm();
  switchTab(empty, 'activity');
  assert.equal(requests.length, 1);
  assert.equal(empty.data.searchKeyword, '');
});
