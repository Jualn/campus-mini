import type { NotificationTarget } from '../types/notification-contract';
import {
  buildActivityDetailRoute,
  buildPostDetailRoute,
  buildPublicEventDetailRoute,
} from './routes';
import { wxNavigateTo } from './wx-promise';
import { showInfoToast } from './notify';

export const resolveNotificationTarget = (target?: NotificationTarget): string | null => {
  if (!target) return null;
  switch (target.type) {
    case 'POST_DETAIL':
      return target.postId
        ? buildPostDetailRoute(target.postId) +
            (target.commentId ? `&commentId=${encodeURIComponent(target.commentId)}` : '')
        : null;
    case 'ACTIVITY_DETAIL':
      return target.activityId ? buildActivityDetailRoute(target.activityId) : null;
    case 'PUBLIC_EVENT_DETAIL':
      return target.publicEventId ? buildPublicEventDetailRoute(target.publicEventId) : null;
    default:
      return null;
  }
};

export const navigateNotificationTarget = async (target?: NotificationTarget) => {
  const url = resolveNotificationTarget(target);
  if (!url) {
    showInfoToast('这条通知暂无可打开的详情');
    return;
  }
  await wxNavigateTo({ url });
};
