import { api } from '../../services/api';
import { isHttpError } from '../../utils/error';
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationChannelCapabilities,
  NotificationChannelCapabilityItem,
  NotificationPreferences,
  UpdateNotificationPreferences,
} from '../../types/api';

export interface NotificationPreferenceRow {
  key: string;
  category: NotificationCategory;
  categoryLabel: string;
  channel: NotificationChannel;
  channelLabel: string;
  enabled: boolean;
  source: string;
  sourceText: string;
  legacyMigration: boolean;
  capabilityText: string;
  capabilityTone: 'available' | 'partial' | 'unavailable' | 'unknown';
}

export interface NotificationPreferenceSnapshot {
  defaultVersion: string;
  rows: NotificationPreferenceRow[];
  evaluatedAt: string;
}

const CATEGORIES: { value: NotificationCategory; label: string }[] = [
  { value: 'ACTIVITY', label: '活动通知' },
  { value: 'PUBLIC_EVENT', label: '公共事项通知' },
];

const CHANNELS: { value: NotificationChannel; label: string }[] = [
  { value: 'IN_APP', label: '站内消息' },
  { value: 'WECHAT_MINI_PROGRAM', label: '微信小程序' },
  { value: 'WECHAT_OFFICIAL_ACCOUNT', label: '微信服务号' },
];

const preferenceKey = (category: string, channel: string) => `${category}:${channel}`;
const rowKey = (category: string, channel: string) => `${category}__${channel}`;

const getPreferenceSourceText = (source: string) => {
  switch (source) {
    case 'SYSTEM_DEFAULT':
      return '系统默认';
    case 'USER_OVERRIDE':
      return '个人设置';
    case 'LEGACY_MIGRATION':
      return '沿用旧设置';
    default:
      return '当前有效设置';
  }
};

const isDeliverable = (item: NotificationChannelCapabilityItem) =>
  item.available &&
  item.unavailableReasons.length === 0 &&
  (item.permission === 'NOT_REQUIRED' ||
    item.permission === 'GRANTED' ||
    item.permission === 'PROVIDER_VERIFIED_AT_SEND');

const summarizeCapabilities = (
  items: NotificationChannelCapabilityItem[],
): Pick<NotificationPreferenceRow, 'capabilityText' | 'capabilityTone'> => {
  if (!items.length) return { capabilityText: '能力状态未知', capabilityTone: 'unknown' };

  const readyCount = items.filter(isDeliverable).length;
  const providerVerifiedAtSend = items.some(
    (item) => isDeliverable(item) && item.permission === 'PROVIDER_VERIFIED_AT_SEND',
  );
  if (readyCount === items.length) {
    return providerVerifiedAtSend
      ? { capabilityText: '当前可用', capabilityTone: 'available' }
      : { capabilityText: '当前可用', capabilityTone: 'available' };
  }
  if (readyCount > 0) {
    return providerVerifiedAtSend
      ? { capabilityText: '部分通知可用', capabilityTone: 'partial' }
      : { capabilityText: '部分通知类型可用', capabilityTone: 'partial' };
  }

  const configuredReasons = new Set(
    items.filter((item) => item.available).flatMap((item) => item.unavailableReasons),
  );
  if (configuredReasons.has('IDENTITY_REQUIRED')) {
    return { capabilityText: '需先完成对应微信身份绑定', capabilityTone: 'unavailable' };
  }
  if (configuredReasons.has('PERMISSION_REQUIRED')) {
    return { capabilityText: '尚未获得对应通知授权', capabilityTone: 'unavailable' };
  }
  if (configuredReasons.has('PERMISSION_UNKNOWN')) {
    return { capabilityText: '授权状态暂时无法确认', capabilityTone: 'unknown' };
  }

  const reasons = new Set(items.flatMap((item) => item.unavailableReasons));
  if (reasons.has('NOT_CONFIGURED')) {
    return { capabilityText: '通知通道尚未配置', capabilityTone: 'unavailable' };
  }
  if (reasons.has('CHANNEL_DISABLED')) {
    return { capabilityText: '通知通道暂未启用', capabilityTone: 'unavailable' };
  }
  if (reasons.has('IDENTITY_REQUIRED')) {
    return { capabilityText: '需先完成对应微信身份绑定', capabilityTone: 'unavailable' };
  }
  if (reasons.has('PERMISSION_REQUIRED')) {
    return { capabilityText: '尚未获得对应通知授权', capabilityTone: 'unavailable' };
  }
  if (reasons.has('PERMISSION_UNKNOWN')) {
    return { capabilityText: '授权状态暂时无法确认', capabilityTone: 'unknown' };
  }
  return { capabilityText: '当前渠道暂不可用', capabilityTone: 'unavailable' };
};

