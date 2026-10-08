import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const calls = [];
const registrationWxml = fs.readFileSync(
  'subpkg_activity/pages/registration/registration.wxml',
  'utf8',
);
assert.equal(
  [...registrationWxml.matchAll(/\{\{([\s\S]*?)\}\}/g)].filter((match) => match[1].includes('\n'))
    .length,
  0,
  'registration WXML bindings must stay on one line for the Mini Program compiler',
);
const detail = {
  activityId: 'activity:01',
  registrationMode: 'MINI_PROGRAM',
  formVersion: 'form:v2',
  capacity: 8,
  availability: { state: 'OPEN' },
  platformRegistrationCount: { submittedCount: 2 },
  registrationForm: {
    allowModification: true,
    fields: [
      {
        fieldKey: 'student',
        label: '学号',
        purpose: 'STUDENT_NUMBER',
        type: 'TEXT',
        required: true,
        maxLength: 12,
        displayOrder: 0,
      },
      {
        fieldKey: 'slot',
        label: '时段',
        purpose: 'CUSTOM',
        type: 'MULTI_SELECT',
        required: false,
        options: [
          { optionKey: 'a', label: '甲' },
          { optionKey: 'b', label: '乙' },
        ],
        displayOrder: 1,
      },
    ],
  },
};
const record = (status) => ({
  registrationId: 'registration:same',
  activityId: detail.activityId,
  status,
  formVersion: detail.formVersion,
  answers: [{ fieldKey: 'student', value: '7123456789' }],
  submittedAt: '2027-03-01T10:00:00+08:00',
  updatedAt: '2027-03-01T10:00:00+08:00',
  ...(status === 'CANCELLED' ? { cancelledAt: '2027-03-02T10:00:00+08:00' } : {}),
  canModify: status === 'SUBMITTED',
  canCancel: status === 'SUBMITTED',
});
const response = (status, etag) => ({ data: record(status), headers: { etag }, statusCode: 200 });
const eventApi = {
  activities: { detail: async () => detail },
  registrations: {
    mine: async () => response('CANCELLED', '"cancelled-v2"'),
    create: async (...args) => (
      calls.push(['create', ...args]),
      response('SUBMITTED', '"submitted-v3"')
    ),
    replace: async (...args) => (
      calls.push(['replace', ...args]),
      response('SUBMITTED', '"submitted-v4"')
    ),
    cancel: async (...args) => (
      calls.push(['cancel', ...args]),
      response('CANCELLED', '"cancelled-v5"')
    ),
  },
};
const exports = {};
const js = ts.transpileModule(fs.readFileSync('subpkg_activity/services/registration.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
vm.runInNewContext(js, {
  exports,
  Error,
  require(name) {
    if (name.endsWith('/event-api')) return { eventApi };
    if (name.endsWith('/registration-api')) return { registrationApi: eventApi.registrations };
    if (name.endsWith('/error')) return { isHttpError: () => false };
    return {};
  },
});
const form = await exports.readRegistrationForm(detail.activityId);
assert.equal(form.formVersion, 'form:v2');
assert.equal(form.submittedCount, 2);
assert.equal(
  JSON.stringify(exports.prepareAnswers(form.fields, { student: '7123456789', slot: ['a', 'b'] })),
  JSON.stringify([
    { fieldKey: 'student', value: '7123456789' },
    { fieldKey: 'slot', value: ['a', 'b'] },
  ]),
);
assert.throws(
  () => exports.prepareAnswers(form.fields, { student: '7123456789', stale: 'x' }),
  /失效字段/,
);
assert.throws(
  () => exports.prepareAnswers(form.fields, { student: '1234567890123' }),
  /请检查“学号”等标红字段/,
);
assert.equal(
  exports.registrationTextError(form.fields[0], '6123456789'),
  '学号应为 7 开头的 10 位数字',
);
const phoneField = {
  key: 'phone',
  label: '联系电话',
  purpose: 'PHONE',
  type: 'text',
  required: true,
  maxLength: 11,
};
assert.equal(
  exports.registrationTextError(phoneField, '12800138000'),
  '请输入有效的 11 位大陆手机号',
);
assert.equal(exports.registrationTextError(phoneField, '13800138000'), '');
let validationError;
try {
  exports.prepareAnswers(form.fields, { student: '', slot: ['missing'] });
} catch (error) {
  validationError = error;
}
assert.equal(validationError?.name, 'RegistrationValidationError');
assert.equal(validationError?.fieldErrors.student, '此项为必填，请完成后再提交');
assert.equal(validationError?.fieldErrors.slot, '请至少选择一个有效选项');
const cancelled = await exports.readMyRegistration(detail.activityId);
const restored = await exports.submitRegistration(
  detail.activityId,
  form,
  cancelled.answers,
  cancelled,
);
assert.equal(restored.id, cancelled.id);
assert.equal(calls[0][0], 'create');
assert.equal(calls[0][3], '"cancelled-v2"');
assert.equal(calls[0][2].formVersion, 'form:v2');
const modified = await exports.submitRegistration(
  detail.activityId,
  form,
  restored.answers,
  restored,
);
assert.equal(modified.etag, '"submitted-v4"');
assert.equal(calls[1][0], 'replace');
assert.equal(calls[1][3], '"submitted-v3"');
await exports.cancelRegistration(detail.activityId, modified);
assert.equal(calls[2][0], 'cancel');
assert.equal(calls[2][2], '"submitted-v4"');

const candidateStorage = new Map();
let candidateUserId = 'user:01';
const actionExports = {};
const actionJs = ts.transpileModule(
  fs.readFileSync('subpkg_activity/actions/registration.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } },
).outputText;
vm.runInNewContext(actionJs, {
  exports: actionExports,
  Date,
  Promise,
  require(name) {
    if (name.endsWith('/actions/auth')) return { ensureLogin: async () => undefined };
    if (name.endsWith('/stores/helper')) return { getUserId: () => candidateUserId };
    if (name.endsWith('/utils/storage')) {
      return {
        STORAGE_KEYS: { REGISTRATION_FIELD_CANDIDATES: 'registrationFieldCandidates' },
        storage: {
          get: (key) => candidateStorage.get(key),
          set: (key, value) => candidateStorage.set(key, value),
          remove: (key) => candidateStorage.delete(key),
        },
      };
    }
    if (name.endsWith('/services/registration')) return exports;
    return {};
  },
});
await actionExports.saveRegistrationCandidates(form.fields, {
  student: '7123456789',
  slot: ['a'],
});
const reusedStudent = await actionExports.readRegistrationCandidates([
  { ...form.fields[0], key: 'memberStudentNumber', label: '成员学号' },
]);
assert.equal(
  reusedStudent.byFieldKey.memberStudentNumber[0],
  '7123456789',
  'same-purpose fields must reuse candidates across activities and field keys',
);
candidateUserId = 'user:02';
const isolatedCandidates = await actionExports.readRegistrationCandidates(form.fields);
assert.equal(
  isolatedCandidates.hasProfile,
  false,
  'locally remembered fields must not cross account boundaries',
);
candidateUserId = 'user:01';
await actionExports.clearRegistrationCandidates();
assert.equal(candidateStorage.size, 0, 'disabling reuse must remove local candidates');

const transportCalls = [];
const apiExports = {};
const apiJs = ts.transpileModule(fs.readFileSync('subpkg_activity/services/event-api.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const httpWithMeta = Object.fromEntries(
  ['get', 'post', 'put'].map((method) => [
    method,
    async (...args) => {
      transportCalls.push([method, ...args]);
      return response('SUBMITTED', '"transport"');
    },
  ]),
);
vm.runInNewContext(apiJs, {
  exports: apiExports,
  require: () => ({ http: {}, httpWithMeta }),
});
await apiExports.eventApi.registrations.mine(detail.activityId);
await apiExports.eventApi.registrations.create(
  detail.activityId,
  { formVersion: 'form:v2', answers: [] },
  '"cancelled"',
);
await apiExports.eventApi.registrations.replace(
  detail.activityId,
  { formVersion: 'form:v2', answers: [] },
  '"submitted"',
);
await apiExports.eventApi.registrations.cancel(detail.activityId, '"submitted-next"');
assert.equal(transportCalls[0][1], '/v1/activities/activity%3A01/registrations/me');
assert.equal(transportCalls[1][1], '/v1/activities/activity%3A01/registrations');
assert.equal(transportCalls[1][3].headers['If-Match'], '"cancelled"');
assert.equal(transportCalls[2][0], 'put');
assert.equal(transportCalls[3][1], '/v1/activities/activity%3A01/registrations/me:cancel');
assert.equal(transportCalls[3][3].headers['If-Match'], '"submitted-next"');

const requestExports = {};
const requestJs = ts.transpileModule(fs.readFileSync('utils/request.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
let outgoingHeader;
vm.runInNewContext(requestJs, {
  exports: requestExports,
  Object,
  Promise,
  wx: {
    request(options) {
      outgoingHeader = options.header;
      options.success({
        statusCode: 200,
        data: record('SUBMITTED'),
        header: { ETag: '"response-v1"' },
      });
    },
  },
  require(name) {
    if (name.includes('config'))
      return { __esModule: true, default: { baseURL: '', timeout: 1000 } };
    if (name.endsWith('/logger')) return { createLogger: () => ({ info: () => undefined }) };
    if (name.endsWith('/auth-transport')) {
      return { getAuthToken: async () => 'token', recoverAuthToken: async () => undefined };
    }
    if (name.endsWith('/wx-promise')) {
      return { wxHideLoading: () => undefined, wxShowLoading: () => undefined };
    }
    if (name.endsWith('/error')) return {};
    return {};
  },
});
const meta = await requestExports.httpWithMeta.put(
  '/resource',
  {},
  { headers: { 'If-Match': '"request-v1"' } },
);
assert.equal(outgoingHeader['If-Match'], '"request-v1"');
assert.equal(outgoingHeader.Authorization, 'Bearer token');
assert.equal(meta.headers.etag, '"response-v1"');

let pageOptions;
const serverRecord = {
  id: 'registration:same',
  activityId: detail.activityId,
  status: 'SUBMITTED',
  formVersion: detail.formVersion,
  answers: { student: 'server-002' },
  submittedAt: '2027-03-01T10:00:00+08:00',
  updatedAt: '2027-03-02T10:00:00+08:00',
  canModify: true,
  canCancel: true,
  etag: '"server-v2"',
};
let submitFailure = { statusCode: 412 };
let scrolledTo;
let pageStack = [];
let navigatedBack;
let redirectedTo;
let modalConfirmed = true;
const pageAction = {
  loadRegistration: async () => [
    { status: 'fulfilled', value: form },
    { status: 'fulfilled', value: serverRecord },
  ],
  readRegistrationCandidates: async () => ({
    byFieldKey: { student: ['7123456789'] },
    hasProfile: true,
  }),
  saveRegistrationCandidates: async () => undefined,
  clearRegistrationCandidates: async () => undefined,
  submitRegistration: async () => Promise.reject(submitFailure),
};
const pageJs = ts.transpileModule(
  fs.readFileSync('subpkg_activity/pages/registration/registration.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } },
).outputText;
vm.runInNewContext(pageJs, {
  exports: {},
  Error,
  Object,
  Map,
  Promise,
  getCurrentPages: () => pageStack,
  wx: {
    pageScrollTo(options) {
      scrolledTo = options.selector;
    },
    navigateBack(options) {
      navigatedBack = options.delta;
      return Promise.resolve();
    },
    redirectTo(options) {
      redirectedTo = options.url;
      return Promise.resolve();
    },
  },
  require(name) {
    if (name.endsWith('/definePage')) {
      return { __esModule: true, default: (value) => (pageOptions = value) };
    }
    if (name.endsWith('/registration')) return pageAction;
    if (name.endsWith('/error')) return { isHttpError: (error) => error?.statusCode != null };
    if (name.endsWith('/wx-promise')) {
      return { wxShowModal: async () => ({ confirm: modalConfirmed, cancel: !modalConfirmed }) };
    }
    return {};
  },
});
const page = {
  ...pageOptions,
  data: { ...pageOptions.data },
  setData(patch) {
    Object.assign(this.data, patch);
  },
};
page.onLoad({ activityId: detail.activityId });
await page.reload();
assert.equal(page.data.isDirty, false, 'server answers must start in a clean state');
assert.equal(page.data.fieldCandidates.student[0], '7123456789');
page.onUseCandidate({
  currentTarget: { dataset: { key: 'student', value: '7123456789' } },
});
assert.equal(page.data.answers.student, '7123456789', 'candidate selection must fill the field');
assert.equal(page.data.isDirty, true, 'candidate selection must participate in dirty state');
page.onInput({ currentTarget: { dataset: { key: 'student' } }, detail: { value: 'local-001' } });
assert.equal(page.data.isDirty, true, 'editing an answer must mark the form dirty');
page.onInput({ currentTarget: { dataset: { key: 'student' } }, detail: { value: 'server-002' } });
assert.equal(page.data.isDirty, false, 'restoring the server value must clear dirty state');
page.setData({ answers: { student: 'local-001' }, canSubmit: true, isDirty: true });
await page.onSubmit();
assert.equal(page.data.conflict, true);
assert.equal(page.data.answers.student, 'local-001', '412 must preserve the local draft');
assert.equal(page.data.answerDisplays[0].value, 'server-002', '412 must expose server state');

submitFailure = Object.assign(new Error('请检查“学号”等标红字段'), {
  name: 'RegistrationValidationError',
  fieldErrors: { student: '此项为必填，请完成后再提交' },
});
page.setData({ answers: { student: '' }, canSubmit: true, conflict: false, isDirty: true });
await page.onSubmit();
assert.equal(page.data.validationSummary, '请检查“学号”等标红字段');
assert.equal(page.data.fieldErrors.student, '此项为必填，请完成后再提交');
assert.equal(scrolledTo, '#registration-field-0');

page.setData({ isDirty: false });
pageStack = [
  { route: 'subpkg_activity/pages/detail/detail' },
  { route: 'subpkg_activity/pages/registration/registration' },
];
await page.onActivity();
assert.equal(
  navigatedBack,
  1,
  'registration opened from detail must reuse the previous detail page',
);

pageStack = [{ route: 'subpkg_activity/pages/registration/registration' }];
await page.onActivity();
assert.equal(
  redirectedTo,
  '/subpkg_activity/pages/detail/detail?activityId=activity%3A01',
  'direct registration entry must rebuild the activity detail route',
);

redirectedTo = undefined;
modalConfirmed = false;
page.setData({ isDirty: true });
await page.onActivity();
assert.equal(redirectedTo, undefined, 'unsaved answers must stay on page when leave is cancelled');
console.log(
  'PASS: answer dirty state, inline validation, navigation reuse, ETag writes and 412 reconciliation',
);
