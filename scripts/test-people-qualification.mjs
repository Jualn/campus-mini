// Contract-shaped HTTP and native Page/Component simulations; no backend/device claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const mocks = new Map(), cache = new Map(), requests = [], logs = [], watchers = [], timers = new Map();
let definition, userId = 'self', now = Date.parse('2026-10-24T01:00:00Z'), timerId = 0;
let respond = () => ({ statusCode: 200, data: {} });
const wx = { request(options) {
  requests.push(options);
  Promise.resolve().then(() => respond(options)).then((response) => {
    if (response instanceof Error) options.fail(response);
    else options.success({ header: {}, ...response });
  });
  return { abort() {} };
} };
class Clock extends Date { static now() { return now; } }
const absolute = (file) => path.resolve(root, file);
function load(file) {
  file = absolute(file);
  if (mocks.has(file)) return mocks.get(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: false, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, {
    exports, wx, Date: Clock, Page: (value) => { definition = value; },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    require: (id) => load(path.resolve(path.dirname(file), id + '.ts')),
  }, { filename: file });
  return exports;
}
const mock = (file, value) => mocks.set(absolute(file), value);
const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise((fn) => { resolve = fn; }); return { promise, resolve }; };
function instance(def = definition) {
  return { ...def, ...def.methods, data: plain(def.data), properties: { userId: 'mentor' },
    setData(patch) { Object.assign(this.data, patch); },
  };
}
mock('actions/current-user.ts', {
  getCurrentIdentity: () => ({ id: userId }),
  watchCurrentIdentity: (fn) => { watchers.push(fn); return () => { const index = watchers.indexOf(fn); if (index >= 0) watchers.splice(index, 1); }; },
});
mock('config/index.ts', { default: { baseURL: 'https://test.invalid', timeout: 500 } });
mock('utils/logger.ts', { createLogger: () => ({ info: (...args) => logs.push(args), warn() {}, error() {} }) });
mock('utils/auth-transport.ts', { getAuthToken: async () => 'mini-test-token' });
mock('utils/wx-promise.ts', {}); mock('utils/transfer.ts', {}); mock('utils/stream.ts', {});
mock('utils/defineComponent.ts', { default: () => (value) => { definition = value; } });
const { HttpError } = load('utils/error.ts');
const api = load('subpkg_user/services/people-qualification.ts');
const mentorApi = load('services/mentor-certification.ts');
const operation = load('subpkg_user/services/party-identity-operation.ts');
const stamp = () => new Date(now).toISOString();
const receipt = () => ({ applicationId: 'application', applicantUserId: userId, status: 'APPROVED', submittedAt: stamp(), decidedAt: stamp(), version: 'v1', verificationMethod: 'ROSTER_EXACT_MATCH', personId: 'person', bindingId: 'binding' });
const page = () => ({ items: [receipt()], page: 1, pageSize: 20, totalItems: 1, evaluatedAt: stamp() });
const profile = () => ({ personId: 'person', bindingId: 'binding', qualificationId: 'qualification', userId: 'mentor', realName: '认证姓名', position: '导师职务', affiliation: '所属单位', certified: true, evaluatedAt: stamp(), validUntil: new Date(now + 1000).toISOString() });
const identity = () => ({ userId, personId: 'person', bindingId: 'binding', identityVerification: 'UNKNOWN', effectiveStatus: 'UNKNOWN', evaluatedAt: stamp() });
const activeIdentity = () => ({ userId, personId: 'person', bindingId: 'binding', identityVerification: 'VERIFIED', presence: 'RECORDED', effectiveStatus: 'ACTIVE', evaluatedAt: stamp(), verifiedAt: stamp(), verificationMethod: 'ADMIN_MANUAL', currentRecord: { recordId: 'record', identityKind: 'PARTY_DEVELOPMENT', stageId: 'PARTY_ACTIVIST', status: 'ACTIVE', validFrom: new Date(now - 1000).toISOString(), validUntil: new Date(now + 1000).toISOString() } });
let currentBinding = { userId, state: 'BOUND', personId: 'person', bindingId: 'binding', personStatus: 'ACTIVE', version: 'v1' };
const readData = (request) => request.url.endsWith('/person-binding') ? { ...currentBinding, userId, evaluatedAt: stamp() } : request.url.endsWith('/party-identity') ? identity() : page();
const withBinding = (handler) => (request) => request.url.endsWith('/person-binding') ? { statusCode: 200, data: readData(request) } : handler(request);
const body = { realName: '  测试姓名  ', studentNumber: '  001aB  ' };
assert.deepEqual(plain(api.normalizePartyApplication({ ...body, organizationId: 'ignored', personId: 'ignored' })), { realName: '测试姓名', studentNumber: '001aB' });
respond = () => ({ statusCode: 201, data: receipt() });
await api.createMyPartyIdentityApplication(body, 'key-original');
assert.equal(requests.at(-1).url, 'https://test.invalid/v1/users/me/party-identity-applications');
assert.equal(requests.at(-1).header.Authorization, 'Bearer mini-test-token');
assert.equal(requests.at(-1).header['Idempotency-Key'], 'key-original');
assert.equal(requests.at(-1).data.studentNumber, '001aB');
assert.deepEqual(plain(requests.at(-1).data), { realName: '测试姓名', studentNumber: '001aB' });
assert.equal(JSON.stringify(logs).includes('测试姓名'), false);
assert.equal(JSON.stringify(logs).includes('001aB'), false);
for (const type of ['/problems/roster-state-conflict', '/problems/people-operation-in-progress', '/problems/people-idempotency-conflict']) {
  respond = () => ({ statusCode: 409, data: { type, detail: 'PRIVATE OTHER PERSON' } });
  await assert.rejects(api.createMyPartyIdentityApplication(body, 'key'), (error) => {
    assert.equal(error.problemType, type); assert.equal(api.qualificationError(error).includes('PRIVATE'), false); return true;
  });
}
for (const code of [400, 401, 403, 404, 429, 503]) {
  respond = () => ({ statusCode: code, data: { type: '/problems/people-source-unavailable', detail: 'PRIVATE' } });
  await assert.rejects(api.createMyPartyIdentityApplication(body, 'key'), (error) => !api.qualificationError(error).includes('PRIVATE'));
}
respond = () => ({ statusCode: 200, data: page() });
assert.equal((await api.listMyPartyIdentityApplications()).items.length, 1);
assert.deepEqual(plain(requests.at(-1).data), { page: 1, pageSize: 20 });
respond = () => ({ statusCode: 200, data: { ...page(), items: [{ ...receipt(), applicantUserId: 'other' }] } });
await assert.rejects(api.listMyPartyIdentityApplications());

