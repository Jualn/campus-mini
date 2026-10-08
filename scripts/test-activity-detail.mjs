import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const fixture = {
  activityId: 'activity:opaque/01',
  title: '契约活动',
  summary: '活动摘要',
  category: 'COMPETITION',
  organizer: '校园协会',
  audienceScope: { type: 'DEPARTMENTS', departmentIds: ['dept-a'] },
  audienceSummary: '信息学科部',
  primaryLocation: '教学楼',
  registrationMode: 'MINI_PROGRAM_AND_EXTERNAL',
  cardTimeline: {
    nodeKey: 'submission',
    type: 'MATERIAL_SUBMISSION',
    title: '材料提交',
    schedule: { kind: 'DATE_RANGE', startDate: '2027-03-18', endDate: '2027-03-20' },
    displayOrder: 2,
  },
  participantMode: 'INDIVIDUAL',
  capacity: 100,
  capacityUnit: 'PERSON',
  publishStatus: 'PUBLISHED',
  lifecycleStatus: 'ACTIVE',
  availability: { state: 'OPEN', evaluatedAt: '2027-03-01T10:00:00+08:00' },
  platformRegistrationCount: { submittedCount: 3, asOf: '2027-03-01T10:00:00+08:00' },
  formVersion: 'form:v1',
  registrationForm: {
    allowModification: true,
    fields: [
      {
        fieldKey: 'studentNumber',
        label: '学号',
        purpose: 'STUDENT_NUMBER',
        type: 'TEXT',
        required: true,
        maxLength: 20,
        displayOrder: 0,
      },
    ],
  },
  timeline: [
    {
      nodeKey: 'submission',
      type: 'MATERIAL_SUBMISSION',
      title: '材料提交',
      schedule: { kind: 'DATE_RANGE', startDate: '2027-03-18', endDate: '2027-03-20' },
      displayOrder: 0,
    },
    {
      nodeKey: 'result',
      type: 'RESULT',
      title: '结果公布',
      schedule: { kind: 'TEXT', timeDescription: '具体时间另行通知' },
      displayOrder: 1,
    },
  ],
  sections: [
    {
      sectionKey: 'guide',
      title: '须知',
      content: '继续完成外部步骤',
      format: 'PLAIN_TEXT',
      displayOrder: 0,
    },
  ],
  actions: [
    {
      actionKey: 'external',
      type: 'EXTERNAL_REGISTRATION',
      title: '外部报名',
      url: 'https://example.org/register',
      displayOrder: 0,
    },
  ],
  contacts: [{ contactKey: 'owner', name: '负责人', contact: 'example@example.org' }],
  attachments: [],
};

