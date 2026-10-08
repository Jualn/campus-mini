import type { NotificationItem } from '../../types/notification-contract';
import { resolveNotificationTarget } from '../../utils/notification-target';
import { formatTime, TimeStyle } from '../../utils/time-util';

const META: Record<string, { label: string; icon: string; tone: string }> = {
  INTERACTION: { label: '互动', icon: '/assets/icons/common/interaction.svg', tone: 'interaction' },
  ACTIVITY: {
    label: '活动与公共事项',
    icon: '/assets/icons/common/activity.svg',
    tone: 'activity',
  },
  SYSTEM: { label: '系统', icon: '/assets/icons/common/system_notice.svg', tone: 'system' },
};

// Conservative preview bounds; expansion always retains the complete frozen snapshot.
const needsExpansion = (text?: string) =>
  Boolean(text && (text.length > 32 || text.includes('\n')));

export const notificationFilterTabs = [
  {
    id: '',
    label: '全部',
    filterIcon: '/assets/icons/common/filter-all.svg',
    activeIcon: '/assets/icons/common/filter-all-active.svg',
  },
  {
    id: 'INTERACTION',
    label: '互动',
    filterIcon: '/assets/icons/common/filter-interaction.svg',
    activeIcon: '/assets/icons/common/filter-interaction-active.svg',
  },
  {
    id: 'ACTIVITY',
    label: '活动',
    filterIcon: '/assets/icons/common/filter-events.svg',
    activeIcon: '/assets/icons/common/filter-events-active.svg',
  },
  {
    id: 'SYSTEM',
    label: '系统',
    filterIcon: '/assets/icons/common/filter-system.svg',
    activeIcon: '/assets/icons/common/filter-system-active.svg',
  },
];

export const toNotificationCard = (item: NotificationItem) => {
  const legacyContext =
    item.presentation.subjectTitle === undefined && item.presentation.quote === undefined
      ? item.presentation.context
      : undefined;
  return {
    ...item,
    expanded: false,
    legacyContext,
    canExpand: [
      item.presentation.title,
      item.presentation.body,
      item.presentation.subjectTitle,
      item.presentation.quote,
      legacyContext,
    ].some(needsExpansion),
    showActorName: Boolean(
      item.actor?.nickname && !item.presentation.title.includes(item.actor.nickname),
    ),
    layout: item.presentation.changes?.length
      ? 'change'
      : item.category === 'INTERACTION'
        ? 'interaction'
        : 'general',
    presentation: {
      ...item.presentation,
      changes: (item.presentation.changes ?? []).map((change, index) => ({
        ...change,
        key: String(index),
      })),
    },
    isRead: item.readAt !== null,
    timeAgo: formatTime(item.createdAt, TimeStyle.POST),
    canNavigate: Boolean(resolveNotificationTarget(item.target)),
    ...(META[item.category] ?? { label: '通知', icon: META.SYSTEM.icon, tone: 'system' }),
  };
};

export type NotificationCard = ReturnType<typeof toNotificationCard>;

export const mergeNotificationCards = (
  existing: NotificationCard[],
  incoming: NotificationItem[],
) => {
  const seen = new Set(existing.map((item) => item.id));
  return [
    ...existing,
    ...incoming
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .map(toNotificationCard),
  ];
};
