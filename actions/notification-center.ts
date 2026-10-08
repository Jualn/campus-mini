import config from '../config/index';
import * as notifications from '../services/notification';
import { eventBus, EVENTS } from '../utils/event-bus';
import { getUserId, isLoggedIn } from '../stores/helper';
import { authReady, ensureLogin } from './auth';
import { navigateNotificationTarget } from '../utils/notification-target';
import { showErrorToast } from '../utils/notify';
import type { NotificationPreview, NotificationTarget } from '../types/notification-contract';
import type { BannerMessage } from '../types/business';

let foreground = false;
let session = 0;
let account = getUserId();
let accountRevision = 0;
let unreadCount = 0;
let unreadKnown = false;
let cursor: string | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let polling = false;
let intervalMs = config.notificationPollIntervalMs;
let bound = false;
const isForeground = () => foreground;
const isForegroundSession = (generation: number) => foreground && generation === session;
// Serialize summaries and read writes so older snapshots cannot overwrite newer Badge state.
let queue: Promise<unknown> = Promise.resolve();
const suppressedNotificationIds = new Set<string>();
let pendingEntry: { id: string; running: boolean } | undefined;
const failedReads = new Set<string>();

export const getUnreadCount = () => unreadCount;
export const isUnreadKnown = () => unreadKnown;
export const hasFailedReads = () => failedReads.size > 0;
const publishCount = (count: number, known = true) => {
  unreadCount = count;
  unreadKnown = known;
  eventBus.emit(EVENTS.NOTIFY_UNREAD_CHANGE, count);
};

const syncAccount = () => {
  const next = getUserId();
  if (account === next) return;
  account = next;
  accountRevision += 1;
  cursor = undefined;
  suppressedNotificationIds.clear();
  failedReads.clear();
  // Only the unverified external entry may be associated with the newly authenticated user.
  if (pendingEntry) suppressedNotificationIds.add(pendingEntry.id);
  publishCount(0, false);
  eventBus.emit(EVENTS.NOTIFY_LIST_REFRESH);
};

const ordered = <T>(work: (isCurrent: () => boolean) => Promise<T>): Promise<T> => {
  syncAccount();
  const owner = account;
  const revision = accountRevision;
  const isCurrent = () => Boolean(owner && owner === getUserId() && revision === accountRevision);
  const task = queue
    .catch(() => undefined)
    .then(async () => {
      if (!isCurrent()) throw new Error('登录身份已改变，请重新加载消息');
      const result = await work(isCurrent);
      if (!isCurrent()) throw new Error('登录身份已改变，请重新加载消息');
      return result;
    });
  queue = task.catch(() => undefined);
  return task;
};

export const markRead = (ids: string[]) =>
  ordered(async (isCurrent) => {
    const result = await notifications.batchRead(ids);
    if (isCurrent()) {
      publishCount(result.unreadCount);
      ids.forEach((id) => failedReads.delete(id));
      eventBus.emit(EVENTS.NOTIFY_LIST_REFRESH, ids);
    }
    return result;
  });

export const markReadThrough = (throughCursor: string) =>
  ordered(async (isCurrent) => {
    const result = await notifications.readThrough(throughCursor);
    if (isCurrent()) {
      publishCount(result.unreadCount);
      eventBus.emit(EVENTS.NOTIFY_LIST_REFRESH);
    }
    return result;
  });

export const retryFailedReads = async () => {
  syncAccount();
  const ids = [...failedReads];
  for (let offset = 0; offset < ids.length; offset += 50) {
    await markRead(ids.slice(offset, offset + 50));
  }
};

export const openNotification = async (item: { id: string; target?: NotificationTarget }) => {
  syncAccount();
  const owner = getUserId();
  const revision = accountRevision;
  const generation = session;
  suppressedNotificationIds.add(item.id);
  try {
    await markRead([item.id]);
  } catch (err) {
    if (owner !== getUserId() || revision !== accountRevision) return;
    failedReads.add(item.id);
    eventBus.emit(EVENTS.NOTIFY_LIST_REFRESH);
    showErrorToast(err, { fallback: '已读同步失败，可在消息中心重试' });
  }
  if (owner !== getUserId() || revision !== accountRevision || !isForegroundSession(generation))
    return;
  try {
    await navigateNotificationTarget(item.target);
  } catch (err) {
    showErrorToast(err, { fallback: '暂时无法打开详情' });
  }
};

