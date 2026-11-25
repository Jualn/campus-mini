import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function loader(overrides = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    }).outputText;
    vm.runInNewContext(js, { exports, Date, Set, Map, console,
      ...overrides.globals,
      require(name) {
        if (name in overrides) return overrides[name];
        return load(path.resolve(path.dirname(file), name + '.ts'));
      },
    }, { filename: file });
    return exports;
  }
  return load;
}
const load = loader();
const audience = load('utils/activity-audience.ts');
assert.deepEqual(Array.from(audience.activityScopeLabels({ type: 'CAMPUS' })), ['全院']);
assert.deepEqual(Array.from(audience.activityScopeLabels({ type: 'DEPARTMENTS', departmentIds: ['2'] })), ['范围待确认']);
assert.deepEqual(Array.from(audience.activityScopeLabels({ type: 'DEPARTMENTS', departmentIds: ['information', 'science', 'finance'] }, 'finance', true)), ['财经学科部', '信息学科部', '等 3 个学科部']);
assert.equal(audience.activityScopeLabels({ type: 'DEPARTMENTS', departmentIds: ['information', 'science', 'finance'] }).length, 3);
assert.match(audience.activityScopeLabels({ type: 'DEPARTMENTS', departmentIds: ['information', 'science', 'legacy'] }, '', true)[2], /范围待确认/);
const raw = { activityId: 'a', title: 'title', summary: 'intro', category: 'COMPETITION', organizer: 'owner', audienceSummary: '限定三年级', audienceScope: { type: 'CAMPUS' }, lifecycleStatus: 'ACTIVE', availability: { state: 'OPEN' } };
const card = load('subpkg_activity/services/activity-card-mapper.ts').toCard(raw);
assert.equal(card.type, '比赛');
assert.equal(card.summary, 'intro');
assert.deepEqual(Array.from(card.scope), ['全院']);
assert.equal(card.audienceScope.type, 'CAMPUS');
assert.equal(load('subpkg_community/services/activity-card-mapper.ts').toCard(raw).type, card.type);

const requests = [];
const apiLoader = loader({ '../../utils/request': { http: { get: async (url, query) => { requests.push({ url, query }); return { items: [raw], nextCursor: 'n' }; } }, httpWithMeta: {} } });
const api = apiLoader('subpkg_activity/services/event-api.ts').eventApi;
await api.activities.list({ q: 'title', category: 'COMPETITION', lifecycleStatus: 'ACTIVE', audienceFilter: 'DEPARTMENT', departmentId: 'information', cursor: 'c' });
assert.equal(requests[0].url, '/v1/activities');
assert.equal(requests[0].query.departmentId, 'information');
const searchLoader = loader({
  '../../services/api': { api: {} }, '../../services/post': { mapPostListItem() {} },
  './event-api': { eventApi: api } });
const search = await searchLoader('subpkg_community/services/search.ts').searchActivities({ keyword: ' title ', lastId: 'n', pageSize: 10 });
assert.equal(search.list[0].type, '比赛');
assert.equal(requests.at(-1).query.audienceFilter, 'ALL');
assert.equal(requests.at(-1).query.lifecycleStatus, 'ACTIVE');

function harness() {
  let definition, watcher, user = 'u1', stopped = 0;
  const pending = [];
  const timers = new Map(); let timerId = 0;
  const pageLoad = loader({
    '../../services/event-api': {},
    '../../../utils/definePage': { __esModule: true, default: (options) => { definition = options; } },
    '../../../utils/error': { isHttpError: (e) => !!e.problemType },
    '../../../utils/wx-promise': { wxNavigateBack() {} },
    '../../config/activity-list': { ACTIVITY_LIST_MAX_AGE_MS: 60000 },
    '../../../stores/helper': { getUserId: () => user },
    '../../../stores/index': { appStore: { watch(key, fn) { watcher = fn; fn({ id: user }); return () => { watcher = null; }; } } },
    '../../actions/activity': { getActivityList: (query) => new Promise((resolve, reject) => pending.push({ query, resolve, reject })) },
    globals: { wx: { getWindowInfo: () => ({ statusBarHeight: 20 }), getMenuButtonBoundingClientRect: () => ({}), stopPullDownRefresh: () => { stopped++; } },
      setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id) => timers.delete(id) },
  });
  pageLoad('subpkg_activity/pages/list/list.ts');
  const page = { ...definition, data: structuredClone(definition.data), setData(patch) { Object.assign(this.data, patch); } };
  return { page, pending, timers, get stopped() { return stopped; }, switchUser(id) { user = id; watcher?.({ id }); } };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const item = (id) => ({ id });
