import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const contractRoot = path.resolve(root, '../contracts');
const manifest = JSON.parse(fs.readFileSync(path.join(contractRoot, 'docs/coordination/points-v1/handoff.json'), 'utf8'));
assert.equal(manifest.revision, 'points-v1-r6', 'Contract revision changed: review adapter before testing');
for (const f of manifest.files) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(contractRoot, f.path))).digest('hex'), f.sha256, 'Contract manifest drift: ' + f.path);
const canonicalPaths = JSON.parse(fs.readFileSync(path.join(contractRoot, 'api/paths/points.yaml'), 'utf8'));
const expectedOperations = ['getMyPointsEligibility', 'createPointApplication', 'listMyPointApplications', 'getMyPointApplication', 'getMyPointSummary', 'listMyPointLedger', 'createPointFileUploadCredentials', 'registerPointFile', 'getMyPointFile', 'getMyPointFileAccess', 'listMyPointAcceptingOrganizations', 'closeMyPointApplication'];
assert.deepEqual(Object.entries(canonicalPaths).filter(([p]) => p.startsWith('/v1/users/me/points')).flatMap(([, ops]) => Object.values(ops).map(o => o.operationId).filter(Boolean)).sort(), expectedOperations.sort());
const requests = [], uploads = [], watchers = [], logs = [], authCalls = [];
let identity = { id: 'user-1' }, recoveries = 0;
const clone = v => JSON.parse(JSON.stringify(v));
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const mocks = new Map([
  ['config/index.ts', { baseURL: 'https://test.invalid', timeout: 5000 }],
  ['utils/logger.ts', { createLogger: () => Object.fromEntries(['info', 'warn', 'error'].map(k => [k, (...args) => logs.push(args)])) }],
  ['utils/auth-transport.ts', { getAuthToken: async (...args) => { authCalls.push(args); return 'test-token'; }, recoverAuthToken: async () => { recoveries++; } }],
  ['utils/wx-promise.ts', { wxShowLoading() { /* no UI in adapter test */ }, wxHideLoading() { /* no UI in adapter test */ } }],
  ['utils/transfer.ts', {}], ['utils/stream.ts', {}],
  ['services/person-binding.ts', { requireCurrentPerson: async () => ({ personId: 'person-1', bindingId: 'binding-1' }), assertCurrentPerson: async () => {}, personBindingEpoch: () => 0 }],
  ['actions/current-user.ts', { getCurrentIdentity: () => identity, watchCurrentIdentity: fn => watchers.push(fn) }],
  ['miniprogram_npm/cos-wx-sdk-v5/index.js', class { uploadFile(opts, cb) { uploads.push({ opts, cb, method: 'default' }); } putObject(opts, cb) { uploads.push({ opts, cb, method: 'PUT' }); } }],
]);
const cache = new Map();
function load(relative) {
  relative = relative.replaceAll('\\', '/');
  if (mocks.has(relative)) return mocks.get(relative);
  if (cache.has(relative)) return cache.get(relative);
  const filename = path.join(root, relative), exports = {};
  cache.set(relative, exports);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => load(path.relative(root, path.resolve(path.dirname(filename), /\.js$/.test(name) ? name : name + '.ts'))), wx: { request: opts => requests.push(opts), getFileSystemManager: () => ({ readFile: opts => opts.success({ data: new ArrayBuffer(100) }) }) }, Date, Math, Error, Set, Map }, { filename });
  return exports;
}
const api = load('subpkg_user/services/points.ts');
const operations = load('subpkg_user/services/points-operation.ts');
const state = load('subpkg_user/services/points-state.ts');
const { HttpError, AuthError, NetworkError } = load('utils/error.ts');
const body = { title: '志愿服务', description: '服务证明', fileIds: ['file-1'], acceptingOrganizationId: 'org-a' };
const application = { ...body, personId: 'person-1', submittedBindingId: 'binding-1', personName: '申请人', acceptingOrganizationName: '原组织', accounting: { status: 'NONE', effectivePoints: 0 }, applicationId: 'app-1', applicantUserId: 'user-1', createdAt: '2026-10-18T01:00:00Z', status: 'PENDING', acceptanceBasis: { status: 'BOUND', organizationId: 'org-a', membershipId: 'cycle-a' } };
const approved = { ...application, accounting: { status: 'EFFECTIVE', effectivePoints: 10, effectiveLedgerId: 'ledger-1' }, status: 'APPROVED', reviewerUserId: 'reviewer-1', reviewedAt: '2026-10-18T02:00:00Z', reviewNote: '核对通过', awardedPoints: 10, grantLedgerId: 'ledger-1' };
const declaration = { fileName: '证明.pdf', kind: 'PDF', contentType: 'application/pdf', sizeBytes: 100 };
const file = { ...declaration, fileId: 'file-1', ownerUserId: 'user-1', createdAt: '2026-10-18T01:00:00Z', unboundExpiresAt: '2099-10-19T01:00:00Z' };
const expiry = Math.floor(Date.now() / 1000) + 600;
const credentials = { uploadId: 'upload-1', uploadExpiresAt: new Date(expiry * 1000).toISOString(), bucket: 'private-test', region: 'test-region', objectKeys: ['points/temp/object'], tmpSecretId: 'test-sts-id', tmpSecretKey: 'test-sts-secret', sessionToken: 'test-sts-token', expiredTime: expiry };
function take(method, suffix) {
  const r = requests.shift(); assert.ok(r, `Missing ${method} ${suffix}`);
  assert.equal(r.method, method); assert.equal(r.url, 'https://test.invalid/v1/users/me/points' + suffix);
  assert.equal(r.header.Authorization, 'Bearer test-token'); return r;
}
function respond(r, data, statusCode = 200, header = {}) { r.success({ statusCode, data: clone(data), header }); }
async function read(call, suffix, data) { const p = call(); await flush(); const r = take('GET', suffix); respond(r, data); return p; }
async function badRead(call, suffix, data) { const p = call(); await flush(); const r = take('GET', suffix); respond(r, data); await assert.rejects(p, e => e instanceof HttpError && e.statusCode === 502); }
const page = (items, p = 1, pageSize = 20, totalItems = items.length) => ({ items, page: p, pageSize, totalItems });

