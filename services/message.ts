// message.ts
/**
 * 消息 / 通知服务
 *
 * 当前文件先做“文件内分层”，暂不拆分文件：
 * 1. 上半部分：配置、映射、转换、分组、筛选等纯数据处理
 * 2. 下半部分：页面 / 弹窗可直接调用的 service 方法
 *
 * 对接接口由 api.notify 统一封装：
 * - GET /v1/users/me/notifications
 * - GET /v1/users/me/notifications/unread-count
 * - PUT /v1/users/me/notifications/{notificationId}/read-state
 * - POST /v1/users/me/notifications:mark-all-read
 */

import { api } from './api';
import { formatTime, TimeStyle, parseDate } from '../utils/time-util';
import { TARGET_TYPES } from '../utils/constants';
import {
  ROUTES,
  buildActivityDetailRoute,
  buildPublicEventDetailRoute,
  buildPostDetailRoute,
  buildUserProfileRoute,
} from '../utils/routes';
import type { InboxNotification, NotificationPageQuery } from '../types/api';
import type {
  FilterTab,
  MessageFeedData,
  MessageItem,
  MessageType,
  ServiceCursorPage,
} from '../types/business';

/* -------------------------------------------------------------------------- */
/* 1. 类型与常量配置                                                           */
/* -------------------------------------------------------------------------- */

interface TypeConfig {
  typeLabel: string;
  actionLabel: string;
  urgent: boolean;
  icon: string;
  accentClass: string;
}

export type NotificationRouteMethod = 'navigateTo' | 'switchTab';

export interface NotificationRoute {
  url: string;
  method: NotificationRouteMethod;
}

export interface NotificationBannerMessage {
  id?: string;
  type?: MessageType;
  icon?: string;
  tagText?: string;
  title: string;
  content?: string;
  targetType?: string;
  targetId?: string;
  notificationCount?: number;
  isAggregate?: boolean;
  accentClass?: string;
  routeUrl?: string;
  routeMethod?: NotificationRouteMethod;
  /** 聚合消息所包含的原始通知 ID，供 Action 维护去重缓存。 */
  sourceIds?: string[];
}

export interface MessagePageCopy {
  pageTitle: string;
  markAllReadText: string;
  pendingSectionTitle: string;
  olderSectionTitle: string;
  emptyIcon: string;
  emptyTitle: string;
  emptyDesc: string;
  markAllReadToast: string;
  loadErrorToast: string;
}

interface MessageFeedServiceData extends MessageFeedData {
  hasMore: boolean;
  nextCursor?: string;
  pageCopy: MessagePageCopy;
}

export interface GetUnreadBannerMessagesOptions {
  /** 本次最多拉取多少条未读通知 */
  pageSize?: number;
  /** 超过多少条后改为聚合弹窗 */
  aggregateThreshold?: number;
  /** 外部已获取的未读数，传入可避免重复请求 */
  unreadCount?: number;
  /** 由 Action 注入的已展示通知集合；Service 本身不持有运行时缓存。 */
  excludeIds?: ReadonlySet<string>;
}

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_BANNER_PAGE_SIZE = 10;
const DEFAULT_AGGREGATE_THRESHOLD = 3;

const MESSAGE_PAGE_COPY: MessagePageCopy = {
  pageTitle: '消息中心',
  markAllReadText: '全部已读',
  pendingSectionTitle: '待处理',
  olderSectionTitle: '更早',
  emptyIcon: '/assets/icons/common/notification_empty.svg',
  emptyTitle: '暂无通知',
  emptyDesc: '新消息将在这里显示',
  markAllReadToast: '已全部标记已读',
  loadErrorToast: '消息加载失败，请稍后重试',
};

const TYPE_CONFIG: Record<MessageType, TypeConfig> = {
  system: {
    typeLabel: '系统公告',
    actionLabel: '',
    urgent: false,
    icon: '/assets/icons/common/system_notice.svg',
    accentClass: 'banner--system',
  },
  activity: {
    typeLabel: '活动提醒',
    actionLabel: '去查看',
    urgent: true,
    icon: '/assets/icons/common/activity.svg',
    accentClass: 'banner--activity',
  },
  // exam: {
  //   typeLabel: '考试提醒',
  //   actionLabel: '查看详情',
  //   urgent: true,
  //   icon: '/assets/icons/common/exam.svg',
  //   accentClass: 'banner--exam',
  // },
  exam: {
    typeLabel: '考试提醒',
    actionLabel: '查看详情',
    urgent: true,
    icon: '/assets/icons/common/exam.svg',
    accentClass: 'banner--exam',
  },
  interaction: {
    typeLabel: '互动消息',
    actionLabel: '',
    urgent: false,
    icon: '/assets/icons/common/interaction.svg',
    accentClass: 'banner--interaction',
  },
};

