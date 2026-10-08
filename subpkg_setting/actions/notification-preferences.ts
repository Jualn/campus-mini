import { eventBus, EVENTS } from '../../utils/event-bus';
import { getUserId } from '../../stores/helper';
import * as preferenceService from '../services/notification-preferences';
import type { NotificationPreferenceSnapshot } from '../services/notification-preferences';
import type { UpdateNotificationPreferences } from '../../types/api';

let snapshot: NotificationPreferenceSnapshot | null = null;
let ownerUserId: string | null = null;
let updateInFlight = false;

export const peekNotificationPreferences = () =>
  ownerUserId && ownerUserId === getUserId() ? snapshot : null;

export const getNotificationPreferences = async (options: { force?: boolean } = {}) => {
  const currentUserId = getUserId();
  if (snapshot && ownerUserId === currentUserId && !options.force) return snapshot;
  const nextSnapshot = await preferenceService.getNotificationPreferenceSnapshot();
  if (getUserId() !== currentUserId) throw new Error('登录状态已变化，请重试');
  snapshot = nextSnapshot;
  ownerUserId = currentUserId;
  return snapshot;
};

export const clearNotificationPreferences = () => {
  snapshot = null;
  ownerUserId = null;
};

export const updateNotificationPreference = async (
  change: UpdateNotificationPreferences['changes'][number],
) => {
  if (updateInFlight) throw new Error('通知偏好正在保存，请稍候');
  const currentUserId = getUserId();
  const currentSnapshot = peekNotificationPreferences();
  if (!currentSnapshot) throw new Error('通知偏好尚未加载，请重试');

  updateInFlight = true;
  try {
    const nextSnapshot = await preferenceService.updateNotificationPreferences(currentSnapshot, [
      change,
    ]);
    if (getUserId() !== currentUserId) throw new Error('登录状态已变化，请重试');
    snapshot = nextSnapshot;
    ownerUserId = currentUserId;
    return nextSnapshot;
  } finally {
    updateInFlight = false;
  }
};

export const isNotificationPreferencesUnavailable =
  preferenceService.isNotificationPreferencesUnavailable;

eventBus.on(EVENTS.LOGOUT, clearNotificationPreferences);