// Unknown mutation: retain original request/key, read receipts first, never auto-create a new operation.
respond = () => new Error('timeout');
await assert.rejects(operation.submitPartyApplication(body));
const original = requests.at(-1), originalKey = original.header['Idempotency-Key'];
assert.ok(operation.pendingPartyApplication());
respond = (request) => ({ statusCode: request.method === 'GET' ? 200 : 201, data: request.method === 'GET' ? readData(request) : receipt() });
const before = requests.length;
await operation.submitPartyApplication({ ...body, studentNumber: 'changed' });
assert.equal(requests[before].method, 'GET');
assert.equal(requests.filter(r => r.method === 'POST').at(-1).header['Idempotency-Key'], originalKey);
assert.equal(requests.filter(r => r.method === 'POST').at(-1).data.studentNumber, '001aB');
assert.equal(operation.pendingPartyApplication(), null);
respond = () => ({ statusCode: 409, data: { type: '/problems/roster-state-conflict' } });
await assert.rejects(operation.submitPartyApplication(body)); assert.equal(operation.pendingPartyApplication(), null);
respond = () => ({ statusCode: 429, data: {} });
await assert.rejects(operation.submitPartyApplication(body));
const rateLimitKey = operation.pendingPartyApplication().key;
respond = (request) => ({ statusCode: request.method === 'POST' ? 201 : 200, data: request.method === 'POST' ? receipt() : readData(request) });
await operation.submitPartyApplication(body);
assert.equal(requests.filter(r => r.method === 'POST').at(-1).header['Idempotency-Key'], rateLimitKey);
respond = () => ({ statusCode: 409, data: { type: '/problems/people-operation-in-progress' } });
await assert.rejects(operation.submitPartyApplication(body)); assert.ok(operation.pendingPartyApplication());
const unknownKey = operation.pendingPartyApplication().key;
respond = () => ({ statusCode: 503, data: { type: '/problems/people-source-unavailable' } });
await assert.rejects(operation.submitPartyApplication(body));
assert.equal(operation.pendingPartyApplication().key, unknownKey);
for (const code of [401, 403, 409]) {
  respond = () => ({ statusCode: code, data: { type: '/problems/forbidden' } });
  await assert.rejects(operation.submitPartyApplication(body));
  assert.equal(operation.pendingPartyApplication().key, unknownKey, 'receipt read failure cannot resolve the original mutation');
}
userId = 'second'; [...watchers].forEach((fn) => fn()); assert.equal(operation.pendingPartyApplication(), null);
userId = 'self'; [...watchers].forEach((fn) => fn());

