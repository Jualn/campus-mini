import type { PostCardItem } from '../../types/business';
import type {
  HomePublicMatterReminder,
  HomePublicMatterReminderSnapshot,
} from '../../services/home-public-matter-reminder';

export interface HomePublicMatterReminderCard {
  publicMatterId: string;
  name: string;
  nodeName: string;
  dateText: string;
  timeText: string;
  dateTimeAriaLabel: string;
  countdownValue: string;
  countdownUnit: string;
  countdownSoon: boolean;
  countdownAriaLabel: string;
  theme: string;
}

const REMINDER_THEMES = ['ocean', 'coral', 'violet', 'mint', 'amber'] as const;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

export function formatShanghaiDateTime(timestamp: number): string {
  const parts = formatShanghaiDateTimeParts(timestamp);
  return `${parts.year.toString()}年${parts.month.toString()}月${parts.day.toString()}日 ${parts.timeText}`;
}

export function formatShanghaiDateTimeParts(timestamp: number) {
  const date = new Date(timestamp + SHANGHAI_OFFSET_MS);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return {
    year,
    month,
    day,
    dateText: `${year.toString()}.${pad2(month)}.${pad2(day)}`,
    timeText: `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`,
  };
}

export interface ReminderCountdownDisplay {
  value: string;
  unit: string;
  soon: boolean;
  ariaLabel: string;
}

export function getReminderCountdownDisplay(remainingMs: number): ReminderCountdownDisplay {
  if (remainingMs < 60_000) {
    return { value: '即将到期', unit: '', soon: true, ariaLabel: '不足1分钟，即将到期' };
  }

  const totalMinutes = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const value = days > 0 ? days : hours > 0 ? hours : totalMinutes;
  const unit = days > 0 ? '天' : hours > 0 ? '小时' : '分钟';
  return {
    value: value.toString(),
    unit,
    soon: false,
    ariaLabel: `还剩${value.toString()}${unit}`,
  };
}

export function estimateReminderNow(
  snapshot: HomePublicMatterReminderSnapshot,
  localNowMs = Date.now(),
): number {
  return snapshot.evaluatedAtMs + Math.max(0, localNowMs - snapshot.receivedAtMs);
}

export function toHomeReminderCards(
  items: HomePublicMatterReminder[],
  estimatedNowMs: number,
): HomePublicMatterReminderCard[] {
  return items.flatMap((item, index) => {
    const remainingMs = item.reminderAtMs - estimatedNowMs;
    if (remainingMs <= 0) return [];
    const countdown = getReminderCountdownDisplay(remainingMs);
    const dateTime = formatShanghaiDateTimeParts(item.reminderAtMs);
    const theme = REMINDER_THEMES[index % REMINDER_THEMES.length];
    return [
      {
        publicMatterId: item.publicMatterId,
        name: item.name,
        nodeName: item.nodeName,
        dateText: dateTime.dateText,
        timeText: dateTime.timeText,
        dateTimeAriaLabel: formatShanghaiDateTime(item.reminderAtMs),
        countdownValue: countdown.value,
        countdownUnit: countdown.unit,
        countdownSoon: countdown.soon,
        countdownAriaLabel: countdown.ariaLabel,
        theme,
      },
    ];
  });
}

export interface HomeLayout {
  fabBottomDock: number;
  fabMenuBottom: number;
}

export function calculateHomeLayout({
  screenHeight,
  safeAreaBottom,
  windowWidth,
}: {
  screenHeight: number;
  safeAreaBottom: number;
  windowWidth: number;
}): HomeLayout {
  const safeBottom = screenHeight - safeAreaBottom;
  const rpxRatio = windowWidth / 750;
  const tabBarHeight = Math.round(120 * rpxRatio);
  const tabBarBottom = safeBottom + 16;
  const fabBottomDock = tabBarBottom + tabBarHeight + 16;

  return {
    fabBottomDock,
    fabMenuBottom: fabBottomDock + 50 + 16,
  };
}

export function appendUniquePosts(
  current: PostCardItem[],
  incoming: PostCardItem[],
): PostCardItem[] {
  const existingIds = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !existingIds.has(item.id))];
}

export function generatePostTitle(content: string, maxLength = 10): string {
  if (!content) return '无标题';

  const text = content
    .trim()
    .replace(/\r?\n/g, ' ')
    .replace(/<[^>]+>/g, '');
  if (!text) return '无标题';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
