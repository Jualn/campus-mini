// Hand-maintained consumer types for contracts/api/schemas/notification.yaml.
export type NotificationBoxCategory = 'INTERACTION' | 'ACTIVITY' | 'SYSTEM';

export interface NotificationTarget {
  type: string;
  postId?: string;
  commentId?: string;
  activityId?: string;
  publicEventId?: string;
}

export interface NotificationItem {
  id: string;
  category: string;
  type: string;
  actor?: { userId: string; nickname: string; avatarUrl?: string };
  subject?: { type: string; resourceId: string };
  presentation: {
    title: string;
    body?: string;
    context?: string;
    subjectTitle?: string;
    quote?: string;
    thumbnailUrl?: string;
    changes?: { label: string; before: string; after: string }[];
  };
  target?: NotificationTarget;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreview {
  id: string;
  type: string;
  title: string;
  body?: string;
  target?: NotificationTarget;
  createdAt: string;
}

export interface NotificationListResponse {
  representation: 'structured';
  items: NotificationItem[];
  hasMore: boolean;
  nextCursor?: string;
  headCursor: string;
}

export interface NotificationSummary {
  unreadCount: number;
  headCursor: string;
  newCount: number;
  latestNewNotification: NotificationPreview | null;
}

export interface NotificationReadResult {
  changedCount: number;
  unreadCount: number;
}

export interface NotificationListQuery {
  boxCategory?: NotificationBoxCategory;
  cursor?: string;
  pageSize?: number;
}