const h = harness(); const p = h.page;
p.onLoad(); p.onShow();
assert.equal(h.pending[0].query.audienceFilter, 'ALL');
assert.equal(h.pending[0].query.lifecycleStatus, 'ACTIVE');
h.pending.shift().resolve({ list: [item('a')], nextCursor: 'c1' }); await tick();
p.onReachBottom();
assert.equal(h.pending[0].query.lastId, 'c1');
h.pending.shift().resolve({ list: [item('a'), item('b')], nextCursor: 'c2' }); await tick();
assert.deepEqual(Array.from(p.data.list, (i) => i.id), ['a', 'b']);
p.onReachBottom(); h.pending.shift().reject(new Error('offline')); await tick();
assert.equal(p.data.nextCursor, 'c2'); assert.ok(p.data.moreError);
p.onRetryMore(); assert.equal(h.pending[0].query.lastId, 'c2');
h.pending.shift().reject({ problemType: '/problems/invalid-cursor' }); await tick();
assert.equal(p.data.invalidCursor, true);
p.onRetryMore(); assert.equal(h.pending[0].query.lastId, undefined);
h.pending.shift().reject(new Error('offline')); await tick();
assert.equal(p.data.list.length, 2); assert.ok(p.data.refreshError); assert.ok(h.stopped);
p.onSearchConfirm({ detail: { value: 'find' } });
const stale = h.pending.shift();
p.onScopeChange({ detail: { value: 2 } });
const latest = h.pending.shift();
assert.equal(latest.query.keyword, 'find'); assert.equal(latest.query.departmentId, 'information');
assert.equal(latest.query.lastId, undefined);
latest.resolve({ list: [item('new')], nextCursor: 'n' }); await tick();
stale.resolve({ list: [item('old')], nextCursor: 'old' }); await tick();
assert.equal(p.data.list[0].id, 'new');
p.onCategoryChange({ detail: { value: 2 } });
assert.equal(h.pending[0].query.category, 'COMPETITION');
h.pending.shift().resolve({ list: [], nextCursor: '' }); await tick();
p.onPullDownRefresh();
assert.equal(h.pending[0].query.departmentId, 'information');
assert.equal(h.pending[0].query.keyword, 'find');
h.pending.shift().resolve({ list: [], nextCursor: '' }); await tick();
assert.equal(p.data.loaded, true); assert.equal(p.data.list.length, 0);
p.onSearch({ detail: { value: 'delayed' } });
assert.equal(h.timers.size, 1);
p.onPullDownRefresh(); assert.equal(h.timers.size, 0);
const previousAccount = h.pending.shift();
h.switchUser('u2'); assert.equal(p.data.list.length, 0);
previousAccount.resolve({ list: [item('private')], nextCursor: '' }); await tick();
assert.equal(p.data.list.length, 0);
const newAccount = h.pending.shift(); newAccount.resolve({ list: [item('u2')], nextCursor: '' }); await tick();
p.onActivityChanged(); p.onHide(); p.onShow();
assert.equal(h.pending.length, 1);
p.onUnload(); h.pending.shift().resolve({ list: [item('after-unload')], nextCursor: '' }); await tick();
assert.equal(p.data.list[0].id, 'u2');
assert.equal(JSON.parse(fs.readFileSync('subpkg_activity/pages/list/list.json')).enablePullDownRefresh, true);
console.log('Activity discovery regression passed: query, paging, errors, refresh, races, session, scope and community mapping.');

