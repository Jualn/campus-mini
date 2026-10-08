import { api } from './api';
import { isHttpError } from '../utils/error';
import type {
  NotificationItem,
  NotificationListResponse,
  NotificationListQuery,
  NotificationSummary,
  NotificationReadResult,
} from '../types/notification-contract';

const validCount = (count: unknown) =>
  typeof count === 'number' && Number.isInteger(count) && count >= 0;
const requireItem = (raw: unknown): NotificationItem => {
  const item = raw as Partial<NotificationItem> | null | undefined;
  if (
    !item ||
    typeof item.id !== 'string' ||
    !item.id ||
    typeof item.category !== 'string' ||
    typeof item.type !== 'string' ||
    !item.presentation ||
    typeof item.presentation.title !== 'string' ||
    (item.presentation.subjectTitle !== undefined &&
      typeof item.presentation.subjectTitle !== 'string') ||
    (item.presentation.quote !== undefined && typeof item.presentation.quote !== 'string') ||
    !(item.readAt === null || typeof item.readAt === 'string') ||
    typeof item.createdAt !== 'string'
  )
    throw new Error('通知服务暂未提供结构化消息');
  return item as NotificationItem;
};

export const listNotifications = async (query: NotificationListQuery = {}) => {
  const page = (await api.notify.getStructuredList({
    pageSize: 20,
    ...query,
  })) as Partial<NotificationListResponse> | null;
  if (
    page?.representation !== 'structured' ||
    !Array.isArray(page.items) ||
    typeof page.hasMore !== 'boolean' ||
    typeof page.headCursor !== 'string' ||
    !page.headCursor ||
    (page.hasMore
      ? typeof page.nextCursor !== 'string' || !page.nextCursor
      : page.nextCursor !== undefined)
  )
    throw new Error('通知服务暂未提供结构化消息');
  page.items.forEach(requireItem);
  return page as NotificationListResponse;
};

export const getNotification = async (id: string) => {
  const item = requireItem(await api.notify.getNotification(id));
  if (item.id !== id) throw new Error('通知身份不匹配');
  return item;
};

export const getSummary = async (afterCursor?: string) => {
  const result = (await api.notify.getSummary(afterCursor)) as Partial<NotificationSummary> | null;
  if (
    !result ||
    !validCount(result.unreadCount) ||
    !validCount(result.newCount) ||
    typeof result.headCursor !== 'string' ||
    !result.headCursor ||
    (result.newCount === 0
      ? result.latestNewNotification !== null
      : !result.latestNewNotification?.id || !result.latestNewNotification.title)
  )
    throw new Error('通知摘要暂不可用');
  return result as NotificationSummary;
};

const requireReadResult = (raw: unknown): NotificationReadResult => {
  const result = raw as Partial<NotificationReadResult> | null | undefined;
  if (!result || !validCount(result.unreadCount) || !validCount(result.changedCount)) {
    throw new Error('通知已读响应暂不可用');
  }
  return result as NotificationReadResult;
};

export const batchRead = async (ids: string[]) => {
  const unique = [...new Set(ids)];
  if (!unique.length || unique.length > 50 || unique.some((id) => !id)) {
    throw new Error('已读通知数量应为 1–50 条');
  }
  return requireReadResult(await api.notify.batchRead(unique));
};

export const readThrough = async (cursor: string) => {
  if (!cursor) throw new Error('请先加载消息');
  return requireReadResult(await api.notify.readThrough(cursor));
};

export const isInvalidNotificationCursor = (err: unknown) =>
  isHttpError(err) &&
  err.statusCode === 400 &&
  (err.problemType === '/problems/invalid-cursor' ||
    (err.raw as { type?: string } | undefined)?.type === '/problems/invalid-cursor');