// Private current identity: preserve every Contract status and the actual current source.
const states = [identity(), { ...identity(), identityVerification: 'DISPUTED', effectiveStatus: 'DISPUTED' }, { ...activeIdentity(), presence: 'NONE', effectiveStatus: 'NONE' }, activeIdentity(), ...['INACTIVE', 'REVOKED'].map((status) => ({ ...activeIdentity(), effectiveStatus: status, currentRecord: { ...activeIdentity().currentRecord, status } })), { ...activeIdentity(), effectiveStatus: 'EXPIRED', currentRecord: { ...activeIdentity().currentRecord, validUntil: stamp() } }];
delete states[2].currentRecord;
for (const state of states) {
  respond = withBinding(() => ({ statusCode: 200, data: state }));
  assert.equal((await api.getMyPartyIdentity()).effectiveStatus, state.effectiveStatus);
  assert.ok(requests.some(r => r.url.endsWith('/party-identity')));
  assert.equal(requests.at(-1).data, undefined);
}
respond = withBinding(() => ({ statusCode: 200, data: { ...activeIdentity(), verificationMethod: 'FUTURE_METHOD' } }));
assert.equal((await api.getMyPartyIdentity()).verificationMethod, 'FUTURE_METHOD');
for (const invalid of [{ ...identity(), currentRecord: activeIdentity().currentRecord }, { ...identity(), userId: 'other' }, { ...activeIdentity(), effectiveStatus: 'NONE' }, { ...activeIdentity(), verifiedAt: null }, { ...activeIdentity(), currentRecord: { ...activeIdentity().currentRecord, validUntil: stamp() } }]) {
  respond = withBinding(() => ({ statusCode: 200, data: invalid })); await assert.rejects(api.getMyPartyIdentity());
}

// Validate the current public projection, not roles, historical answers or stored badges.
respond = () => ({ statusCode: 200, data: profile() });
assert.equal((await mentorApi.getCertifiedMentorProfile('mentor')).certified, true);
for (const patch of [{ certified: false }, { position: '' }, { affiliation: '' }, { realName: '' }, { userId: 'other' }, { validUntil: null }]) {
  respond = () => ({ statusCode: 200, data: { ...profile(), ...patch } });
  await assert.rejects(mentorApi.getCertifiedMentorProfile('mentor'));
}
load('components/mentor-certification/index.ts');
const cardDef = definition, card = instance(cardDef);
respond = () => ({ statusCode: 200, data: profile() });
cardDef.lifetimes.attached.call(card); await tick();
assert.equal(card.data.state, 'valid'); assert.ok(card.data.profile); assert.equal(timers.size, 1);
cardDef.pageLifetimes.hide.call(card); assert.equal(card.data.profile, null); assert.equal(timers.size, 0);
respond = () => ({ statusCode: 503, data: { type: '/problems/people-source-unavailable' } });
cardDef.pageLifetimes.show.call(card); await tick(); assert.equal(card.data.state, 'unavailable'); assert.equal(card.data.profile, null);
respond = () => ({ statusCode: 404, data: { type: '/problems/not-found' } });
await card.refresh(); assert.equal(card.data.state, 'inactive');
respond = () => ({ statusCode: 200, data: profile() });
await card.refresh(); now += 1000;
const expiry = [...timers.values()][0]; timers.clear(); expiry.fn();
assert.equal(card.data.profile, null); await tick(); assert.equal(card.data.state, 'valid');
const old = deferred(); respond = () => old.promise;
const stale = card.refresh(); await tick();
respond = () => ({ statusCode: 404, data: {} }); await card.refresh();
old.resolve({ statusCode: 200, data: profile() }); await stale;
assert.equal(card.data.state, 'inactive'); assert.equal(card.data.profile, null);
respond = () => ({ statusCode: 200, data: { ...profile(), validUntil: new Date(now - 1).toISOString() } });
await card.refresh(); assert.equal(card.data.state, 'expired'); assert.equal(card.data.profile, null);
cardDef.properties.refreshRevision.observer.call(card);
assert.equal(card.data.profile, null);
await tick();
cardDef.lifetimes.detached.call(card); assert.equal(timers.size, 0);