export const buildPreferenceSnapshot = (
  preferences: NotificationPreferences,
  capabilities: NotificationChannelCapabilities,
): NotificationPreferenceSnapshot => {
  const preferenceMap = new Map(
    preferences.items.map((item) => [preferenceKey(item.category, item.channel), item]),
  );

  const rows = CATEGORIES.flatMap((category) =>
    CHANNELS.map((channel) => {
      const key = preferenceKey(category.value, channel.value);
      const preference = preferenceMap.get(key);
      if (!preference) throw new Error(`通知偏好响应缺少组合 ${key}`);

      const capabilityItems = capabilities.items.filter(
        (item) => item.category === category.value && item.channel === channel.value,
      );

      return {
        key: rowKey(category.value, channel.value),
        category: category.value,
        categoryLabel: category.label,
        channel: channel.value,
        channelLabel: channel.label,
        enabled: preference.enabled,
        source: preference.source,
        sourceText: getPreferenceSourceText(preference.source),
        legacyMigration: preference.source === 'LEGACY_MIGRATION',
        ...summarizeCapabilities(capabilityItems),
      };
    }),
  );

  return {
    defaultVersion: preferences.defaultVersion,
    evaluatedAt: capabilities.evaluatedAt,
    rows,
  };
};

export const getNotificationPreferenceSnapshot = async () => {
  const [preferences, capabilities] = await Promise.all([
    api.notify.getPreferences(),
    api.notify.getChannelCapabilities(),
  ]);
  return buildPreferenceSnapshot(preferences, capabilities);
};

const applyPreferenceRepresentation = (
  snapshot: NotificationPreferenceSnapshot,
  preferences: NotificationPreferences,
): NotificationPreferenceSnapshot => {
  const preferenceMap = new Map(
    preferences.items.map((item) => [preferenceKey(item.category, item.channel), item]),
  );
  const rows = snapshot.rows.map((row) => {
    const preference = preferenceMap.get(preferenceKey(row.category, row.channel));
    if (!preference) {
      throw new Error(`通知偏好更新响应缺少组合 ${row.category}:${row.channel}`);
    }
    return {
      ...row,
      enabled: preference.enabled,
      source: preference.source,
      sourceText: getPreferenceSourceText(preference.source),
      legacyMigration: preference.source === 'LEGACY_MIGRATION',
    };
  });
  if (preferenceMap.size !== rows.length) {
    throw new Error('通知偏好更新响应包含未知或重复组合');
  }
  return { ...snapshot, defaultVersion: preferences.defaultVersion, rows };
};

export const updateNotificationPreferences = async (
  snapshot: NotificationPreferenceSnapshot,
  changes: UpdateNotificationPreferences['changes'],
) => {
  const preferences = await api.notify.batchUpdatePreferences({ changes });
  return applyPreferenceRepresentation(snapshot, preferences);
};

export const getNotificationChannelCapabilities = () => api.notify.getChannelCapabilities();

export const isNotificationPreferencesUnavailable = (err: unknown) => {
  if (!isHttpError(err) || err.statusCode !== 503) return false;
  if (!err.raw || typeof err.raw !== 'object') return true;
  const problemType = (err.raw as { type?: unknown }).type;
  return (
    typeof problemType !== 'string' ||
    problemType === '/problems/notification-preferences-unavailable'
  );
};
