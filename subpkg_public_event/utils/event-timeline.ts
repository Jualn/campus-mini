import type { EventTimelineNode, TimelineSchedule } from '../../types/event-contract';

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export type TimelineDisplayStatus = 'done' | 'active' | 'pending' | 'unknown';

export interface TimelineScheduleDisplay {
  kind: TimelineSchedule['kind'];
  kindLabel: string;
  text: string;
  dateText: string;
  timeText: string;
  endText: string;
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function shanghaiParts(timestamp: number) {
  const date = new Date(timestamp + SHANGHAI_OFFSET_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

function exactParts(value: string): {
  date: string;
  time: string;
  full: string;
} {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return { date: '', time: '', full: value };
  const parts = shanghaiParts(timestamp);
  const date = `${parts.year.toString()}年${pad2(parts.month)}月${pad2(parts.day)}日`;
  const time = `${pad2(parts.hour)}:${pad2(parts.minute)}`;
  return { date, time, full: `${date} ${time}` };
}

function calendarDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[1]}年${match[2]}月${match[3]}日` : value;
}

export function formatTimelineSchedule(schedule: TimelineSchedule): TimelineScheduleDisplay {
  if (schedule.kind === 'TEXT') {
    return {
      kind: schedule.kind,
      kindLabel: '文字时间',
      text: schedule.timeDescription,
      dateText: '',
      timeText: '',
      endText: '',
    };
  }
  if (schedule.kind === 'DATE_POINT') {
    const date = calendarDate(schedule.date);
    return {
      kind: schedule.kind,
      kindLabel: '日期',
      text: date,
      dateText: date,
      timeText: '',
      endText: '',
    };
  }
  if (schedule.kind === 'DATE_RANGE') {
    const start = calendarDate(schedule.startDate);
    const end = calendarDate(schedule.endDate);
    return {
      kind: schedule.kind,
      kindLabel: '日期范围',
      text: `${start} 至 ${end}`,
      dateText: start,
      timeText: '',
      endText: end,
    };
  }
  if (schedule.kind === 'EXACT_POINT') {
    const point = exactParts(schedule.time);
    return {
      kind: schedule.kind,
      kindLabel: '精确时间点',
      text: point.full,
      dateText: point.date,
      timeText: point.time,
      endText: '',
    };
  }
  const start = exactParts(schedule.startTime);
  const end = exactParts(schedule.endTime);
  return {
    kind: schedule.kind,
    kindLabel: '精确时间范围',
    text: `${start.full} 至 ${end.full}`,
    dateText: start.date,
    timeText: start.time,
    endText: end.full,
  };
}

function shanghaiDateKey(timestamp: number): string {
  const parts = shanghaiParts(timestamp);
  return `${parts.year.toString()}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function timelineStatus(
  schedule: TimelineSchedule,
  nowMs = Date.now(),
): TimelineDisplayStatus {
  if (schedule.kind === 'TEXT') return 'unknown';
  if (schedule.kind === 'DATE_POINT') {
    const today = shanghaiDateKey(nowMs);
    if (today < schedule.date) return 'pending';
    if (today > schedule.date) return 'done';
    return 'active';
  }
  if (schedule.kind === 'DATE_RANGE') {
    const today = shanghaiDateKey(nowMs);
    if (today < schedule.startDate) return 'pending';
    if (today > schedule.endDate) return 'done';
    return 'active';
  }
  if (schedule.kind === 'EXACT_POINT') {
    const point = Date.parse(schedule.time);
    if (!Number.isFinite(point)) return 'unknown';
    if (nowMs < point) return 'pending';
    return nowMs === point ? 'active' : 'done';
  }
  const start = Date.parse(schedule.startTime);
  if (!Number.isFinite(start)) return 'unknown';
  if (nowMs < start) return 'pending';
  const end = Date.parse(schedule.endTime);
  if (!Number.isFinite(end)) return 'unknown';
  if (start === end) return nowMs === start ? 'active' : 'done';
  return nowMs < end ? 'active' : 'done';
}

export function exactCountdownDays(schedule: TimelineSchedule, nowMs = Date.now()): number | null {
  if (schedule.kind !== 'EXACT_POINT') return null;
  const target = Date.parse(schedule.time);
  if (!Number.isFinite(target) || target <= nowMs) return null;
  return Math.ceil((target - nowMs) / 86_400_000);
}

export function sortTimeline<T extends Pick<EventTimelineNode, 'displayOrder' | 'nodeKey'>>(
  items: T[],
): T[] {
  return [...items].sort(
    (left, right) =>
      left.displayOrder - right.displayOrder || left.nodeKey.localeCompare(right.nodeKey),
  );
}
