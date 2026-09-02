import * as messageService from '../services/message';
import type { NotificationPageQuery } from '../types/api';
import type { MessageItem } from '../types/business';

const shownBannerIds = new Set<string>();

export type UnreadBannerOptions = Omit<
  Parameters<typeof messageService.getUnreadBannerMessages>[0],
  'excludeIds'
> & {
  dedupe?: boolean;
};

export const getMessagePageCopy = () => messageService.getMessagePageCopy();

export const resolveNotificationRoute = (
  targetType?: string | number | null,
  targetId?: string | number | null,
) => messageService.resolveNotificationRoute(targetType, targetId);

export const getFilterTabs = (messages: MessageItem[] = []) =>
  messageService.getFilterTabs(messages);

export const applyMessageFilter = (messages: MessageItem[] = [], activeFilter = 'all') =>
  messageService.applyMessageFilter(messages, activeFilter);

export const getUnreadCount = () => messageService.getUnreadCount();

export const getUnreadMessages = (query?: NotificationPageQuery) =>
  messageService.getUnreadMessages(query);

export const getMessageFeedData = (
  query?: Parameters<typeof messageService.getMessageFeedData>[0],
) => messageService.getMessageFeedData(query);

export const getUnreadBannerMessages = (options: UnreadBannerOptions = {}) => {
  const { dedupe = true, ...serviceOptions } = options;

  return messageService
    .getUnreadBannerMessages({
      ...serviceOptions,
      excludeIds: dedupe ? shownBannerIds : undefined,
    })
    .then((messages) => {
      if (dedupe) {
        messages.forEach((message) => {
          const ids = message.sourceIds ?? (message.id ? [message.id] : []);
          ids.forEach((id) => shownBannerIds.add(id));
        });
      }

      return messages;
    });
};

export const markMessageAsRead = (messageId: string): Promise<void> =>
  messageService.markMessageAsRead(messageId);

export const markAllMessagesAsRead = async (): Promise<void> => {
  await messageService.markAllMessagesAsRead();
  shownBannerIds.clear();
};

export const resetNotificationBannerCache = (): void => {
  shownBannerIds.clear();
};