const toBanner = (preview: NotificationPreview): BannerMessage => ({
  id: preview.id,
  title: preview.title,
  content: preview.body ?? '',
  type: 'system',
  tagText: '通知',
  icon: '/assets/icons/common/message_center.svg',
  semanticTarget: preview.target,
  structured: true,
});

export const pollOnce = async () => {
  if (!foreground || polling || !isLoggedIn()) return;
  syncAccount();
  const generation = session;
  const afterCursor = cursor;
  polling = true;
  try {
    await ordered(async (isCurrent) => {
      if (!isForegroundSession(generation)) return;
      const result = await notifications.getSummary(afterCursor);
      if (!foreground || generation !== session || !isCurrent()) return;
      publishCount(result.unreadCount);
      cursor = result.headCursor;
      const preview = result.latestNewNotification;
      if (
        afterCursor &&
        result.newCount > 0 &&
        preview &&
        !suppressedNotificationIds.has(preview.id)
      ) {
        suppressedNotificationIds.add(preview.id);
        eventBus.emit(EVENTS.NOTIFY_BANNER_SHOW, toBanner(preview));
      }
    });
  } catch (err) {
    if (
      isForeground() &&
      generation === session &&
      notifications.isInvalidNotificationCursor(err)
    ) {
      cursor = undefined;
    }
    // Transient failure leaves Badge untouched; a later scheduled GET may recover.
  } finally {
    polling = false;
    if (isForeground()) {
      if (generation !== session) void pollOnce();
      else schedule();
    }
  }
};

const schedule = () => {
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void pollOnce();
  }, intervalMs);
};

export const refreshUnreadCount = () =>
  ordered(async (isCurrent) => {
    const result = await notifications.getSummary();
    if (isCurrent()) publishCount(result.unreadCount);
    // Badge refresh does not replace the established foreground stream boundary.
    return result.unreadCount;
  });

const processExternalEntry = async () => {
  const entry = pendingEntry;
  if (!entry || entry.running || !foreground) return;
  entry.running = true;
  try {
    await authReady;
    if (pendingEntry !== entry || !isForeground()) return;
    await ensureLogin();
    syncAccount();
    const owner = getUserId();
    const revision = accountRevision;
    const item = await notifications.getNotification(entry.id);
    if (
      pendingEntry !== entry ||
      !isForeground() ||
      owner !== getUserId() ||
      revision !== accountRevision
    )
      return;
    pendingEntry = undefined;
    await openNotification(item);
  } catch (err) {
    if (pendingEntry === entry) {
      pendingEntry = undefined;
      showErrorToast(err, { fallback: '这条通知暂不可用' });
    }
  } finally {
    entry.running = false;
    if (isForeground() && pendingEntry === entry) void processExternalEntry();
  }
};

export const receiveExternalEntry = (query?: Record<string, unknown>) => {
  const value = query?.notificationId;
  if (typeof value !== 'string' || !value || value.length > 128) return;
  suppressedNotificationIds.add(value);
  pendingEntry = { id: value, running: false };
  if (foreground) void processExternalEntry();
};

const bindEvents = () => {
  if (bound) return;
  bound = true;
  eventBus.on(EVENTS.LOGIN_SUCCESS, () => {
    syncAccount();
    if (foreground) {
      void pollOnce();
      void processExternalEntry();
    }
  });
  eventBus.on(EVENTS.LOGOUT, () => {
    pendingEntry = undefined;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    syncAccount();
    cursor = undefined;
    suppressedNotificationIds.clear();
    failedReads.clear();
    publishCount(0, false);
    eventBus.emit(EVENTS.NOTIFY_BANNER_CLEAR);
  });
  eventBus.on(EVENTS.NOTIFY_BANNER_TAP, (item) => {
    if (item.structured && item.id) {
      void openNotification({ id: item.id, target: item.semanticTarget });
    }
  });
};

export const start = (options?: { intervalMs?: number }) => {
  bindEvents();
  if (options?.intervalMs) intervalMs = Math.max(5000, options.intervalMs);
  if (foreground) return;
  foreground = true;
  session += 1;
  cursor = undefined;
  syncAccount();
  void pollOnce();
  void processExternalEntry();
};

export const stop = () => {
  foreground = false;
  session += 1;
  cursor = undefined;
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  eventBus.emit(EVENTS.NOTIFY_BANNER_CLEAR);
  // Suppression survives temporary hiding in this login session, without persistence.
};
