import { api } from '../../services/api';
import { isHttpError } from '../../utils/error';
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationChannelCapabilities,
  NotificationPreferences,
  UpdateNotificationPreferences,
} from '../../types/api';

export const NOTIFICATION_CATEGORIES: { value: NotificationCategory; label: string }[] = [
  { value: 'ACTIVITY', label: '活动提醒' },
  { value: 'PUBLIC_EVENT', label: '事项提醒' },
  { value: 'COMMENT', label: '评论' },
  { value: 'REPLY', label: '回复' },
  { value: 'LIKE', label: '点赞' },
  { value: 'AUDIT_RESULT', label: '审核与处理结果' },
  { value: 'SYSTEM', label: '系统消息' },
  { value: 'LEARNING_TASK', label: '学习任务' },
  { value: 'POINTS', label: '积分结果' },
];
const CHANNELS: NotificationChannel[] = [
  'IN_APP',
  'WECHAT_MINI_PROGRAM',
  'WECHAT_OFFICIAL_ACCOUNT',
];
// Required first-release combinations; future types/channels are ignored, never synthesized.
const TYPES: Record<NotificationCategory, string[]> = {
  ACTIVITY: [
    'ACTIVITY_REGISTRATION_START_REMINDER',
    'ACTIVITY_REGISTRATION_DEADLINE_REMINDER',
    'ACTIVITY_START_REMINDER',
    'ACTIVITY_CANCELLED',
    'ACTIVITY_TIME_CHANGED',
    'ACTIVITY_LOCATION_CHANGED',
    'ACTIVITY_ENDED_EARLY',
  ],
  PUBLIC_EVENT: [
    'PUBLIC_EVENT_START_REMINDER',
    'PUBLIC_EVENT_REGISTRATION_DEADLINE_REMINDER',
    'PUBLIC_EVENT_CANCELLED',
    'PUBLIC_EVENT_TIME_CHANGED',
    'PUBLIC_EVENT_LOCATION_CHANGED',
  ],
  COMMENT: ['POST_COMMENTED'],
  REPLY: ['COMMENT_REPLIED'],
  LIKE: ['POST_LIKED', 'COMMENT_LIKED'],
  AUDIT_RESULT: ['AUDIT_RESULT', 'POST_CONTENT_HANDLED', 'POST_REPORT_RESOLVED'],
  SYSTEM: ['SYSTEM'],
  LEARNING_TASK: [
    'LEARNING_TASK_ASSIGNED',
    'LEARNING_TASK_ASSIGNMENT_ADDED',
    'LEARNING_TASK_FIRST_DEADLINE_REMINDER',
    'LEARNING_TASK_REVIEW_APPROVED',
    'LEARNING_TASK_REVIEW_REJECTED',
    'LEARNING_TASK_SUPPLEMENT_DEADLINE_REMINDER',
    'LEARNING_TASK_DEADLINE_CHANGED',
    'LEARNING_TASK_CANCELLED',
    'LEARNING_TASK_ASSIGNMENT_REVOKED',
  ],
  POINTS: [
    'POINT_APPLICATION_APPROVED',
    'POINT_APPLICATION_REJECTED',
    'POINT_GRANT_REVERSED',
    'POINT_GRANT_CORRECTED',
  ],
};
export interface NotificationPreferenceRow {
  key: string;
  category: NotificationCategory;
  categoryLabel: string;
  channel: NotificationChannel;
  channelLabel: string;
  enabled: boolean;
  capabilityText: string;
}
export interface NotificationPreferenceSnapshot {
  defaultVersion: string;
  rows: NotificationPreferenceRow[];
  evaluatedAt: string;
}
const keyOf = (category: string, channel: string) => `${category}:${channel}`;

