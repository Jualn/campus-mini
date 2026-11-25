import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const captured = [], requests = [], calls = [], watchers = [], bindingWatchers = [], cosCalls = [];
let binding = { personId: 'person-1', bindingId: 'binding-1' }, bindingEpoch = 0;
let identity = { id: 'user-1' }, modal = null;
let now = Date.now(), timerId = 0;
let subscriptionCalls = 0, subscriptionCurrent = true;
const timers = new Map();
class TestDate extends Date { static now() { return now; } }
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const request = (method, url, data, options) => new Promise((resolve, reject) => requests.push({ method, url, data, options, resolve, reject }));
const http = Object.fromEntries(['get', 'post'].map(method => [method, (...args) => request(method, ...args)]));
const take = (method, suffix) => {
  const i = requests.findIndex(r => r.method === method && r.url.endsWith(suffix));
  assert.ok(i >= 0, `Missing ${method} ${suffix}`); return requests.splice(i, 1)[0];
};
const wx = {
  canIUse: () => false, navigateTo: o => calls.push(o), stopPullDownRefresh() {},
  showModal: o => { modal = o; },
  getFileSystemManager: () => ({ unlink() {}, readFile: o => o.success({ data: new ArrayBuffer(o.length) }) }),
  previewImage: async o => { calls.push(o); },
  openDocument: async o => { calls.push(o); },
  downloadFile: o => o.success({ statusCode: 200, tempFilePath: '/tmp/private.pdf' }),
};
const cache = new Map();
const mocks = new Map([
  ['services/business-subscriptions.ts', { createBusinessSubscription: () => ({ prepare: async () => {}, request: async () => { subscriptionCalls++; return subscriptionCurrent; }, dispose() {}, pending: false }) }],
  ['services/person-binding.ts', { requireCurrentPerson: async () => { if (!binding) throw new Error('无当前绑定'); return binding; }, assertCurrentPerson: async b => { if (b !== binding) throw new Error('绑定已变化'); }, watchPersonBinding: fn => { bindingWatchers.push(fn); return () => {}; }, personBindingEpoch: () => bindingEpoch }],
  ['utils/cos.ts', { uploadCosFile: async o => { cosCalls.push(o); }, createCosClient: () => Object.fromEntries(['multipartInit','multipartUpload','multipartComplete'].map(name => [name, (o, cb) => { cosCalls.push({ name, ...o }); cb(null, { UploadId: 'cos-upload', ETag: 'part-etag' }); }])) }],
  ['utils/request.ts', { http, httpWithMeta: http }],
  ['actions/current-user.ts', { getCurrentIdentity: () => identity, watchCurrentIdentity: fn => { watchers.push(fn); return () => {}; } }],
  ['utils/wx-promise.ts', { chooseMessageFile: async () => [{ name: '心得.pdf', path: '/tmp/a.pdf', size: 100 }], wxNavigateTo: o => calls.push(o) }],
  ['utils/notify.ts', { showInfoToast() {} }],
]);
function load(relative) {
  relative = relative.replaceAll('\\', '/');
  if (mocks.has(relative)) return mocks.get(relative);
  if (cache.has(relative)) return cache.get(relative);
  const filename = path.join(root, relative), exports = {};
  cache.set(relative, exports);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts'))), wx, Page: d => captured.push(d), Date: TestDate, Math, Error, Set, Map, setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id) }, { filename });
  return exports;
}
function instance(definition) {
  return { ...definition, data: clone(definition.data), setData(patch) { Object.assign(this.data, patch); } };
}
const api = load('subpkg_user/services/learning-task.ts');
const state = load('subpkg_user/services/learning-task-state.ts');
const operations = load('subpkg_user/services/learning-task-operation.ts');
const { HttpError, NetworkError, AuthError } = load('utils/error.ts');
const make = (extraTask = {}, extraAssignment = {}) => ({
  task: { taskId: 'task-A / 中文', title: '学习任务', description: '说明', status: 'PUBLISHED', requirements: { confirmationRequired: true, minimumTextLength: 0, minimumFiles: 0, maximumFiles: 0, allowedFileKinds: [] }, reviewRequired: false, firstDeadline: '2099-10-30T18:00:00+08:00', deadlineRevision: 1, createdAt: '2026-10-14T10:00:00+08:00', updatedAt: '2026-10-14T11:00:00+08:00', createdBy: 'admin-1', publishedAt: '2026-10-14T11:00:00+08:00', ...extraTask },
  assignment: { assignmentId: 'assignment-1', taskId: 'task-A / 中文', subject: { type: 'ACCOUNT', userId: 'user-1' }, allocationStatus: 'ACTIVE', progress: 'NOT_STARTED', displayStatus: 'NOT_STARTED', assignedAt: '2026-10-14T11:00:00+08:00', assignedBy: 'admin-1', ...extraAssignment },
});
const pure = make(), taskId = pure.assignment.assignmentId, encoded = encodeURIComponent(taskId);
const submission = { submissionId: 'submission-1', assignmentId: 'assignment-1', subject: { type: 'ACCOUNT', userId: 'user-1' }, submittedByUserId: 'user-1', kind: 'MATERIAL', attempt: 1, text: '学习心得', submittedAt: '2026-10-14T11:00:00+08:00', reviewStatus: 'PENDING_REVIEW' };
const combined = make({ requirements: { ...pure.task.requirements, minimumTextLength: 3 }, reviewRequired: true });
assert.equal(state.presentation(pure).pureConfirmation, true);
assert.equal(state.presentation(combined).pureConfirmation, false);
assert.match(state.presentation(pure).deadlineText, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
const submissionTimeView = state.submissionPresentation({ ...submission, confirmedAt: '2026-10-14T11:30:00+08:00', reviewedAt: '2026-10-14T12:00:00+08:00' });
assert.match(submissionTimeView.submittedAtText, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
assert.match(submissionTimeView.confirmedAtText, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
assert.match(submissionTimeView.reviewedAtText, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
assert.equal(state.submissionPresentation(submission).confirmedAtText, '');
for (const [progress, displayStatus, label] of [['NOT_STARTED','NOT_STARTED','待完成'], ['PENDING_REVIEW','PENDING_REVIEW','待审核'], ['REJECTED','RESUBMISSION_REQUIRED','已驳回待补交'], ['COMPLETED','COMPLETED','已完成']]) {
  const d = make({}, { progress, displayStatus, supplementDeadline: '2099-11-02T00:00:00+08:00' });
  assert.equal(state.presentation(d).statusLabel, label);
  assert.equal(state.presentation(d).canAct, ['NOT_STARTED','REJECTED'].includes(progress));
}
const overdue = make({}, { displayStatus: 'OVERDUE' });
assert.equal(state.presentation(overdue).statusLabel, '已逾期'); assert.equal(state.presentation(overdue).canAct, false);
for (const status of ['CLOSED','CANCELLED']) {
  const v = state.presentation(make({ status })); assert.equal(v.canAct, false); assert.match(v.lifecycle, /已结束|已取消/);
}
const completedCancelled = state.presentation(make({ status: 'CANCELLED' }, { allocationStatus: 'REVOKED', progress: 'COMPLETED', displayStatus: 'COMPLETED' }));
assert.equal(completedCancelled.statusLabel, '已完成'); assert.match(completedCancelled.lifecycle, /取消.*撤销/);
const boundary = Date.parse(pure.task.firstDeadline);
assert.equal(state.presentation(pure, boundary - 1).canAct, true); assert.equal(state.presentation(pure, boundary).canAct, false);
const rejected = make({ firstDeadline: '2020-01-01T00:00:00Z' }, { progress: 'REJECTED', displayStatus: 'RESUBMISSION_REQUIRED', supplementDeadline: '2099-11-02T00:00:00Z' });
assert.equal(state.presentation(rejected).canAct, true);
assert.equal(state.presentation(rejected, Date.parse(rejected.assignment.supplementDeadline)).canAct, false);
assert.equal(state.presentation(make({ firstDeadline: '2020-01-01T00:00:00Z' }, { progress: 'PENDING_REVIEW', displayStatus: 'PENDING_REVIEW' })).statusLabel, '待审核');
assert.equal(state.textLength('  学😀习  '), 3);
assert.match(state.validateSubmission(combined, '心得', true, 0), /至少/);
assert.match(state.validateSubmission(combined, '学习心得', false, 0), /确认/);
assert.equal(state.validateSubmission(combined, '学习心得', true, 0), '');
assert.deepEqual(clone(state.submissionBody(combined, ' 心得文字 ')), { text: '心得文字', confirmed: true });
assert.deepEqual(clone(state.submissionBody(make({ requirements: { ...combined.task.requirements, confirmationRequired: false } }), '心得文字')), { text: '心得文字' });
assert.match(state.validateSubmission(combined, '学习心得', true, 1), /数量/);
assert.throws(() => api.requireDetail(make({}, { taskId: 'other' })));
assert.throws(() => api.requireDetail(make({ status: 'FUTURE' })));
assert.throws(() => api.requireDetail(make({ reviewRequired: true })));
assert.throws(() => api.requireSubmission({ ...submission, assignmentId: 'other' }, 'assignment-1'));
assert.throws(() => state.selectedFile('a.mp4', '/tmp/a', 1, ['IMAGE']));
assert.throws(() => state.selectedFile('a.pdf', '/tmp/a', 10485761, ['PDF']));
assert.equal(state.selectedFile('a.pdf', '/tmp/a', 10, ['PDF']).status, '待上传');

// Protected API mapping, pagination and strong Assignment preconditions.
const listing = api.listMyLearningTasks('cursor-1', 'REJECTED');
const lr = take('get', '/learning-tasks'); assert.deepEqual(clone(lr.data), { cursor: 'cursor-1', progress: 'REJECTED', pageSize: 20 }); assert.equal(lr.options.auth, 'required'); assert.equal(lr.options.sensitive, true);
lr.resolve({ items: [pure], nextCursor: 'cursor-2' }); assert.equal((await listing).nextCursor, 'cursor-2');
const reading = api.getMyLearningTask(taskId); take('get', encoded).resolve({ data: pure, headers: { etag: '"a1"' } }); assert.equal((await reading).etag, '"a1"');
await assert.rejects(api.confirmLearningTask(taskId, 'W/"weak"', 'key'), /版本/);
const confirming = api.confirmLearningTask(taskId, '"a1"', 'key-1'); const cr = take('post', ':confirm'); assert.deepEqual(clone(cr.data), { confirmed: true }); assert.equal(cr.options.retryAuth, false); assert.equal(cr.options.headers['If-Match'], '"a1"'); cr.resolve(make({}, { progress: 'COMPLETED', displayStatus: 'COMPLETED' })); assert.equal((await confirming).assignment.progress, 'COMPLETED');
const sending = api.submitLearningTask(taskId, { text: '学习心得', confirmed: true }, '"a1"', 'key-2'); const sr = take('post', '/submissions'); sr.resolve(submission); assert.equal((await sending).reviewStatus, 'PENDING_REVIEW');
const history = api.listMyLearningTaskSubmissions(taskId, 2); const hr = take('get', '/submissions'); assert.deepEqual(clone(hr.data), { page: 2, pageSize: 20 }); hr.resolve({ items: [submission], page: 2, pageSize: 20, totalItems: 21 }); await history;
const declaration = { fileName: '成果.mp4', kind: 'VIDEO', contentType: 'video/mp4', sizeBytes: 100 };
const credentials = { uploadId: 'upload-1', bucket: 'private', region: 'r', objectKeys: ['private/key'], tmpSecretId: 'test', tmpSecretKey: 'test', sessionToken: 'test', expiredTime: Math.floor(now / 1000) + 300 };
const privateFile = { ...declaration, fileId: 'file-1', assignmentId: taskId, createdAt: new Date(now).toISOString(), unboundExpiresAt: new Date(now + 600000).toISOString() };
let fp = api.createLearningTaskFileUploadCredentials(taskId, [declaration], 'upload-key');
let fr = take('post', '/file-upload-credentials'); assert.equal(fr.options.retryAuth, false); fr.resolve(credentials); await fp;
fp = api.registerLearningTaskFile(taskId, 'upload-1', 0, 'register-key'); take('post', '/files').resolve(privateFile); await fp;
fp = api.getMyLearningTaskFile(taskId, 'file-1'); take('get', '/files/file-1').resolve({ ...privateFile, assignmentId: 'other' }); await assert.rejects(fp, /不匹配/);
fp = api.getMyLearningTaskFileAccess(taskId, 'file-1'); take('get', '/access').resolve({ url: 'https://private.example/file?signature=test', expiresAt: new Date(now - 1).toISOString() }); await assert.rejects(fp, /过期/);
fp = api.submitLearningTask(taskId, { fileIds: ['file-1'] }, '"a1"', 'file-submit'); fr = take('post', '/submissions'); assert.deepEqual(clone(fr.data), { fileIds: ['file-1'] }); fr.resolve({ ...submission, text: undefined, fileIds: ['file-1'] }); await fp;
assert.equal(requests.length, 0);
for (const status of [401,403,404,412,428,503]) assert.ok(api.learningTaskError(new HttpError(status)));
assert.match(api.learningTaskError(new HttpError(404)), /未分配/);
assert.match(api.learningTaskError(new HttpError(503, '', { problemType: '/problems/learning-task-dependency-unavailable' })), /依赖/);
assert.match(api.learningTaskError(new AuthError()), /登录/);

// Unknown outcomes keep the same key/body through navigation; concurrent clicks are rejected.
const attempt = operations.runLearningOperation(taskId, '"a1"', { text: '原内容', confirmed: true }, pure.assignment.subject); const first = take('post', '/submissions');
await assert.rejects(operations.runLearningOperation(taskId, '"a1"', { text: '不能替换' }, pure.assignment.subject), /处理中/);
first.reject(new NetworkError()); await assert.rejects(attempt); assert.ok(operations.pendingOperation(taskId));
const retry = operations.runLearningOperation(taskId, '"new"', { text: '不能替换' }, pure.assignment.subject); const repeated = take('post', '/submissions'); assert.equal(repeated.options.headers['Idempotency-Key'], first.options.headers['Idempotency-Key']); assert.deepEqual(clone(repeated.data), clone(first.data)); assert.equal(repeated.options.headers['If-Match'], '"a1"'); repeated.resolve(submission); await retry; assert.equal(operations.pendingOperation(taskId), undefined);

// Page simulation: loading, history, Article return, pure confirmation and authoritative refresh.
load('subpkg_user/pages/learning-task-detail/detail.ts'); const page = instance(captured.pop()); page._visible = true; page.onLoad({ assignmentId: taskId });
const hydrate = async (d = pure) => {
  const loading = page.load(); take('get', encoded).resolve({ data: d, headers: { etag: '"a1"' } }); await loading;
  take('get', '/submissions').resolve({ items: [], page: 1, pageSize: 20, totalItems: 0 }); await flush();
};
await hydrate(); assert.equal(page.data.error, ''); assert.equal(page.data.view.canAct, true); assert.equal(page.data.history.length, 0); assert.equal(timers.size, 1);
// Same person leaves/transfers organization after allocation. Existing Assignment,
// not current membership, continues to govern personal completion. No managementTarget
// on this older Provider response must not be interpreted as PLATFORM or block completion.
identity = { id: 'user-1', memberships: [], politicalIdentity: undefined };
watchers.forEach(fn => fn());
assert.equal(page.data.view.canAct, true);
page.setData({ confirmed: true }); const action = page.submit(); await page.submit(); assert.equal(requests.length, 0); modal.success({ confirm: true }); await flush();
const confirmPage = take('post', ':confirm'); confirmPage.resolve(make({}, { progress: 'COMPLETED', displayStatus: 'COMPLETED', confirmedAt: '2026-10-14T12:00:00Z', confirmedByUserId: 'user-1', completedAt: '2026-10-14T12:00:00Z' })); await flush();
assert.ok(page.data.detail, 'reconciliation retains the reader'); assert.equal(page.data.versionReady, false, 'old ETag cannot submit'); take('get', encoded).resolve({ data: make({}, { progress: 'COMPLETED', displayStatus: 'COMPLETED' }), headers: { etag: '"a2"' } }); await flush(); take('get', '/submissions').resolve({ items: [], page: 1, pageSize: 20, totalItems: 0 }); await action; assert.equal(page.data.view.statusLabel, '已完成');
await hydrate(combined); page.setData({ text: '学习心得', confirmed: true }); const submitPage = page.submit(); modal.success({ confirm: true }); await flush(); take('post', '/submissions').resolve(submission); await flush();
take('get', encoded).resolve({ data: make(combined.task, { progress: 'PENDING_REVIEW', displayStatus: 'PENDING_REVIEW' }), headers: { etag: '"a2"' } }); await flush(); take('get', '/submissions').resolve({ items: [submission], page: 1, pageSize: 20, totalItems: 1 }); await submitPage; await flush(); assert.equal(page.data.view.statusLabel, '待审核'); assert.equal(page.data.view.canAct, false); assert.equal(page.data.history[0].reviewLabel, '待审核');
await hydrate(make({ article: { articleId: 'article / 1', availability: 'AVAILABLE' } })); page.openArticle(); assert.match(calls.at(-1).url, /article-detail.*article%20%2F%201/); page.onHide(); page.onShow(); take('get', encoded).resolve({ data: make({ status: 'CANCELLED' }), headers: { etag: '"a3"' } }); await flush(); take('get', '/submissions').resolve({ items: [], page: 1, pageSize: 20, totalItems: 0 }); await flush(); assert.equal(page.data.view.canAct, false);
// Review consent is requested from the explicit modal confirmation, never from loading or pure confirmation.
assert.equal(subscriptionCalls, 1, 'only the earlier reviewed submission requested consent');
await hydrate(combined);
page.setData({ text: '学习成果正文', confirmed: true });
let reviewTap = page.submit();
assert.equal(subscriptionCalls, 1, 'opening confirmation does not ask for native consent');
modal.success({ confirm: false }); await reviewTap;
assert.equal(subscriptionCalls, 1);
subscriptionCurrent = false; reviewTap = page.submit(); modal.success({ confirm: true }); await reviewTap;
assert.equal(subscriptionCalls, 2); assert.equal(requests.length, 0, 'stale consent cannot continue a business write');
subscriptionCurrent = true;
console.log('PASS learning review consent: explicit confirmation, no pure-confirmation prompt, stale-operation cancellation.');
if (process.argv.includes('--subscription-only')) process.exit(0);

const privateTask = make({ requirements: { ...combined.task.requirements, minimumFiles: 1, maximumFiles: 2, allowedFileKinds: ['PDF'] } });
await hydrate(privateTask); await page.chooseFiles(); assert.equal(page.data.files[0].status, '待上传'); page.setData({ text: '学习心得', confirmed: true }); await page.submit(); assert.match(page.data.feedback, /登记/); assert.equal(requests.length, 0);
// Native chooser can hide/show the Page before returning its files. Reload must not erase the selection.
page.setData({ files: [] }); const picker = mocks.get('utils/wx-promise.ts'); const originalPicker = picker.chooseMessageFile;
picker.chooseMessageFile = async () => { page.onHide(); page.onShow(); return [{ name: '心得.pdf', path: '/tmp/selected.pdf', size: 100 }]; };
await page.chooseFiles(); assert.equal(page.data.files[0].path, '/tmp/selected.pdf');
take('get', encoded).resolve({ data: privateTask, headers: { etag: '"a1"' } }); await flush(); take('get', '/submissions').resolve({ items: [], page: 1, pageSize: 20, totalItems: 0 }); await flush(); assert.equal(page.data.files[0].status, '待上传'); picker.chooseMessageFile = originalPicker;
// Attachment-only VIDEO uses bounded multipart, immutable headers and server registration.
const videoTask = make({ requirements: { confirmationRequired: false, minimumTextLength: 0, minimumFiles: 1, maximumFiles: 1, allowedFileKinds: ['VIDEO'] }, reviewRequired: true });
await hydrate(videoTask);
const videoSelection = state.selectedFile('成果.mp4', '/tmp/video.mp4', 11 * 1024 * 1024, ['VIDEO']);
assert.throws(() => state.selectedFile('too-big.mp4', '/tmp/large.mp4', 209715201, ['VIDEO']));
assert.equal(state.validateSubmission(videoTask, '', false, 1), '');
page.setData({ files: [videoSelection], text: '', confirmed: false });
const uploading = page.uploadFiles(); await flush();
const uploadRequest = take('post', '/file-upload-credentials');
assert.equal(uploadRequest.data.files[0].contentType, 'video/mp4'); uploadRequest.resolve(credentials); await flush();
const registering = take('post', '/files'); const registrationKey = registering.options.headers['Idempotency-Key'];
registering.reject(new NetworkError()); await uploading;
assert.equal(page.data.files[0].fileId, undefined);
const transportCount = cosCalls.length;
const retryUpload = page.uploadFiles(); await flush(); const registerAgain = take('post', '/files');
assert.equal(registerAgain.options.headers['Idempotency-Key'], registrationKey);
assert.equal(cosCalls.length, transportCount); // Never upload again after uncertain registration.
const videoMetadata = { ...privateFile, sizeBytes: videoSelection.size };
registerAgain.resolve(videoMetadata); await retryUpload;
assert.equal(page.data.files[0].fileId, 'file-1');
const multipart = cosCalls.filter(c => c.name);
assert.equal(multipart.filter(c => c.name === 'multipartUpload').length, 3);
for (const c of multipart) { assert.equal(c.Headers['x-cos-forbid-overwrite'], 'true'); if (c.Body) assert.ok(c.Body.byteLength <= 5 * 1024 * 1024); }
const videoSubmit = page.submit(); modal.success({ confirm: true }); await flush();
const videoPost = take('post', '/submissions'); assert.deepEqual(clone(videoPost.data), { fileIds: ['file-1'] });
videoPost.resolve({ ...submission, text: undefined, fileIds: ['file-1'] }); await flush();
take('get', encoded).resolve({ data: make(videoTask.task, { progress: 'PENDING_REVIEW', displayStatus: 'PENDING_REVIEW' }), headers: { etag: '"video2"' } }); await flush();
take('get', '/submissions').resolve({ items: [{ ...submission, fileIds: ['file-1'] }], page: 1, pageSize: 20, totalItems: 1 }); await videoSubmit; await flush();
assert.equal(page.data.view.statusLabel, '待审核'); assert.equal(page.data.view.canAct, false);
// History survives replacement and each open reauthorizes, including after signature expiry.
page._visible = true;
assert.ok(page.data.history.some(s => s.fileIds?.includes('file-1')), JSON.stringify({ history: page.data.history, error: page.data.historyError }));
const openVideo = page.openFile({ currentTarget: { dataset: { id: 'file-1' } } }); await flush();
take('get', '/files/file-1').resolve(videoMetadata); await flush();
take('get', '/access').resolve({ url: 'https://private.example/video?signature=one', expiresAt: new Date(now + 1000).toISOString() }); await openVideo;
assert.match(page.data.videoUrl, /signature=one/);
const expiryTimer = page._accessTimer; timers.get(expiryTimer).fn(); timers.delete(expiryTimer);
assert.equal(page.data.videoUrl, ''); assert.match(page.data.feedback, /到期/);
const reopenVideo = page.openFile({ currentTarget: { dataset: { id: 'file-1' } } }); await flush(); take('get', '/files/file-1').resolve(videoMetadata); await flush();
take('get', '/access').reject(new HttpError(403)); await reopenVideo; assert.equal(page.data.videoUrl, ''); assert.match(page.data.feedback, /权限/);
// Images and documents use the same private access boundary; hiding rejects late results.
for (const [kind, contentType, fileName] of [['IMAGE', 'image/png', '成果.png'], ['PDF', 'application/pdf', '成果.pdf'], ['WORD', 'application/msword', '成果.doc']]) {
  const opening = page.openFile({ currentTarget: { dataset: { id: 'file-1' } } }); await flush();
  take('get', '/files/file-1').resolve({ ...privateFile, kind, contentType, fileName }); await flush();
  take('get', '/access').resolve({ url: 'https://private.example/file?signature=' + kind, expiresAt: new Date(now + 1000).toISOString() }); await opening;
  if (kind === 'IMAGE') assert.match(calls.at(-1).urls[0], /signature=IMAGE/);
  else { assert.equal(calls.at(-1).showMenu, false); assert.equal(calls.at(-1).fileType, kind === 'PDF' ? 'pdf' : 'doc'); }
}
assert.equal(page._downloads.length, 2); page.clearDownloads(); assert.equal(page._downloads.length, 0);
const lateFile = page.openFile({ currentTarget: { dataset: { id: 'file-1' } } }); await flush();
const lateMetadata = take('get', '/files/file-1'); page.onHide(); lateMetadata.resolve(videoMetadata); await lateFile;
assert.equal(requests.length, 0); assert.equal(page.data.videoUrl, ''); page._visible = true;
await hydrate(videoTask); page.setData({ files: [{ ...videoSelection, fileId: 'expired', unboundExpiresAt: new Date(now - 1).toISOString() }] }); await page.submit(); assert.match(page.data.feedback, /到期/); assert.equal(requests.length, 0);
page.setData({ files: [] });
page.onLoad({ assignmentId: '' }); await page.load(); assert.match(page.data.error, /无效/); assert.equal(requests.length, 0);
page.onLoad({ assignmentId: taskId }); const denied = page.load(); take('get', encoded).reject(new HttpError(404)); await denied; assert.equal(page.data.detail, null); assert.match(page.data.error, /未分配/);

// Latest result is independently readable despite attempt-ascending history pagination.
const latestDetail = make(combined.task, { progress: 'REJECTED', displayStatus: 'RESUBMISSION_REQUIRED', latestSubmissionId: 'submission-latest', supplementDeadline: '2099-11-02T00:00:00Z' });
await hydrate(latestDetail); take('get', '/submission-latest').resolve({ ...submission, submissionId: 'submission-latest', attempt: 21, reviewStatus: 'REJECTED', reviewReason: '请补充学习心得', reviewedAt: '2026-10-15T12:00:00Z', reviewedBy: 'reviewer-1' }); await flush(); assert.equal(page.data.latest.reviewReason, '请补充学习心得'); assert.equal(page.data.view.canAct, true);
const historySecond = page.loadHistory(true); const secondRequest = take('get', '/submissions'); assert.equal(secondRequest.data.page, 2); secondRequest.reject(new NetworkError()); await historySecond; assert.ok(page.data.historyError); page.retryHistory(); take('get', '/submissions').resolve({ items: [{ ...submission, attempt: 21 }], page: 2, pageSize: 20, totalItems: 21 }); await flush(); assert.equal(page.data.history[0].attempt, 21);

// Supplement uses the same submissions operation, creating a new immutable attempt.
page.setData({ text: '补充心得内容', confirmed: true, files: [] }); const supplement = page.submit(); modal.success({ confirm: true }); await flush(); const supplementRequest = take('post', '/submissions'); assert.deepEqual(clone(supplementRequest.data), { text: '补充心得内容', confirmed: true }); supplementRequest.resolve({ ...submission, submissionId: 'submission-22', attempt: 22 }); await flush();
take('get', encoded).resolve({ data: make(combined.task, { progress: 'PENDING_REVIEW', displayStatus: 'PENDING_REVIEW', supplementDeadline: latestDetail.assignment.supplementDeadline }), headers: { etag: '"a5"' } }); await flush(); take('get', '/submissions').resolve({ items: [{ ...submission, reviewStatus: 'REJECTED', reviewReason: '请补充', attempt: 21 }, { ...submission, submissionId: 'submission-22', attempt: 22 }], page: 1, pageSize: 20, totalItems: 2 }); await supplement; await flush(); assert.equal(page.data.history.length, 2); assert.equal(page.data.history[0].reviewStatus, 'REJECTED'); assert.equal(page.data.view.statusLabel, '待审核'); assert.equal(page.data.detail.assignment.supplementDeadline, latestDetail.assignment.supplementDeadline);

// Deadline timer closes the form and refreshes server truth; hiding cleans resources.
await hydrate(); now = Date.parse(pure.task.firstDeadline); const timer = timers.get(page._deadlineTimer); assert.ok(timer); timers.delete(page._deadlineTimer); timer.fn(); assert.ok(page.data.detail, 'reconciliation retains the reader'); assert.equal(page.data.versionReady, false, 'old ETag cannot submit'); take('get', encoded).resolve({ data: make({}, { displayStatus: 'OVERDUE' }), headers: { etag: '"a4"' } }); await flush(); take('get', '/submissions').resolve({ items: [], page: 1, pageSize: 20, totalItems: 0 }); await flush(); assert.equal(page.data.view.statusLabel, '已逾期'); assert.equal(page.data.view.canAct, false); now = Date.now(); await hydrate(); page.onHide(); assert.equal(timers.size, 0);

// List pagination, late responses and cross-account privacy clearing.
load('subpkg_user/pages/learning-task-list/list.ts'); const list = instance(captured.pop()); list.onLoad();
const old = list.load(), oldRequest = take('get', '/learning-tasks'); const newer = list.load(); take('get', '/learning-tasks').resolve({ items: [pure], nextCursor: 'next' }); await newer; oldRequest.resolve({ items: [make({ title: 'stale' })] }); await old; assert.equal(list.data.items[0].task.title, pure.task.title);
list.changeProgress({ detail: { value: '2' } }); const filterRequest = take('get', '/learning-tasks'); assert.equal(filterRequest.data.progress, 'PENDING_REVIEW'); assert.equal(filterRequest.data.cursor, undefined); filterRequest.resolve({ items: [pure], nextCursor: 'next' }); await flush();
list.open({ currentTarget: { dataset: { id: taskId } } }); assert.equal(calls.at(-1).url, api.learningTaskRoute(taskId));
const more = list.load(true); const failed = take('get', '/learning-tasks'); assert.equal(failed.data.cursor, 'next'); failed.reject(new NetworkError()); await more; assert.equal(list.data.items.length, 1);
const moreRetry = list.load(true); take('get', '/learning-tasks').resolve({ items: [pure, make({ taskId: 'task-2' }, { taskId: 'task-2', assignmentId: 'a-2' })] }); await moreRetry; assert.equal(list.data.items.length, 2);
// PERSON binding changes clear private drafts and pending intent; ACCOUNT responsibility stays.
page._visible = false;
page.setData({ detail: pure, text: '账号草稿' }); bindingWatchers.forEach(fn => fn()); assert.equal(page.data.text, '账号草稿');
const personal = make({}, { subject: { type: 'PERSON', personId: 'person-1' } });
page.setData({ detail: personal, text: '人员私有草稿', files: [videoSelection] });
const personalOperation = operations.runLearningOperation(taskId, '"p1"', { text: '人员成果' }, personal.assignment.subject); await flush();
const personalRequest = take('post', '/submissions'); personalRequest.reject(new NetworkError()); await assert.rejects(personalOperation); assert.ok(operations.pendingOperation(taskId));
binding = { personId: 'person-2', bindingId: 'binding-2' }; ++bindingEpoch; bindingWatchers.forEach(fn => fn());
assert.equal(page.data.text, ''); assert.equal(page.data.files.length, 0); assert.equal(operations.pendingOperation(taskId), undefined);
await assert.rejects(api.assertLearningSubject(personal.assignment.subject), /不属于/);
identity = { id: 'user-2' }; watchers.forEach(fn => fn()); assert.equal(list.data.items.length, 0); assert.equal(page.data.text, ''); assert.equal(page.data.files.length, 0);
for (const r of requests.splice(0)) r.reject(new AuthError()); await flush();

// All nine types use existing frozen SYSTEM presentation. Unknown types retain text; unknown targets never guess.
const target = load('utils/notification-target.ts'); const model = load('pages/message/message-model.ts');
for (const suffix of ['ASSIGNED','ASSIGNMENT_ADDED','FIRST_DEADLINE_REMINDER','REVIEW_APPROVED','REVIEW_REJECTED','SUPPLEMENT_DEADLINE_REMINDER','DEADLINE_CHANGED','CANCELLED','ASSIGNMENT_REVOKED','FUTURE']) {
  const card = model.toNotificationCard({ id: suffix, type: `LEARNING_TASK_${suffix}`, category: 'SYSTEM', presentation: { title: '冻结标题', body: '查看本人任务', ...(suffix === 'DEADLINE_CHANGED' ? { changes: [{ label: '截止', before: '旧期限', after: '新期限' }] } : {}) }, target: { type: 'LEARNING_TASK_DETAIL', assignmentId: taskId }, readAt: null, createdAt: '2026-10-14T10:00:00Z' });
  assert.equal(card.presentation.title, '冻结标题'); assert.equal(card.canNavigate, true); assert.equal(card.label, '系统'); if (suffix === 'DEADLINE_CHANGED') assert.equal(card.layout, 'change');
}
assert.equal(target.resolveNotificationTarget({ type: 'LEARNING_TASK_DETAIL', assignmentId: taskId }), api.learningTaskRoute(taskId));
for (const bad of [{ type: 'LEARNING_TASK_DETAIL' }, { type: 'LEARNING_TASK_DETAIL', taskId: 1 }, { type: 'LEARNING_TASK_DETAIL', taskId: '\n' }, { type: 'FUTURE', taskId }]) assert.equal(target.resolveNotificationTarget(bad), null);
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'))); const registered = app.subPackages.find(p => p.root === 'subpkg_user').pages;
for (const route of ['pages/learning-task-list/list', 'pages/learning-task-detail/detail']) {
  assert.ok(registered.includes(route)); for (const ext of ['ts','json','wxml','wxss']) assert.ok(fs.existsSync(path.join(root, 'subpkg_user', route + '.' + ext)));
}
console.log('LearningTask: state, API, private upload/access, idempotency, Page lifecycle, pagination and notification regressions passed (Node simulation; not WeChat runtime).');