load('components/operator-badge/index.ts');
const badgeDefinition = definition;
const badge = instance(badgeDefinition);
badge.properties = { kind: 'mentor', mentor: null, historical: true };
badge.open();
assert.equal(badge.data.opened, false);
badge.properties.mentor = profile();
badge.open();
assert.equal(badge.data.opened, true);
badgeDefinition.observers['kind, mentor, historical'].call(badge);
assert.equal(badge.data.opened, false);
badge.open();
badgeDefinition.pageLifetimes.hide.call(badge);
assert.equal(badge.data.opened, false);

// Expiry follows the server-evaluated boundary even if the local clock is slow.
const skewed = instance(cardDef);
respond = () => ({ statusCode: 200, data: { ...profile(), evaluatedAt: new Date(now + 10000).toISOString(), validUntil: new Date(now + 10000).toISOString() } });
cardDef.lifetimes.attached.call(skewed); await tick();
assert.equal(skewed.data.state, 'expired'); assert.equal(skewed.data.profile, null);
cardDef.lifetimes.detached.call(skewed);

// Actual page handlers with Contract-shaped responses, including reread failure and drafts.
load('subpkg_user/pages/party-identity/index.ts');
const pageDef = definition, screen = instance(pageDef);
pageDef.onLoad.call(screen); screen._active = true;
respond = (request) => ({ statusCode: 200, data: readData(request) }); await screen.refresh();
assert.equal(screen.data.identity.effectiveStatus, 'UNKNOWN');
screen.setData({ realName: '测试姓名', studentNumber: '001' });
respond = (request) => ({ statusCode: request.method === 'POST' ? 201 : 503, data: request.method === 'POST' ? receipt() : { type: '/problems/people-source-unavailable' } });
await screen.submit();
assert.match(screen.data.message, /申请已成功/); assert.ok(screen.data.error); assert.equal(screen.data.items.length, 0);
assert.equal(screen.data.studentNumber, '001', 'retain original input until successful reconciliation');
respond = (request) => ({ statusCode: 200, data: readData(request) });
await screen.submit(); assert.equal(operation.pendingPartyApplication(), null);
screen.setData({ realName: '测试姓名', studentNumber: '001' });
respond = () => new Error('network'); await screen.submit();
assert.equal(screen.data.studentNumber, '001'); assert.equal(screen.data.unresolved, true);
screen.onInput({ currentTarget: { dataset: { field: 'studentNumber' } }, detail: { value: 'changed' } });
assert.equal(screen.data.studentNumber, '001');
screen.onUnload();
const reopened = instance(pageDef); reopened.onLoad();
respond = (request) => ({ statusCode: 200, data: readData(request) }); reopened.onShow(); await tick();
assert.equal(reopened.data.studentNumber, '001'); assert.equal(reopened.data.unresolved, true);
userId = 'second'; [...watchers].forEach((fn) => fn()); await tick();
assert.equal(reopened.data.studentNumber, ''); assert.equal(reopened.data.items.length, 1);
assert.equal(reopened.data.items[0].applicantUserId, 'second');
reopened.onUnload();