assert.equal((await read(api.getMyPointsEligibility, '/eligibility', { eligible: false, reason: 'BUSINESS_STAGE_INELIGIBLE', evaluatedAt: application.createdAt })).eligible, false);
await badRead(api.getMyPointsEligibility, '/eligibility', { eligible: true, reason: 'BUSINESS_STAGE_INELIGIBLE', evaluatedAt: application.createdAt });
// Canonical eligibility reasons remain server-owned.
for (const reason of ['ACCOUNT_UNAVAILABLE', 'NO_ACCEPTING_ORGANIZATION']) {
  assert.equal((await read(api.getMyPointsEligibility, '/eligibility', { eligible: false, reason, evaluatedAt: application.createdAt })).reason, reason);
}
const organizations = { evaluatedAt: application.createdAt, items: [{ organizationId: 'org-a', name: '组织A', membershipId: 'cycle-a' }] };
assert.equal((await read(api.listMyPointAcceptingOrganizations, '/accepting-organizations', organizations)).items.length, 1);
for (const items of [[organizations.items[0], organizations.items[0]], [{ ...organizations.items[0], membershipId: '' }], null]) {
  await badRead(api.listMyPointAcceptingOrganizations, '/accepting-organizations', { ...organizations, items });
}
const qualified = { eligible: true, evaluatedAt: application.createdAt };
assert.equal(state.pointSubmissionView(qualified, organizations).selectedId, 'org-a');
const multiple = { ...organizations, items: [...organizations.items, { organizationId: 'org-b', name: '组织B', membershipId: 'cycle-b' }] };
assert.equal(state.pointSubmissionView(qualified, multiple).selectedId, '');
assert.equal(state.pointSubmissionView(qualified, multiple, 'org-b').selectedId, 'org-b');
assert.equal(state.pointSubmissionView(qualified, multiple, 'org-gone').selectedId, '');
assert.equal(state.pointSubmissionView(qualified, { ...organizations, items: [] }).showApply, false);
assert.equal(state.pointSubmissionView().qualificationKnown, false);
assert.equal(state.pointSubmissionView(qualified, organizations).canSubmit, true);
assert.equal(state.pointApplicationView(application, organizations).canClose, true);
assert.equal(state.pointApplicationView(application, { ...organizations, items: [] }).canClose, true);
assert.equal(state.pointApplicationView(application, { ...organizations, items: [] }).cannotContinueReview, true);
assert.equal(state.pointApplicationView(application).acceptanceUnknown, true);
assert.equal(state.pointApplicationView(approved, organizations).canClose, false);
assert.throws(() => api.createPointApplication({ title: body.title, description: body.description, fileIds: body.fileIds }, 'key'));
assert.throws(() => api.createPointApplication({ ...body, membershipId: 'injected-cycle' }, 'key'));
const summary = { personId: 'person-1', balance: 0, totalGranted: 10, totalReversed: 10, evaluatedAt: application.createdAt };
assert.equal((await read(api.getMyPointSummary, '/summary', summary)).balance, 0);
for (const bad of [{ ...summary, balance: '0' }, { ...summary, balance: 1 }, { ...summary, totalGranted: 9007199254740992 }, { ...summary, personId: 'other' }]) await badRead(api.getMyPointSummary, '/summary', bad);
let p = api.listMyPointApplications({ page: 2, pageSize: 1, status: 'PENDING' }); await flush(); let r = take('GET', '/applications');
assert.deepEqual(clone(r.data), { page: 2, pageSize: 1, status: 'PENDING' }); respond(r, page([application], 2, 1, 2)); assert.equal((await p).page, 2);
assert.equal((await read(api.listMyPointApplications, '/applications', page([]))).items.length, 0);
await badRead(api.listMyPointApplications, '/applications', page([], 0));
await badRead(api.listMyPointApplications, '/applications', page([application], 1, 20, '1'));
await badRead(api.listMyPointApplications, '/applications', page([{ ...application, personId: 'other' }]));
for (const invalid of [{ page: 0 }, { pageSize: 101 }, { userId: 'other' }, { status: 'UNKNOWN' }]) assert.throws(() => api.listMyPointApplications(invalid));
assert.equal((await read(() => api.getMyPointApplication('app-1'), '/applications/app-1', approved)).awardedPoints, 10);
// r6 preserves original review history while accounting tracks corrections/revocation.
const corrected = { ...approved, reviewNote: undefined, accounting: { status: 'EFFECTIVE', effectivePoints: 3, effectiveLedgerId: 'corrected-1' } };
assert.equal((await read(() => api.getMyPointApplication('app-1'), '/applications/app-1', corrected)).accounting.effectivePoints, 3);
assert.equal((await read(() => api.getMyPointApplication('app-1'), '/applications/app-1', { ...corrected, accounting: { status: 'REVOKED', effectivePoints: 0 } })).awardedPoints, 10);
for (const bad of [
  { ...approved, reviewNote: null }, { ...approved, reviewNote: ' ' },
  { ...application, personName: '' }, { ...application, acceptingOrganizationName: null },
  { ...application, accounting: undefined }, { ...application, accounting: approved.accounting },
  { ...approved, accounting: { status: 'NONE', effectivePoints: 0 } },
  { ...approved, accounting: { status: 'REVOKED', effectivePoints: 1 } },
  { ...approved, accounting: { status: 'EFFECTIVE', effectivePoints: 1 } },
  { ...approved, accounting: { status: 'REVOKED', effectivePoints: 0, effectiveLedgerId: 'old' } },
]) await badRead(() => api.getMyPointApplication('app-1'), '/applications/app-1', bad);
const rejected = { ...application, status: 'REJECTED', reviewerUserId: 'reviewer-1', reviewedAt: approved.reviewedAt, reviewNote: '证明不足' };
assert.equal((await read(() => api.getMyPointApplication('app-1'), '/applications/app-1', rejected)).reviewNote, '证明不足');
for (const bad of [{ ...application, awardedPoints: 10 }, { ...approved, awardedPoints: 0 }, { ...rejected, grantLedgerId: 'ledger-1' }, { ...application, applicationId: 'other' }]) await badRead(() => api.getMyPointApplication('app-1'), '/applications/app-1', bad);
// Direct replacement: reject old responses missing the frozen acceptance basis.
const legacy = { ...application }; delete legacy.acceptanceBasis;
await badRead(() => api.getMyPointApplication('app-1'), '/applications/app-1', legacy);
const closed = { ...application, status: 'CLOSED', closedAt: application.createdAt, closedByUserId: 'user-1', closureReason: '退出原组织，结束后重申' };
assert.equal((await read(() => api.getMyPointApplication('app-1'), '/applications/app-1', closed)).status, 'CLOSED');
for (const bad of [{ ...closed, reviewerUserId: 'reviewer' }, { ...closed, awardedPoints: 1 }, { ...closed, closureReason: '' }, { ...application, closedAt: application.createdAt }]) {
  await badRead(() => api.getMyPointApplication('app-1'), '/applications/app-1', bad);
}
p = api.listMyPointApplications({ status: 'CLOSED' }); await flush(); r = take('GET', '/applications'); respond(r, page([closed])); assert.equal((await p).items[0].status, 'CLOSED');
const closing = operations.pointCloseOperation('app-1', { reason: closed.closureReason });
p = closing.submit(); assert.equal(p, closing.submit()); await flush(); r = take('POST', '/applications/app-1:close');
const closeKey = r.header['Idempotency-Key']; assert.deepEqual(clone(r.data), { reason: closed.closureReason });
r.fail({ errMsg: 'request:fail timeout' }); await assert.rejects(p, NetworkError); assert.equal(closing.state, 'UNKNOWN');
p = closing.submit(); await flush(); r = take('GET', '/applications/app-1'); respond(r, application); await flush();
r = take('POST', '/applications/app-1:close'); assert.equal(r.header['Idempotency-Key'], closeKey); respond(r, closed); assert.equal((await p).status, 'CLOSED');
p = closing.submit(); await flush(); r = take('GET', '/applications/app-1'); respond(r, closed); assert.equal((await p).status, 'CLOSED'); assert.equal(requests.length, 0);
const race = operations.pointCloseOperation('app-1', { reason: '主动结束' });
p = race.submit(); await flush(); r = take('POST', '/applications/app-1:close'); respond(r, { status: 409, type: '/problems/points-application-finalized' }, 409); await assert.rejects(p);
p = race.submit(); await flush(); r = take('GET', '/applications/app-1'); respond(r, approved); assert.equal((await p).status, 'APPROVED'); assert.equal(requests.length, 0);
assert.throws(() => operations.pointCloseOperation('app-1', { reason: ' ' }));
assert.throws(() => operations.pointCloseOperation('app-1', { reason: '结束', userId: 'other' }));
// An old create response without bound acceptance must not be accepted as r6 success.
p = api.createPointApplication(body, 'old-provider'); await flush(); r = take('POST', '/applications'); respond(r, legacy, 201); await assert.rejects(p, HttpError);
p = api.createPointApplication(body, 'wrong-organization'); await flush(); r = take('POST', '/applications'); respond(r, { ...application, acceptanceBasis: { ...application.acceptanceBasis, organizationId: 'other-org' } }, 201); await assert.rejects(p, HttpError);
const grant = { ledgerId: 'ledger-1', personId: 'person-1', applicantUserId: 'user-1', submittedBindingId: 'binding-1', acceptanceBasis: application.acceptanceBasis, applicationId: 'app-1', operatorUserId: 'reviewer-1', reason: '通过', createdAt: application.createdAt, kind: 'GRANT', pointsDelta: 10 };
const reversal = { ...grant, ledgerId: 'ledger-2', kind: 'REVERSAL', basis: '核对原材料', pointsDelta: -10, originalLedgerId: 'ledger-1' };
assert.equal((await read(api.listMyPointLedger, '/ledger', page([grant, reversal]))).items[1].pointsDelta, -10);
p = api.listMyPointLedger({ kind: 'REVERSAL', pageSize: 1 }); await flush(); r = take('GET', '/ledger'); assert.equal(r.data.kind, 'REVERSAL'); respond(r, page([reversal], 1, 1)); await p;
await badRead(api.listMyPointLedger, '/ledger', page([{ ...grant, pointsDelta: -1 }]));
await badRead(api.listMyPointLedger, '/ledger', page([{ ...reversal, originalLedgerId: undefined }]));
const replacement = { ...grant, ledgerId: 'corrected-1', kind: 'CORRECTION_GRANT', pointsDelta: 3, reason: '纠错', basis: '原材料', originalLedgerId: grant.ledgerId, correctionId: 'correction-1' };
const nextReversal = { ...reversal, ledgerId: 'reversed-2', pointsDelta: -3, originalLedgerId: replacement.ledgerId, correctionId: 'correction-2' };
const nextReplacement = { ...replacement, ledgerId: 'corrected-2', pointsDelta: 5, originalLedgerId: replacement.ledgerId, correctionId: 'correction-2' };
const finalReversal = { ...reversal, ledgerId: 'reversed-3', pointsDelta: -5, originalLedgerId: nextReplacement.ledgerId };
const chain = [ { ...grant, reason: undefined }, { ...reversal, correctionId: 'correction-1' }, replacement, nextReversal, nextReplacement, finalReversal ];
p = api.listMyPointLedger({ applicationId: 'app-1', pageSize: 10 }); await flush(); r = take('GET', '/ledger');
assert.deepEqual(clone(r.data), { page: 1, pageSize: 10, applicationId: 'app-1' }); respond(r, page(chain, 1, 10));
assert.equal((await p).items.reduce((sum, row) => sum + row.pointsDelta, 0), 0);
p = api.listMyPointLedger({ kind: 'CORRECTION_GRANT' }); await flush(); r = take('GET', '/ledger');
assert.equal(r.data.kind, 'CORRECTION_GRANT'); respond(r, page([replacement])); await p;
await badRead(() => api.listMyPointLedger({ applicationId: 'another' }), '/ledger', page([grant]));
for (const bad of [ { ...replacement, correctionId: undefined }, { ...replacement, pointsDelta: 11 },
  { ...replacement, basis: undefined }, { ...reversal, reason: undefined }, { ...grant, basis: 'invalid' },
  { ...grant, correctionId: 'invalid' }, { ...replacement, personId: 'another' }, { ...grant, kind: 'FUTURE' } ])
  await badRead(api.listMyPointLedger, '/ledger', page([bad]));