const NOTIFY_TYPE_TO_MESSAGE_TYPE: Partial<Record<string, MessageType>> = {
  // 字符串枚举兼容
  SYSTEM: 'system',
  SYSTEM_NOTICE: 'system',
  SYSTEM_BROADCAST: 'system',
  AUDIT_RESULT: 'system',

  ACTIVITY: 'activity',
  ACTIVITY_REMIND: 'activity',
  ACTIVITY_NOTICE: 'activity',
  ACTIVITY_START_REMINDER: 'activity',
  ACTIVITY_REGISTRATION_DEADLINE_REMINDER: 'activity',
  ACTIVITY_CANCELLED: 'activity',
  ACTIVITY_TIME_CHANGED: 'activity',
  ACTIVITY_LOCATION_CHANGED: 'activity',
  ACTIVITY_ENDED_EARLY: 'activity',

  // EXAM: 'exam',
  // EXAM_REMIND: 'exam',
  // EXAM_NOTICE: 'exam',
  EXAM: 'exam',
  EXAM_REMIND: 'exam',
  EXAM_NOTICE: 'exam',
  PUBLIC_EVENT_START_REMINDER: 'exam',
  PUBLIC_EVENT_REGISTRATION_DEADLINE_REMINDER: 'exam',
  PUBLIC_EVENT_CANCELLED: 'exam',
  PUBLIC_EVENT_TIME_CHANGED: 'exam',
  PUBLIC_EVENT_LOCATION_CHANGED: 'exam',

  INTERACTION: 'interaction',
  COMMENTED_ME: 'interaction',
  REPLIED_ME: 'interaction',
  LIKED_ME: 'interaction',
  FOLLOWED_ME: 'interaction',

  // 数值编码兼容：1-评论 2-回复 3-点赞 4-活动提醒 5-考试提醒 6-审核结果 7-系统广播
  '1': 'interaction',
  '2': 'interaction',
  '3': 'interaction',
  '4': 'activity',
  // '5': 'exam',
  '5': 'exam',
  '6': 'system',
  '7': 'system',
  '8': 'activity',
  '9': 'activity',
  '10': 'exam',
  '11': 'exam',
};

const NOTIFY_TYPE_OVERRIDES: Partial<Record<string, Partial<TypeConfig>>> = {
  AUDIT_RESULT: {
    typeLabel: '审核结果',
    icon: '/assets/icons/common/system_notice.svg',
  },

  COMMENTED_ME: {
    typeLabel: '评论',
    icon: '/assets/icons/common/interaction.svg',
  },
  REPLIED_ME: {
    typeLabel: '回复',
    icon: '/assets/icons/common/interaction.svg',
  },
  LIKED_ME: {
    typeLabel: '点赞',
    icon: '/assets/icons/common/interaction.svg',
  },
  FOLLOWED_ME: {
    typeLabel: '关注',
    icon: '/assets/icons/common/interaction.svg',
  },

  '1': {
    typeLabel: '评论',
    icon: '/assets/icons/common/interaction.svg',
  },
  '2': {
    typeLabel: '回复',
    icon: '/assets/icons/common/interaction.svg',
  },
  '3': {
    typeLabel: '点赞',
    icon: '/assets/icons/common/interaction.svg',
  },
  '6': {
    typeLabel: '审核结果',
    icon: '/assets/icons/common/system_notice.svg',
  },
};

const FILTER_TABS: FilterTab[] = [
  {
    id: 'all',
    icon: '/assets/icons/common/message_center.svg',
    label: '全部',
  },
  {
    id: 'system',
    icon: '/assets/icons/common/system_notice.svg',
    label: '系统',
  },
  {
    id: 'activity',
    icon: '/assets/icons/common/activity.svg',
    label: '活动',
  },
  {
    id: 'exam',
    icon: '/assets/icons/common/exam.svg',
    label: '公共事项',
  },
  {
    id: 'interaction',
    icon: '/assets/icons/common/interaction.svg',
    label: '互动',
  },
];