// After successful POST, read current Person rather than painting the receipt as identity.
userId = 'self'; [...watchers].forEach((fn) => fn());
const currentScreen = instance(pageDef); currentScreen.onLoad(); currentScreen._active = true;
respond = (request) => ({ statusCode: 200, data: readData(request) }); await currentScreen.refresh();
currentScreen.setData({ realName: '测试姓名', studentNumber: '001' });
const beforeSuccess = requests.length;
respond = (request) => ({ statusCode: request.method === 'POST' ? 201 : 200, data: request.method === 'POST' ? receipt() : request.url.endsWith('/party-identity') ? activeIdentity() : readData(request) });
await currentScreen.submit();
assert.ok(requests.slice(beforeSuccess).some((request) => request.method === 'GET' && request.url.endsWith('/party-identity')));
assert.equal(currentScreen.data.identity.effectiveStatus, 'ACTIVE');
assert.ok(currentScreen.data.mentorRevision > 0);
assert.equal(currentScreen.data.stageLabel, '入党积极分子');
assert.equal(currentScreen.data.methodLabel, '人工核实', 'new roster receipt cannot replace current manual verification');
now += 1000;
respond = () => ({ statusCode: 503, data: { type: '/problems/people-source-unavailable' } });
const currentExpiry = [...timers.values()][0]; timers.clear(); currentExpiry.fn();
assert.equal(currentScreen.data.identity, null); await tick(); assert.ok(currentScreen.data.identityError);
assert.equal(currentScreen.data.identityLabel, '');
respond = (request) => ({ statusCode: 200, data: request.url.endsWith('/party-identity') ? { ...activeIdentity(), verificationMethod: 'NEW_METHOD' } : readData(request) });
await currentScreen.refreshIdentity(); assert.equal(currentScreen.data.methodLabel, '其他核实方式');
currentScreen.onHide(); assert.equal(currentScreen.data.identity, null); assert.equal(timers.size, 0);
// Do not spin when an already-stale ACTIVE response arrives at its local expiry.
const staleActive = activeIdentity();
staleActive.currentRecord.validUntil = new Date(now - 1).toISOString();
staleActive.currentRecord.validFrom = new Date(now - 2000).toISOString();
staleActive.evaluatedAt = new Date(now - 1000).toISOString();
respond = withBinding(() => ({ statusCode: 200, data: staleActive }));
await currentScreen.refreshIdentity();
assert.equal(currentScreen.data.identity, null); assert.ok(currentScreen.data.identityError); assert.equal(timers.size, 0);

// An older successful read may not replace a newer UNKNOWN/disputed projection.
const olderIdentity = deferred(); respond = () => olderIdentity.promise;
const oldRead = currentScreen.refreshIdentity(); await tick();
respond = withBinding(() => ({ statusCode: 200, data: identity() })); await currentScreen.refreshIdentity();
olderIdentity.resolve({ statusCode: 200, data: activeIdentity() }); await oldRead;
assert.equal(currentScreen.data.identity.effectiveStatus, 'UNKNOWN'); assert.equal(currentScreen.data.stageLabel, '');

// A historical successful replay cannot restore an ended binding or grant current identity.
currentScreen._active = true;
currentBinding = { userId, state: 'UNBOUND', version: 'v2' };
respond = (request) => ({ statusCode: request.method === 'POST' ? 201 : 200,
  data: request.method === 'POST' ? receipt() : request.url.endsWith('/party-identity')
    ? { userId, effectiveStatus: 'UNBOUND', evaluatedAt: stamp() } : readData(request) });
currentScreen.setData({ realName: '测试姓名', studentNumber: '001' });
await currentScreen.submit(); await tick();
assert.equal(currentScreen.data.identity.effectiveStatus, 'UNBOUND');
assert.equal(currentScreen.data.stageLabel, '');
assert.equal(currentScreen.data.items[0].status, 'APPROVED');
const bindingApi = load('services/person-binding.ts');
await assert.rejects(bindingApi.requireCurrentPerson());