assert.throws(() => api.createPointApplication({ ...body, awardedPoints: 100 }, 'key'));
assert.throws(() => api.createPointApplication({ ...body, userId: 'other' }, 'key'));
assert.throws(() => api.createPointApplication({ ...body, fileIds: ['x', 'x'] }, 'key'));
await assert.rejects(api.createPointApplication(body, 'bad key'));

const mutable = clone(body), op = operations.pointApplicationOperation(mutable);
mutable.title = 'changed'; mutable.fileIds.push('injected');
p = op.submit(); assert.equal(op.submit(), p); await flush(); r = take('POST', '/applications');
assert.deepEqual(clone(r.data), body); const key = r.header['Idempotency-Key']; assert.match(key, /^[A-Za-z0-9_-]{1,128}$/);
r.fail({ errMsg: 'request:fail timeout' }); await assert.rejects(p, NetworkError); assert.equal(op.state, 'UNKNOWN');
p = op.submit(); await flush(); r = take('POST', '/applications'); assert.equal(r.header['Idempotency-Key'], key); assert.deepEqual(clone(r.data), body);
respond(r, { type: '/problems/points-operation-in-progress', status: 409 }, 409); await assert.rejects(p, e => e.problemType === '/problems/points-operation-in-progress'); assert.equal(op.state, 'UNKNOWN');
p = op.submit(); await flush(); r = take('POST', '/applications'); assert.equal(r.header['Idempotency-Key'], key); respond(r, application, 202); await assert.rejects(p, HttpError); assert.equal(op.state, 'UNKNOWN');
p = op.submit(); await flush(); r = take('POST', '/applications'); respond(r, application, 201); assert.equal((await p).status, 'PENDING'); assert.equal(op.state, 'CONFIRMED');
p = op.submit(); await flush(); r = take('GET', '/applications/app-1'); respond(r, approved); assert.equal((await p).status, 'APPROVED');
const fresh = operations.pointApplicationOperation(body); p = fresh.submit(); await flush(); r = take('POST', '/applications'); assert.notEqual(r.header['Idempotency-Key'], key); respond(r, { type: '/problems/points-ineligible', status: 403 }, 403); await assert.rejects(p, e => e.statusCode === 403); assert.equal(fresh.state, 'REJECTED'); await assert.rejects(fresh.submit());
for (const [status, type] of [[400, 'points-file-unavailable'], [403, 'forbidden'], [404, 'not-found'], [409, 'points-idempotency-conflict'], [429, 'rate-limited'], [503, 'points-dependency-unavailable']]) {
  p = api.createPointApplication(body, 'stable-key'); await flush(); r = take('POST', '/applications'); respond(r, { type: '/problems/' + type, status }, status, { 'Retry-After': '2' });
  await assert.rejects(p, e => e instanceof HttpError && e.statusCode === status && e.problemType === '/problems/' + type && e.retryAfterMs === 2000 && e.raw === undefined && api.pointsErrorMessage(e).length > 0);
}
p = api.createPointApplication(body, 'stable-key'); await flush(); r = take('POST', '/applications'); respond(r, {}, 401); await assert.rejects(p, AuthError); assert.equal(recoveries, 0); assert.equal(requests.length, 0);