/* -------------------------------------------------------------------------- */
/* 2. 基础归一化与映射                                                         */
/* -------------------------------------------------------------------------- */

const normalizeEnumKey = (value?: string | number | null) => {
  if (typeof value === 'number') return String(value);
  return (value ?? '').trim().toUpperCase();
};

const safeText = (value?: string | null) => value?.trim() ?? '';

const resolveMessageType = (notifyType?: string | number | null): MessageType => {
  const key = normalizeEnumKey(notifyType);
  return NOTIFY_TYPE_TO_MESSAGE_TYPE[key] ?? 'system';
};

const resolveTypeConfig = (
  messageType: MessageType,
  notifyType?: string | number | null,
): TypeConfig => {
  const base = TYPE_CONFIG[messageType];
  const override = NOTIFY_TYPE_OVERRIDES[normalizeEnumKey(notifyType)] ?? {};
  return { ...base, ...override };
};

const normalizeTargetType = (value?: string | number | null): string => {
  if (typeof value === 'number') {
    const entry = Object.entries(TARGET_TYPES).find(([, target]) => target.code === value);
    if (entry) return normalizeTargetType(entry[0]);
  }

  const key = normalizeEnumKey(value);

  switch (key) {
    case 'POST':
      return 'post';
    case 'ACTIVITY':
      return 'activity';
    case 'EXAM':
    case 'PUBLIC_EVENT':
      return 'exam';
    case 'COMMENT':
      return 'comment';
    case 'NOTIFICATION':
      return 'notification';
    case 'USER':
      return 'user';
    default:
      return '';
  }
};

export const getMessagePageCopy = (): MessagePageCopy => MESSAGE_PAGE_COPY;

export const resolveNotificationRoute = (
  targetType?: string | number | null,
  targetId?: string | number | null,
): NotificationRoute | null => {
  const normalizedType = normalizeTargetType(targetType);
  const id = safeText(targetId == null ? '' : String(targetId));

  if (normalizedType === 'notification') {
    return { url: ROUTES.MESSAGE, method: 'switchTab' };
  }

  if (!normalizedType || normalizedType === 'none') return null;

  const routes: Record<string, string> = {
    activity: buildActivityDetailRoute(id),
    exam: buildPublicEventDetailRoute(id),
    post: buildPostDetailRoute(id),
    user: buildUserProfileRoute(id),
  };

  const url = routes[normalizedType];
  if (!url || !id) return null;

  return { url, method: 'navigateTo' };
};

const extractSenderInitial = (content: string) => {
  const match = /「([^」]+)」/.exec(content);
  if (match?.[1]) return match[1][0];
  return '匿';
};

const compareMessageCreatedDesc = (a: MessageItem, b: MessageItem) => {
  const aTime = parseDate(a.createdAt ? a.createdAt : '').getTime() || 0;
  const bTime = parseDate(b.createdAt ? b.createdAt : '').getTime() || 0;
  return bTime - aTime;
};

/* -------------------------------------------------------------------------- */
/* 3. Canonical InboxNotification -> 前端 MessageItem                                */
/* -------------------------------------------------------------------------- */

const mapNotificationToMessage = (item: InboxNotification): MessageItem => {
  const type = resolveMessageType(item.type);
  const config = resolveTypeConfig(type, item.type);
  const title = safeText(item.title) || config.typeLabel;
  const content = safeText(item.content);
  const displayContent = content || title;
  const createdAt = item.createdAt;
  const targetType = normalizeTargetType(item.target?.type);
  const targetId = safeText(item.target?.resourceId);
  const timeAgo = formatTime(createdAt, TimeStyle.POST);

  return {
    id: item.notificationId,
    type,
    icon: config.icon,
    title,
    content: displayContent,
    isRead: item.isRead,
    createdAt,
    targetType,
    targetId,
    timeAgo,
    shortTitle: title,
    shortContent: displayContent,
    typeLabel: config.typeLabel,
    actionLabel: config.actionLabel,
    isUrgent: config.urgent && !item.isRead,
    senderInitial: type === 'interaction' ? extractSenderInitial(displayContent) : '',
  };
};

const mapNotificationListToMessages = (list: InboxNotification[] = []) =>
  list.map(mapNotificationToMessage).sort(compareMessageCreatedDesc);

/* -------------------------------------------------------------------------- */
/* 4. 筛选、分组、区域构建                                                       */
/* -------------------------------------------------------------------------- */