// Restored active Person works without an association-method gate; changing it clears old UI immediately.
currentBinding = { userId, state: 'BOUND', personId: 'person', bindingId: 'new-binding', personStatus: 'ACTIVE', version: 'v3' };
const nextIdentity = { ...activeIdentity(), bindingId: 'new-binding' };
respond = (request) => ({ statusCode: 200, data: request.url.endsWith('/party-identity') ? nextIdentity : readData(request) });
assert.equal((await bindingApi.requireCurrentPerson()).bindingId, 'new-binding');
assert.equal(currentScreen.data.identity, null);
await tick(); assert.equal(currentScreen.data.identity.bindingId, 'new-binding');
currentScreen.onUnload();

// Post detail refreshes authoritative permissions when returning from a profile.
mock('behaviors/useSharePoster.ts', { useSharePoster: () => ({}) });
mock('subpkg_community/behaviors/useAsyncLoad.ts', { useAsyncLoad: () => ({}) });
mock('utils/share_poster/postPoster.ts', {});
mock('utils/notify.ts', {});
let detailRequest = deferred();
mock('actions/post.ts', { getPostDetail: () => detailRequest.promise });
load('subpkg_community/pages/detail/detail.ts');
const detail = instance();
detail._asyncLoadBegin = detail._asyncLoadSuccess = detail._asyncLoadFail = detail._preparePostShare = detail._scheduleViewReport = () => {};
detail.data.targetId = 'question';
detail._loadPost('question');
const hiddenRequest = detailRequest;
detail.onHide();
hiddenRequest.resolve({ id: 'question', postType: 'MENTOR_QA', commentPermission: { state: 'ALLOWED', reason: 'NONE' } });
await tick(); assert.equal(detail.data.post.id, undefined);
detailRequest = deferred(); detail.onShow();
detailRequest.resolve({ id: 'question', postType: 'MENTOR_QA', commentPermission: { state: 'DENIED', reason: 'MENTOR_REQUIRED' } });
await tick(); assert.equal(detail.data.post.commentPermission.state, 'DENIED');
detail.onHide(); assert.equal(detail.data.post.commentPermission, undefined);

assert.equal(requests.some(r => r.url.endsWith('/party-identity-organizations')), false);
assert.match(api.qualificationError(new HttpError(409, 'PRIVATE OWNER')), /核对姓名、学号/);
assert.doesNotMatch(fs.readFileSync(absolute('subpkg_user/pages/party-identity/index.wxml'), 'utf8'), /organizations|organizationId|低强度/);

// Guard the additive operation names and required fields against the authoritative local Contract.
const contract = JSON.parse(fs.readFileSync(path.join(root, '../contracts/api/paths/people-qualification.yaml'), 'utf8'));
assert.equal(contract['/v1/users/me/party-identity-applications'].post.operationId, 'createMyPartyIdentityApplication');
assert.equal(contract['/v1/users/me/party-identity-applications'].get.operationId, 'listMyPartyIdentityApplications');
assert.equal(contract['/v1/mentors/{userId}'].get.operationId, 'getCertifiedMentorProfile');
assert.equal(contract['/v1/users/me/party-identity'].get.operationId, 'getMyPartyIdentity');
const schema = JSON.parse(fs.readFileSync(path.join(root, '../contracts/api/schemas/people-qualification.yaml'), 'utf8'));
assert.deepEqual([...schema.PartyIdentityApplicationCreate.required].sort(), Object.keys(plain(requests.find((r) => r.method === 'POST').data)).sort());
for (const field of schema.CertifiedMentorProfile.required) assert.ok(field in profile());
for (const field of schema.BoundPartyIdentity.required) assert.ok(field in identity());
for (const field of schema.PartyIdentityApplication.required) assert.ok(field in receipt());
console.log('PASS people qualification: current canonical operations/Mini Token/privacy; name and student number only; all current identity statuses/source/expiry/reread; exact-match/idempotency/session/drafts; mentor validity and QA return permissions. Mock HTTP and VM only.');
