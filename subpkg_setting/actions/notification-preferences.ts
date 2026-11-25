import { eventBus, EVENTS } from '../../utils/event-bus';
import { getUserId } from '../../stores/helper';
import * as preferenceService from '../services/notification-preferences';
import type { NotificationPreferenceSnapshot } from '../services/notification-preferences';
import type { UpdateNotificationPreferences } from '../../types/api';

let snapshot: NotificationPreferenceSnapshot | null = null;
let ownerUserId: string | null = null;
let generation = 0;
let readSequence = 0;
let writeVersion = 0;
let updateToken: object | null = null;

export const getNotificationSession = () => generation;
export const peekNotificationPreferences = () =>
  ownerUserId && ownerUserId === getUserId() ? snapshot : null;
export const clearNotificationPreferences = () => {
  generation++;
  readSequence++;
  snapshot = null;
  ownerUserId = null;
  updateToken = null;
};
export const getNotificationPreferences = async (options: { force?: boolean } = {}) => {
  const userId = getUserId();
  const epoch = generation;
  if (!userId) throw new Error('请先登录');
  if (snapshot && ownerUserId === userId && !options.force) return snapshot;
  const sequence = ++readSequence;
  const version = writeVersion;
  const next = await preferenceService.getNotificationPreferenceSnapshot();
  if (getUserId() !== userId || generation !== epoch || sequence !== readSequence) {
    throw new Error('通知设置已变化，请重试');
  }
  if (version !== writeVersion) {
    const current = peekNotificationPreferences();
    if (!current) throw new Error('通知设置已变化，请重试');
    return current;
  }
  snapshot = next;
  ownerUserId = userId;
  return next;
};
export const updateNotificationPreference = async (
  change: UpdateNotificationPreferences['changes'][number],
) => {
  if (updateToken) throw new Error('正在保存，请稍候');
  const current = peekNotificationPreferences();
  if (!current) throw new Error('请先加载通知设置');
  const userId = getUserId();
  const epoch = generation;
  const token = {};
  updateToken = token;
  writeVersion++;
  try {
    const next = await preferenceService.updateNotificationPreferences(current, [change]);
    if (getUserId() !== userId || epoch !== generation) throw new Error('登录状态已变化，请重试');
    snapshot = next;
    ownerUserId = userId;
    return next;
  } finally {
    if (epoch === generation) writeVersion++;
    if (updateToken === token) updateToken = null;
  }
};
export const isNotificationPreferencesUnavailable =
  preferenceService.isNotificationPreferencesUnavailable;
eventBus.on(EVENTS.LOGOUT, clearNotificationPreferences);
eventBus.on(EVENTS.LOGIN_SUCCESS, clearNotificationPreferences);