assert.equal((await read(() => api.getMyPointFile('file-1'), '/files/file-1', file)).fileId, 'file-1');
await badRead(() => api.getMyPointFile('file-1'), '/files/file-1', { ...file, ownerUserId: 'other' });
await badRead(() => api.getMyPointFile('file-1'), '/files/file-1', { ...file, applicationId: 'app-1' });
assert.equal((await read(() => api.getMyPointFileAccess('file-1'), '/files/file-1/access', { url: 'https://private.invalid/signed', expiresAt: application.createdAt })).url, 'https://private.invalid/signed');
await badRead(() => api.getMyPointFileAccess('file-1'), '/files/file-1/access', { url: 'http://public.invalid/file', expiresAt: application.createdAt });
for (const bad of [{ ...declaration, kind: 'VIDEO' }, { ...declaration, sizeBytes: 10485761 }, { ...declaration, kind: 'IMAGE' }, { ...declaration, url: 'https://public.invalid' }]) assert.throws(() => api.createPointFileUploadCredentials([bad], 'key'));
const upload = operations.pointFileUploadOperation(declaration, '/tmp/proof.pdf');
p = upload.upload(); assert.equal(upload.upload(), p); await flush(); r = take('POST', '/file-upload-credentials'); const uploadKey = r.header['Idempotency-Key']; assert.deepEqual(clone(r.data), { files: [declaration] }); r.fail({ errMsg: 'network' }); await assert.rejects(p);
p = upload.upload(); await flush(); r = take('POST', '/file-upload-credentials'); assert.equal(r.header['Idempotency-Key'], uploadKey); respond(r, credentials); await flush();
let sdk = uploads.shift(); assert.equal(sdk.method, 'PUT'); assert.equal(sdk.opts.ContentLength, 100); assert.equal(sdk.opts.Headers['x-cos-forbid-overwrite'], 'true'); assert.equal(sdk.opts.Headers['x-cos-acl'], 'private'); assert.equal(sdk.opts.Headers['Content-Type'], 'application/pdf'); assert.equal(sdk.opts.Key, credentials.objectKeys[0]);
assert.equal(requests.length, 0); sdk.cb(null, { ETag: 'etag' }); await flush(); r = take('POST', '/files'); const registerKey = r.header['Idempotency-Key']; assert.notEqual(registerKey, uploadKey); assert.deepEqual(clone(r.data), { uploadId: 'upload-1', fileIndex: 0 });
r.fail({ errMsg: 'request:fail timeout' }); await assert.rejects(p);
p = upload.upload(); await flush(); r = take('POST', '/files'); assert.equal(r.header['Idempotency-Key'], registerKey); assert.equal(uploads.length, 0); respond(r, file, 201); const result = await p; assert.equal(result.fileId, 'file-1'); assert.equal(result.url, undefined); assert.equal(result.fileUrl, undefined);
p = upload.upload(); await flush(); r = take('GET', '/files/file-1'); respond(r, { ...file, unboundExpiresAt: undefined, applicationId: 'app-1' }); await p;
// Lost PUT response: registration confirms the original object without a second PUT.
const lostUpload = operations.pointFileUploadOperation(declaration, '/tmp/lost.pdf');
p = lostUpload.upload(); await flush(); r = take('POST', '/file-upload-credentials'); respond(r, credentials); await flush(); sdk = uploads.shift(); sdk.cb(new Error('response lost')); await assert.rejects(p);
p = lostUpload.upload(); await flush(); r = take('POST', '/files'); const lostRegisterKey = r.header['Idempotency-Key'];
respond(r, { type: '/problems/points-dependency-unavailable', status: 503 }, 503); await assert.rejects(p); assert.equal(uploads.length, 0);
p = lostUpload.upload(); await flush(); r = take('POST', '/files'); assert.equal(r.header['Idempotency-Key'], lostRegisterKey); respond(r, file, 201); await p; assert.equal(uploads.length, 0);
// Definite unavailable material allows only the same credential key/object and registration key.
const failedUpload = operations.pointFileUploadOperation(declaration, '/tmp/failed.pdf');
p = failedUpload.upload(); await flush(); r = take('POST', '/file-upload-credentials'); const failedCredentialKey = r.header['Idempotency-Key']; respond(r, credentials); await flush(); sdk = uploads.shift(); sdk.cb(new Error('PUT failed')); await assert.rejects(p);
p = failedUpload.upload(); await flush(); r = take('POST', '/files'); const failedRegisterKey = r.header['Idempotency-Key']; respond(r, { type: '/problems/points-file-unavailable', status: 400 }, 400); await flush();
r = take('POST', '/file-upload-credentials'); assert.equal(r.header['Idempotency-Key'], failedCredentialKey); respond(r, credentials); await flush(); sdk = uploads.shift(); assert.equal(sdk.method, 'PUT'); assert.equal(sdk.opts.Key, credentials.objectKeys[0]); sdk.cb(null, {}); await flush(); r = take('POST', '/files'); assert.equal(r.header['Idempotency-Key'], failedRegisterKey); respond(r, file, 201); await p;
// Missing/expired credentials never reach COS or registration; expiry never silently rotates the key.
const expiredUpload = operations.pointFileUploadOperation(declaration, '/tmp/expired.pdf');
p = expiredUpload.upload(); await flush(); r = take('POST', '/file-upload-credentials');
const expiredKey = r.header['Idempotency-Key'];
respond(r, { ...credentials, expiredTime: 1, uploadExpiresAt: '1970-01-01T00:00:01Z' }); await assert.rejects(p, /过期/); assert.equal(uploads.length, 0);
p = expiredUpload.upload(); await flush(); r = take('POST', '/file-upload-credentials'); assert.equal(r.header['Idempotency-Key'], expiredKey);
respond(r, { type: '/problems/points-upload-expired', status: 409 }, 409); await assert.rejects(p, e => e.problemType === '/problems/points-upload-expired');
p = api.createPointFileUploadCredentials([declaration], 'credential-test'); await flush(); r = take('POST', '/file-upload-credentials'); respond(r, { ...credentials, objectKeys: [] }); await assert.rejects(p, HttpError);
p = api.getMyPointFileAccess('other/file'); await flush(); r = take('GET', '/files/other%2Ffile/access'); respond(r, { type: '/problems/not-found', status: 404 }, 404); await assert.rejects(p, e => e.statusCode === 404 && e.raw === undefined);
// A mid-upload account change cannot register the old account's object.
const abandoned = operations.pointFileUploadOperation(declaration, '/tmp/abandoned.pdf');
p = abandoned.upload(); await flush(); r = take('POST', '/file-upload-credentials'); respond(r, credentials); await flush(); sdk = uploads.shift();
identity = { id: 'other' }; watchers.forEach(f => f()); sdk.cb(null, {}); await assert.rejects(p, AuthError); assert.equal(requests.length, 0);
identity = { id: 'user-1' }; watchers.forEach(f => f());
// Account change and logout/relogin invalidate outstanding reads and reusable operation handles.
p = api.getMyPointSummary(); await flush(); r = take('GET', '/summary'); identity = { id: 'other' }; watchers.forEach(f => f()); respond(r, summary); await assert.rejects(p, AuthError);
identity = { id: '' }; watchers.forEach(f => f()); identity = { id: 'user-1' }; watchers.forEach(f => f()); await assert.rejects(op.submit(), AuthError);
await assert.rejects(closing.submit(), AuthError);
assert.equal(requests.length, 0); assert.equal(uploads.length, 0);
assert.ok(authCalls.every(([mode, retry]) => mode === 'required' && retry === false));
const logged = JSON.stringify(logs); for (const secret of ['test-token', 'test-sts-secret', 'test-sts-token', '服务证明', 'https://private.invalid/signed']) assert.ok(!logged.includes(secret), secret + ' leaked');
console.log('PASS Points r6 consumer: real shared HTTP + real COS adapter with synthetic wx/COS boundaries; DTOs, pagination, states, errors, idempotency, private files, account isolation. Backend/device NOT_RUN.');