const buildFilterTabs = (messages: MessageItem[] = []) => {
  const counts: Record<MessageType, number> = {
    system: 0,
    activity: 0,
    exam: 0,
    interaction: 0,
  };

  let allUnreadCount = 0;

  for (const message of messages) {
    if (!message.isRead) {
      allUnreadCount += 1;
      counts[message.type] += 1;
    }
  }

  return FILTER_TABS.map((item) => {
    if (item.id === 'all') {
      return {
        ...item,
        count: allUnreadCount,
      };
    }

    return {
      ...item,
      count: counts[item.id as MessageType],
    };
  });
};

const updateGroupState = (group: MessageItem) => {
  const children = group._grouped ?? [];
  const first = children[0];
  const last = children[children.length - 1];
  const firstTime = first.timeAgo ?? '';
  const lastTime = last.timeAgo ?? '';

  group.createdAt = first.createdAt;
  if (firstTime && lastTime && firstTime !== lastTime) {
    group.timeRange = `${firstTime}～${lastTime}`;
  } else {
    group.timeRange = firstTime || lastTime;
  }
  group.isRead = children.length > 0 ? children.every((item) => item.isRead) : true;
  group.groupTitle = children.length > 1 ? `帖子互动 · ${String(children.length)}条` : '帖子互动';
};

const createInteractionGroup = (key: string, message: MessageItem): MessageItem => {
  const group: MessageItem = {
    id: key,
    type: 'interaction',
    icon: '/assets/icons/common/interaction.svg',
    title: '',
    content: '',
    isRead: message.isRead,
    createdAt: message.createdAt,
    targetType: message.targetType,
    targetId: message.targetId,
    groupTitle: '帖子互动',
    timeRange: message.timeAgo ?? '',
    _isGroup: true,
    _grouped: [message],
  };

  updateGroupState(group);
  return group;
};

const getInteractionGroupKey = (message: MessageItem) => {
  if (message.targetId)
    return `interaction::${message.targetType || 'target'}::${message.targetId}`;

  // targetId 为空时不能合并，否则不相关互动会被错误归到一个组里
  return `interaction::single::${message.id}`;
};

const groupMessages = (messages: MessageItem[] = []) => {
  const grouped: MessageItem[] = [];
  const groupMap: Record<string, MessageItem | undefined> = {};

  for (const message of messages) {
    if (message.type !== 'interaction') {
      grouped.push(message);
      continue;
    }

    const key = getInteractionGroupKey(message);
    const existing = groupMap[key];

    if (!existing) {
      const group = createInteractionGroup(key, message);
      groupMap[key] = group;
      grouped.push(group);
      continue;
    }

    existing._grouped?.push(message);
    updateGroupState(existing);
  }

  return grouped.sort(compareMessageCreatedDesc);
};

const buildMessageSections = (messages: MessageItem[] = []) => {
  const groupedMessages = groupMessages(messages);

  const urgentMessages = groupedMessages.filter((item) => {
    if (item._isGroup) return !item.isRead;
    return !item.isRead || item.isUrgent;
  });

  const olderMessages = groupedMessages.filter((item) => {
    if (item._isGroup) return item.isRead;
    return item.isRead && !item.isUrgent;
  });

  return {
    groupedMessages,
    urgentMessages,
    olderMessages,
  };
};

export const getFilterTabs = (messages: MessageItem[] = []) => buildFilterTabs(messages);

export const applyMessageFilter = (messages: MessageItem[] = [], activeFilter = 'all') => {
  const normalizedFilter = activeFilter || 'all';
  const filtered =
    normalizedFilter === 'all'
      ? messages
      : messages.filter((message) => message.type === normalizedFilter);

  return buildMessageSections(filtered);
};

/* -------------------------------------------------------------------------- */
/* 5. 弹窗展示数据构建                                                          */
/* -------------------------------------------------------------------------- */

const toBannerMessage = (message: MessageItem): NotificationBannerMessage => {
  const route = resolveNotificationRoute(message.targetType, message.targetId);
  const config = TYPE_CONFIG[message.type];

  return {
    id: message.id,
    type: message.type,
    icon: message.icon,
    tagText: message.typeLabel,
    title: (message.title || message.typeLabel) ?? '你有一条新通知',
    content: message.content || '',
    targetType: message.targetType || 'none',
    targetId: message.targetId || '',
    accentClass: config.accentClass,
    routeUrl: route?.url,
    routeMethod: route?.method,
  };
};

