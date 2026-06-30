export function parseDate(input: string): Date {
  // 兼容 "2026-05-17T22:30:07"
  return new Date(input.replace(' ', 'T'));
}

/**
 * 距离截止还有几天
 * @param deadline 截止日期字符串
 * @returns 剩余天数，为负数表示已过期
 */
export function calcDaysToDeadline(deadline: string): number | null {
  if (!deadline) return null;
  const parsed = parseDate(deadline);
  if (isNaN(parsed.getTime())) return null;
  const now = new Date();
  const diff = parsed.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return null;
  return days;
}

function timeAgo(input: string): string {
  const date = parseDate(input);
  const now = new Date();

  const diff = now.getTime() - date.getTime();

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute).toString()}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour).toString()}小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day).toString()}天前`;

  // 超过一周给具体日期
  return formatYMD(input);
}

function formatYMD(input: string): string {
  const d = parseDate(input);

  const y = d.getFullYear().toString();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${y}年${m}月${day}日`;
}

function formatMD(input: string): string {
  const d = parseDate(input);

  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${m}月${day}日`;
}

function formatMDHM(input: string): string {
  const d = parseDate(input);

  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');

  return `${m}月${day}日 ${hh}:${mm}`;
}

function formatHM(input: string): string {
  const d = parseDate(input);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatY(input: string): string {
  const d = parseDate(input);

  const y = d.getFullYear().toString();

  return `${y}年`;
}

function formatYM(input: string): string {
  const d = parseDate(input);

  const y = d.getFullYear().toString();
  const m = String(d.getMonth() + 1).padStart(2, '0');

  return `${y}年${m}月`;
}

function formatShortYMDHM(input: string): string {
  const d = parseDate(input);

  const y = d.getFullYear().toString();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

export const TimeStyle = {
  POST: '几分钟前，几小时前，几天前，或具体日期',
  FULL: 'YYYY-MM-DD',
  DATE: 'MM-DD',
  TIME: 'HH:mm',
  MONTH_DAY_TIME: 'MM-DD HH:mm',
  YEAR: 'YYYY',
  YM: 'YYYY-MM',
  SHORT_YMDHM: 'YY-MM-DD HH:mm,无单位',
} as const;

/**
 * 格式化时间字符串
 * @param input 时间字符串
 * @param style 类型
 * @returns 带有单位的，YYYY -> xxxx年 MM-DD -> xx月xx日 HH:mm -> xx:xx
 */
export default function formatTime(
  input: string,
  style: (typeof TimeStyle)[keyof typeof TimeStyle],
): string {
  switch (style) {
    case TimeStyle.POST:
      return timeAgo(input);
    case TimeStyle.FULL:
      return formatYMD(input);
    case TimeStyle.DATE:
      return formatMD(input);
    case TimeStyle.MONTH_DAY_TIME:
      return formatMDHM(input);
    case TimeStyle.YM:
      return formatYM(input);
    case TimeStyle.YEAR:
      return formatY(input);
    case TimeStyle.TIME:
      return formatHM(input);
    case TimeStyle.SHORT_YMDHM:
      return formatShortYMDHM(input);
    default:
      return input;
  }
}