let registrationOptions;
let emitted = 0;
const registrationLoad = loader({
  '../../../actions/current-user': { getCurrentIdentity: () => ({ id: 'u1' }), watchCurrentIdentity: () => () => {} },
  '../../../utils/definePage': { __esModule: true, default: (options) => { registrationOptions = options; } },
  '../../actions/registration': { submitRegistration: async () => {}, cancelRegistration: async () => {} },
  '../../services/registration': { prepareAnswers: () => [] },
  '../../../services/business-subscriptions': { createBusinessSubscription: () => ({ prepare: async () => {}, request: async () => true, dispose() {} }) },
  '../../../utils/wx-promise': { wxShowModal: async () => ({ confirm: true }) },
  '../../../utils/error': { isHttpError: () => false },
});
registrationLoad('subpkg_activity/pages/registration/registration.ts');
const registration = { ...registrationOptions, data: { ...registrationOptions.data, loading: false, canSubmit: true, isDirty: true, info: {}, answers: {} },
  setData(patch) { Object.assign(this.data, patch); }, isAlive: () => true, reload: async () => {},
  getOpenerEventChannel: () => ({ emit: (name) => { assert.equal(name, 'activityChanged'); emitted++; } }),
};
await registration.onSubmit();
assert.equal(emitted, 1, 'successful submit invalidates the opener');
registration.data.mine = { status: 'SUBMITTED', canCancel: true };
await registration.onCancel();
assert.equal(emitted, 2, 'successful cancel invalidates the opener');
registration.data.mine = null;
registration.getOpenerEventChannel = () => ({});
await registration.onSubmit();
assert.equal(registration.data.error, '', 'direct entry without opener emit is supported');
const cardTemplate = fs.readFileSync('components/activity-card/index.wxml', 'utf8');
assert.equal((cardTemplate.match(/参与范围：/g) ?? []).length, 2, 'both cover and flat cards show the scope');
console.log('Activity registration success invalidation and card variants passed.');

let filterOptions;
loader({ globals: { wx: { hideKeyboard: () => Promise.resolve() }, Component: (options) => { filterOptions = options; } } })('components/filter-bar/index.ts');
const filterEvents = [];
const filter = {
  ...filterOptions.methods,
  properties: { filters: p.data.filters, tone: 'blue' },
  data: structuredClone(filterOptions.data),
  setData(patch) { Object.assign(this.data, patch); },
  triggerEvent(name, detail) { filterEvents.push({ name, detail }); },
};
const toggle = (key) => filter.onToggle({ currentTarget: { dataset: { key } } });
const select = (index) => filter.onSelect({ currentTarget: { dataset: { index } } });
toggle('scope');
assert.equal(filter.data.openKey, 'scope');
assert.equal(filter.data.panelOptions.length, 7, 'fixed complete department choices are directly available');
select(2);
assert.equal(filter.data.openKey, '', 'selection closes the dropdown');
assert.equal(filterEvents[0].name, 'scopechange');
assert.equal(filterEvents[0].detail.value, 2);
toggle('category');
assert.equal(filter.data.panelOptions.length, 7);
toggle('status');
assert.equal(filter.data.openKey, 'status', 'opening another group replaces the panel');
select(2);
assert.equal(filterEvents[1].name, 'statuschange');
assert.equal(filterEvents[1].detail.value, 2);
assert.equal(filterEvents[1].detail.id, 'ENDED');
toggle('category'); select(0);
assert.equal(filterEvents.length, 2, 'choosing the existing value closes without another request');
toggle('scope'); toggle('scope'); assert.equal(filter.data.openKey, '');
toggle('category'); filterOptions.pageLifetimes.hide.call(filter);
assert.equal(filter.data.openKey, '', 'hidden page dismisses its popup');
const listTemplate = fs.readFileSync('subpkg_activity/pages/list/list.wxml', 'utf8');
assert.doesNotMatch(listTemplate, /<picker|class="status-scroll"/);
assert.match(listTemplate, /bind:scopechange="onScopeChange"/);
const filterRegistration = JSON.parse(fs.readFileSync('subpkg_activity/pages/list/list.json')).usingComponents['filter-bar'];
assert.equal(filterRegistration, '/components/filter-bar/index');
for (const extension of ['.ts', '.json', '.wxml', '.wxss']) {
  assert.ok(fs.existsSync(path.resolve(filterRegistration.slice(1) + extension)), `registered component source exists: ${extension}`);
}
console.log('Activity dropdown selection, mutual exclusion, dismissal, current-value tests passed.');
