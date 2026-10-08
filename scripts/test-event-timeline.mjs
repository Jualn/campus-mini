import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
const js = ts.transpileModule(fs.readFileSync('subpkg_activity/utils/event-timeline.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
vm.runInNewContext(js, { exports, Date });

const exactPoint = exports.formatTimelineSchedule({
  kind: 'EXACT_POINT',
  time: '2027-03-22T09:30:00+08:00',
});
assert.equal(exactPoint.text, '2027年03月22日 09:30');
assert.equal(exactPoint.kind, 'EXACT_POINT');
assert.equal(exactPoint.kindLabel, '精确时间点');
assert.equal(
  exports.exactCountdownDays(
    { kind: 'EXACT_POINT', time: '2027-03-22T09:30:00+08:00' },
    Date.parse('2027-03-20T09:30:00+08:00'),
  ),
  2,
);

const exactRange = exports.formatTimelineSchedule({
  kind: 'EXACT_RANGE',
  startTime: '2027-03-22T09:30:00+08:00',
  endTime: '2027-03-22T11:00:00+08:00',
});
assert.equal(exactRange.text, '2027年03月22日 09:30 至 2027年03月22日 11:00');
assert.equal(exactRange.kind, 'EXACT_RANGE');
assert.equal(exactRange.kindLabel, '精确时间范围');
assert.equal(
  exports.exactCountdownDays({
    kind: 'EXACT_RANGE',
    startTime: '2027-03-22T09:30:00+08:00',
    endTime: '2027-03-22T11:00:00+08:00',
  }),
  null,
  'EXACT_RANGE must not invent a countdown target',
);

const datePoint = exports.formatTimelineSchedule({
  kind: 'DATE_POINT',
  date: '2027-03-28',
});
assert.equal(datePoint.text, '2027年03月28日');
assert.ok(!datePoint.text.includes('00:00'));
assert.equal(exports.exactCountdownDays({ kind: 'DATE_POINT', date: '2027-03-28' }), null);

const dateRange = exports.formatTimelineSchedule({
  kind: 'DATE_RANGE',
  startDate: '2027-03-28',
  endDate: '2027-03-30',
});
assert.equal(dateRange.text, '2027年03月28日 至 2027年03月30日');
assert.ok(!dateRange.text.includes('00:00'));
assert.equal(
  exports.formatTimelineSchedule({
    kind: 'DATE_RANGE',
    startDate: '2027-03-28',
    endDate: '2027-03-28',
  }).text,
  '2027年03月28日 至 2027年03月28日',
  'RANGE must remain a range even when both boundaries are equal',
);

const text = exports.formatTimelineSchedule({
  kind: 'TEXT',
  timeDescription: '具体时间另行通知',
});
assert.equal(text.text, '具体时间另行通知');

const currentDateMs = Date.parse('2027-03-29T12:00:00+08:00');
assert.equal(
  exports.timelineStatus(
    { kind: 'DATE_RANGE', startDate: '2027-03-28', endDate: '2027-03-30' },
    currentDateMs,
  ),
  'active',
);
assert.equal(
  exports.timelineStatus(
    {
      kind: 'EXACT_RANGE',
      startTime: '2027-03-29T11:00:00+08:00',
      endTime: '2027-03-29T12:00:00+08:00',
    },
    currentDateMs,
  ),
  'done',
  'EXACT_RANGE end boundary is exclusive',
);
assert.equal(
  exports.timelineStatus(
    {
      kind: 'EXACT_RANGE',
      startTime: '2027-03-29T11:00:00+08:00',
      endTime: '2027-03-29T13:00:00+08:00',
    },
    currentDateMs,
  ),
  'active',
);
assert.equal(
  exports.timelineStatus({ kind: 'EXACT_POINT', time: '2027-03-29T12:00:00+08:00' }, currentDateMs),
  'active',
);
assert.equal(
  exports.timelineStatus({ kind: 'TEXT', timeDescription: '另行通知' }, currentDateMs),
  'unknown',
);

console.log('PASS: POINT, RANGE and TEXT timeline display preserves schedule precision');