const preferenceMap = (preferences: NotificationPreferences) => {
  if (
    (preferences as Partial<NotificationPreferences> | null)?.defaultVersion !== '1' ||
    !Array.isArray(preferences.items)
  ) {
    throw new Error('通知设置暂不可用');
  }
  const map = new Map<string, NotificationPreferences['items'][number]>();
  for (const item of preferences.items) {
    const key = keyOf(item.category, item.channel);
    if (map.has(key) || typeof item.enabled !== 'boolean' || typeof item.source !== 'string') {
      throw new Error('通知设置暂不可用');
    }
    map.set(key, item);
  }
  for (const category of NOTIFICATION_CATEGORIES) {
    for (const channel of CHANNELS) {
      if (!map.has(keyOf(category.value, channel))) throw new Error('通知设置暂不可用');
    }
  }
  return map;
};

export const buildPreferenceSnapshot = (
  preferences: NotificationPreferences,
  capabilities: NotificationChannelCapabilities,
): NotificationPreferenceSnapshot => {
  const preferencesByKey = preferenceMap(preferences);
  if (
    !(capabilities as NotificationChannelCapabilities | null) ||
    !Array.isArray(capabilities.items) ||
    typeof capabilities.evaluatedAt !== 'string'
  ) {
    throw new Error('通知设置暂不可用');
  }
  const capabilityMap = new Map<string, NotificationChannelCapabilities['items'][number]>();
  for (const item of capabilities.items) {
    const key = keyOf(item.notificationType, item.channel);
    if (
      capabilityMap.has(key) ||
      typeof item.available !== 'boolean' ||
      typeof item.permission !== 'string' ||
      !Array.isArray(item.unavailableReasons) ||
      item.unavailableReasons.some((reason) => typeof reason !== 'string')
    ) {
      throw new Error('通知设置暂不可用');
    }
    capabilityMap.set(key, item);
  }
  for (const category of NOTIFICATION_CATEGORIES) {
    for (const type of TYPES[category.value]) {
      for (const channel of CHANNELS) {
        if (capabilityMap.get(keyOf(type, channel))?.category !== category.value) {
          throw new Error('通知设置暂不可用');
        }
      }
    }
  }
  const rows = NOTIFICATION_CATEGORIES.flatMap((category) =>
    CHANNELS.map((channel) => {
      const preference = preferencesByKey.get(keyOf(category.value, channel));
      if (!preference) throw new Error('通知设置暂不可用');
      const items = capabilities.items.filter(
        (item) => item.category === category.value && item.channel === channel,
      );
      const ready = items.filter(
        (item) =>
          item.available &&
          item.unavailableReasons.length === 0 &&
          ['NOT_REQUIRED', 'GRANTED', 'PROVIDER_VERIFIED_AT_SEND'].includes(item.permission),
      ).length;
      return {
        key: `${category.value}__${channel}`,
        category: category.value,
        categoryLabel: category.label,
        channel,
        channelLabel: channel === 'IN_APP' ? '站内消息' : '微信提醒',
        enabled: preference.enabled,
        capabilityText: ready === items.length ? '' : ready > 0 ? '部分提醒暂不可用' : '暂不可用',
      };
    }),
  );
  return {
    defaultVersion: preferences.defaultVersion,
    rows,
    evaluatedAt: capabilities.evaluatedAt,
  };
};

export const getNotificationPreferenceSnapshot = async () => {
  const [preferences, capabilities] = await Promise.all([
    api.notify.getPreferences(),
    api.notify.getChannelCapabilities(),
  ]);
  return buildPreferenceSnapshot(preferences, capabilities);
};

export const updateNotificationPreferences = async (
  snapshot: NotificationPreferenceSnapshot,
  changes: UpdateNotificationPreferences['changes'],
): Promise<NotificationPreferenceSnapshot> => {
  const preferences = await api.notify.batchUpdatePreferences({ changes });
  const map = preferenceMap(preferences);
  return {
    ...snapshot,
    defaultVersion: preferences.defaultVersion,
    rows: snapshot.rows.map((row) => {
      const preference = map.get(keyOf(row.category, row.channel));
      if (!preference) throw new Error('通知设置暂不可用');
      return { ...row, enabled: preference.enabled };
    }),
  };
};
export const getNotificationChannelCapabilities = () => api.notify.getChannelCapabilities();
export const isNotificationPreferencesUnavailable = (error: unknown) =>
  isHttpError(error) && error.statusCode === 503;