const detailWxml = fs.readFileSync('subpkg_activity/pages/detail/detail.wxml', 'utf8');
const detailWxss = fs.readFileSync('subpkg_activity/pages/detail/detail.wxss', 'utf8');
const multilineBindings = [...detailWxml.matchAll(/\{\{([\s\S]*?)\}\}/g)].filter((match) =>
  match[1].includes('\n'),
);
assert.equal(
  multilineBindings.length,
  0,
  'detail WXML bindings must stay on one line for the Mini Program compiler',
);
assert.match(
  detailWxss,
  /\.cover-top-mask\s*\{[^}]*position:\s*fixed;/s,
  'the custom back control must stay fixed while the detail page scrolls',
);
assert.match(
  detailWxss,
  /\.info-card__organizer\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s,
  'long organizer text must wrap instead of pushing scopes beyond the viewport',
);
assert.match(
  detailWxss,
  /\.info-card__scope\s*\{[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere;/s,
  'long scope labels must remain inside the information card',
);
assert.match(
  detailWxss,
  /\.contact-left\s*\{[^}]*min-width:\s*0;/s,
  'long contact content must shrink before it pushes copy actions off-screen',
);
assert.match(
  detailWxss,
  /\.bottom-bar\s*\{[^}]*bottom:\s*calc\(22rpx \+ env\(safe-area-inset-bottom\)\);[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s,
  'the bottom actions must float above the safe area without a full-width white panel',
);

const calls = [];
const eventApi = {
  activities: {
    detail: async (id) => (calls.push(['detail', id]), fixture),
    subscription: async (id) => (calls.push(['subscription', id]), { subscribed: true }),
    list: async (query) => (
      calls.push(['list', query]),
      { items: [fixture], nextCursor: 'next:opaque' }
    ),
    subscribe: async (id) => (calls.push(['subscribe', id]), { subscribed: true }),
    unsubscribe: async (id) => calls.push(['unsubscribe', id]),
  },
};
const exports = {};
const timelineExports = {};
const timelineJs = ts.transpileModule(fs.readFileSync('subpkg_activity/utils/event-timeline.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
vm.runInNewContext(timelineJs, { exports: timelineExports, Date });
const js = ts.transpileModule(fs.readFileSync('subpkg_activity/services/activity.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
vm.runInNewContext(js, {
  exports,
  Date,
  require(name) {
    if (name.endsWith('/event-api')) return { eventApi };
    if (name.endsWith('/api')) return { api: { activity: {} } };
    if (name.endsWith('/event-timeline')) return timelineExports;
    return {};
  },
});

const detail = await exports.getActivityDetail(fixture.activityId);
assert.equal(detail.id, fixture.activityId);
assert.equal(detail.subscribed, true);
assert.equal(detail.registrationMode, 4);
assert.equal(detail.availability, 'OPEN');
assert.equal(detail.registrationForm.fields[0].label, '学号');
assert.equal(detail.registrationForm.fields[0].typeLabel, '填写');
assert.equal(detail.capacityText, '100 人');
assert.equal(detail.cardTimelineLabel, '材料提交');
assert.equal(detail.cardTimelineText, '2027年03月18日 至 2027年03月20日');
assert.equal(detail.timeline[0].scheduleKind, 'DATE_RANGE');
assert.equal(detail.timeline[0].scheduleKindLabel, '日期范围');
assert.equal(detail.timeline[1].scheduleText, '具体时间另行通知');
assert.equal(detail.sections[0].key, 'guide');
assert.equal(detail.actions[0].targetValue, 'https://example.org/register');
assert.equal(detail.contacts[0].note, 'example@example.org');
const page = await exports.getActivityList({ keyword: '契约', lastId: 'cursor:old', pageSize: 10 });
assert.equal(page.list[0].summary, '活动摘要');
assert.equal(
  page.list[0].daysToDeadline,
  null,
  'DATE_RANGE card timeline must not create countdown',
);
assert.equal(page.nextCursor, 'next:opaque');
assert.equal(
  JSON.stringify(calls.find(([kind]) => kind === 'list')[1]),
  JSON.stringify({ cursor: 'cursor:old', pageSize: 10, q: '契约', sort: '-publishedAt' }),
);
await exports.getActivityList({ keyword: '   ', lastId: ' ' });
const emptyQueryCall = calls.filter(([kind]) => kind === 'list').pop()[1];
assert.equal(
  JSON.stringify(emptyQueryCall),
  JSON.stringify({ pageSize: 20, sort: '-publishedAt' }),
  'blank optional query values must be omitted',
);
assert.equal(await exports.setActivitySubscription(fixture.activityId, true), true);
assert.equal(await exports.setActivitySubscription(fixture.activityId, false), false);

const detailActionExports = {};
const detailActionJs = ts.transpileModule(
  fs.readFileSync('subpkg_activity/pages/detail/detail-actions.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
vm.runInNewContext(detailActionJs, { exports: detailActionExports });
const resolve = detailActionExports.resolveDetailPrimaryAction;
assert.equal(resolve(1, 'NO_REGISTRATION', ''), null);
assert.equal(
  JSON.stringify(resolve(2, 'OPEN', '')),
  JSON.stringify({ kind: 'registration', label: '立即报名', disabled: false }),
);
assert.equal(resolve(2, 'OPEN', 'SUBMITTED').label, '查看报名');
assert.equal(resolve(2, 'OPEN', 'CANCELLED').label, '重新报名');
assert.equal(resolve(2, 'NOT_OPEN', '').label, '报名未开始');
assert.equal(resolve(2, 'FULL', '').label, '名额已满');
assert.equal(resolve(2, 'CLOSED', '').label, '报名已截止');
assert.equal(resolve(2, 'UNAVAILABLE', '').label, '当前不可报名');
assert.equal(resolve(2, 'CLOSED', '').disabled, true);
assert.equal(
  JSON.stringify(resolve(3, 'EXTERNAL', '')),
  JSON.stringify({ kind: 'participation', label: '查看参与方式', disabled: false }),
);
assert.equal(resolve(4, 'OPEN', '').label, '填写报名表');
assert.equal(
  JSON.stringify(resolve(4, 'OPEN', 'SUBMITTED')),
  JSON.stringify({ kind: 'external-actions', label: '查看后续步骤', disabled: false }),
);

const actionExports = {};
const actionJs = ts.transpileModule(
  fs.readFileSync('subpkg_activity/actions/activity.ts', 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  },
).outputText;
vm.runInNewContext(actionJs, {
  exports: actionExports,
  require(name) {
    if (name.endsWith('/services/activity')) {
      return { getActivityDetail: async () => detail };
    }
    if (name.endsWith('/services/registration')) {
      return { readMyRegistration: async () => ({ status: 'SUBMITTED', answers: {} }) };
    }
    if (name.endsWith('/actions/auth')) return { ensureLogin: async () => undefined };
    if (name.endsWith('/stores/helper')) return { getUserId: () => 'user:1' };
    return {};
  },
});
const detailState = await actionExports.getActivityDetailState(fixture.activityId);
assert.equal(detailState.registrationStatus, 'SUBMITTED');
assert.equal(detailState.activity.id, fixture.activityId);
console.log(
  'PASS: Activity mapping, participation action matrix, personal status and subscription',
);