const toAggregateBannerMessage = (
  messages: MessageItem[],
  totalUnread: number,
): NotificationBannerMessage => ({
  type: 'system',
  icon: '/assets/icons/common/notification_empty.svg',
  tagText: '通知',
  title: `你有 ${String(totalUnread)} 条新通知`,
  content: messages
    .slice(0, 2)
    .map((item) => item.title || item.content)
    .filter(Boolean)
    .join('、'),
  targetType: 'notification',
  targetId: '',
  notificationCount: totalUnread,
  isAggregate: true,
  accentClass: TYPE_CONFIG.system.accentClass,
  routeUrl: ROUTES.MESSAGE,
  routeMethod: 'switchTab',
  sourceIds: messages.map((item) => item.id),
});

/* -------------------------------------------------------------------------- */
/* 6. 页面 / 弹窗调用的 service 方法                                             */
/* -------------------------------------------------------------------------- */

/**
 * 获取未读消息数量。
 * 适合 App 轮询、消息页刷新、后续 tabBar badge 使用。
 */
export const getUnreadCount = async (): Promise<number> => {
  const result = await api.notify.getUnreadCount();
  return Number.isFinite(result.unreadCount) ? result.unreadCount : 0;
};

/**
 * 获取当前用户通知分页。
 * 默认只取未读，主要给弹窗或特殊场景使用。
 */
export const getUnreadMessages = async (
  options: NotificationPageQuery = {},
): Promise<ServiceCursorPage<InboxNotification>> => {
  const { pageSize = DEFAULT_PAGE_SIZE, cursor, category, isRead = false } = options;

  const page = await api.notify.getMyList({
    cursor,
    pageSize,
    category,
    isRead,
  });

  return {
    list: page.items,
    hasMore: Boolean(page.nextCursor),
    nextCursor: page.nextCursor,
  };
};

/**
 * 获取消息页完整展示数据。
 * message 页面只需要调用这个方法，不需要关心后端字段和分组逻辑。
 */
export const getMessageFeedData = async (
  options: NotificationPageQuery = {},
): Promise<MessageFeedServiceData> => {
  const [page, unreadCount] = await Promise.all([api.notify.getMyList(options), getUnreadCount()]);

  const allMessages = mapNotificationListToMessages(page.items);
  const sections = buildMessageSections(allMessages);

  return {
    allMessages,
    ...sections,
    unreadCount,
    totalCount: allMessages.length,
    filterTabs: getFilterTabs(allMessages),
    hasMore: Boolean(page.nextCursor),
    nextCursor: page.nextCursor,
    pageCopy: MESSAGE_PAGE_COPY,
  };
};

/**
 * 给全局弹窗使用：
 * 先查未读数；没有未读就不拉详情；有未读才拉未读列表。
 */
export const getUnreadBannerMessages = async (
  options: GetUnreadBannerMessagesOptions = {},
): Promise<NotificationBannerMessage[]> => {
  const {
    pageSize = DEFAULT_BANNER_PAGE_SIZE,
    aggregateThreshold = DEFAULT_AGGREGATE_THRESHOLD,
    unreadCount: knownUnread,
    excludeIds,
  } = options;

  const unreadCount = typeof knownUnread === 'number' ? knownUnread : await getUnreadCount();
  if (unreadCount <= 0) return [];

  const page = await getUnreadMessages({
    pageSize: Math.min(pageSize, unreadCount),
    isRead: false,
  });

  let messages = mapNotificationListToMessages(page.list).filter((item) => !item.isRead);
  if (excludeIds) messages = messages.filter((message) => !excludeIds.has(message.id));
  if (!messages.length) return [];

  if (messages.length > aggregateThreshold || unreadCount > aggregateThreshold) {
    return [toAggregateBannerMessage(messages, unreadCount)];
  }

  return messages.map(toBannerMessage);
};

/**
 * 单条标记已读。
 * 页面点击消息、弹窗点击消息都可以调用这个方法。
 */
export const markMessageAsRead = async (messageId: string): Promise<void> => {
  const id = safeText(messageId);
  if (!id) throw new Error('消息ID不能为空');

  await api.notify.markRead(id);
};

/**
 * 全部标记已读。
 * 消息页“全部已读”调用；调用后清理弹窗去重缓存。
 */
export const markAllMessagesAsRead = async (): Promise<void> => {
  await api.notify.markAllRead();
};
