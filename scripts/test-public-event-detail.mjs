import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const fixture = {
  publicEventId: 'public-event:opaque/2027',
  title: '公共竞赛',
  summary: '聚合官方阶段信息',
  type: 'COMPETITION',
  sourceName: '官方组委会',
  sourceUrl: 'https://example.org/notice',
  officialUrl: 'https://example.org',
  publishStatus: 'PUBLISHED',
  lifecycleStatus: 'ACTIVE',
  cardTimeline: {
    nodeKey: 'preliminary',
    type: 'PRELIMINARY',
    title: '初赛日期',
    schedule: { kind: 'DATE_POINT', date: '2027-04-18' },
    displayOrder: 0,
  },
  timeline: [
    {
      nodeKey: 'final',
      type: 'FINAL',
      title: '决赛',
      schedule: {
        kind: 'EXACT_RANGE',
        startTime: '2027-04-20T09:00:00+08:00',
        endTime: '2027-04-20T11:00:00+08:00',
      },
      displayOrder: 0,
    },
    {
      nodeKey: 'result',
      type: 'RESULT',
      title: '结果公布',
      schedule: { kind: 'TEXT', timeDescription: '以官方通知为准' },
      displayOrder: 1,
    },
  ],
  sections: [
    {
      sectionKey: 'guide',
      title: '说明',
      content: '以官网为准',
      format: 'PLAIN_TEXT',
      displayOrder: 0,
    },
  ],
  actions: [
    {
      actionKey: 'register',
      type: 'EXTERNAL_REGISTRATION',
      title: '官方报名',
      url: 'https://example.org/register',
      displayOrder: 0,
    },
  ],
  contacts: [{ contactKey: 'contact', name: '咨询', contact: 'help@example.org' }],
  attachments: [],
};
const calls = [];
const eventApi = {
  publicEvents: {
    detail: async (id) => (calls.push(['detail', id]), fixture),
    subscription: async (id) => (calls.push(['subscription', id]), { subscribed: true }),
    subscribe: async (id) => (calls.push(['subscribe', id]), { subscribed: true }),
    unsubscribe: async (id) => calls.push(['unsubscribe', id]),
    list: async (query) => (
      calls.push(['list', query]),
      { items: [fixture], nextCursor: 'cursor:2' }
    ),
  },
};
function compile(file, require) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(js, { exports, require });
  return exports;
}
const time = {
  ...compile('subpkg_public_event/utils/event-timeline.ts', () => ({})),
};
const detailService = compile('subpkg_public_event/services/public-event.ts', (name) => {
  if (name.endsWith('/event-api')) return { eventApi };
  if (name.endsWith('/event-timeline')) return time;
  return {};
});
const detail = await detailService.getPublicEventDetail(fixture.publicEventId);
assert.equal(detail.id, fixture.publicEventId);
assert.equal(detail.subscribed, true);
assert.equal(detail.sections[0].key, 'guide');
assert.equal(detail.timeline[0].key, 'final');
assert.equal(detail.timeline[0].scheduleKind, 'EXACT_RANGE');
assert.equal(detail.timeline[0].scheduleKindLabel, '精确时间范围');
assert.equal(detail.timeline[0].scheduleText, '2027年04月20日 09:00 至 2027年04月20日 11:00');
assert.equal(detail.timeline[1].scheduleText, '以官方通知为准');
assert.equal(detail.resources.find((item) => item.key === 'register').primary, true);
assert.equal(detail.info.find((item) => item.label === '咨询').value, 'help@example.org');
assert.equal(await detailService.setPublicEventSubscription(fixture.publicEventId, true), true);
assert.equal(await detailService.setPublicEventSubscription(fixture.publicEventId, false), false);
const page = await detailService.getPublicEventCards({
  keyword: '竞赛',
  lastId: 'cursor:1',
  pageSize: 20,
});
assert.equal(page.items[0].frequency, '竞赛 · 官方组委会');
assert.equal(page.items[0].typeLabel, '竞赛');
assert.equal(page.items[0].typeMark, '赛');
assert.equal(page.items[0].color, 'purple');
assert.equal(page.items[0].sourceName, '官方组委会');
assert.equal(page.items[0].statusTone, 'active');
assert.equal(page.items[0].nextNodeLabel, '初赛日期');
assert.equal(page.items[0].nextDate, '2027年04月18日');
assert.equal(page.items[0].daysLeft, null, 'DATE_POINT card timeline must not create countdown');
assert.equal(
  JSON.stringify(calls.find(([kind]) => kind === 'list')[1]),
  JSON.stringify({
    cursor: 'cursor:1',
    pageSize: 20,
    q: '竞赛',
    sort: '-publishedAt',
  }),
);
await detailService.getPublicEventCards({ keyword: '   ', lastId: ' ' });
const emptyQueryCall = calls.filter(([kind]) => kind === 'list').pop()[1];
assert.equal(
  JSON.stringify(emptyQueryCall),
  JSON.stringify({ sort: '-publishedAt' }),
  'blank optional query values must be omitted',
);
console.log(
  'PASS: canonical PublicEvent cardTimeline/detail, independent subscription and opaque IDs',
);
