import type { NotificationTarget } from '../types/notification-contract';
import {
  buildActivityDetailRoute,
  buildPostDetailRoute,
  buildPublicEventDetailRoute,
  ROUTES,
} from './routes';
import { wxNavigateTo, wxRedirectTo, wxReLaunch } from './wx-promise';
import { showInfoToast } from './notify';

export const resolveNotificationTarget = (target?: NotificationTarget): string | null => {
  if (!target) return null;
  if ('growthRecordTarget' in target) {
    const validId = (value: unknown): value is string =>
      typeof value === 'string' && !!value.trim() && value.length <= 128 && !/[\r\n]/.test(value);
    if (
      target.growthRecordTarget !== true ||
      !['POST_DETAIL', 'MY_POST_DETAIL'].includes(target.type) ||
      !validId(target.postId) ||
      (target.commentId !== undefined && !validId(target.commentId))
    )
      return null;
    return (
      `/subpkg_user/pages/growth-detail/detail?postId=${encodeURIComponent(target.postId)}` +
      (target.commentId ? `&commentId=${encodeURIComponent(target.commentId)}` : '')
    );
  }
  switch (target.type) {
    case 'LEARNING_TASK_DETAIL':
      return typeof target.assignmentId === 'string' &&
        target.assignmentId.trim() &&
        target.assignmentId.length <= 128 &&
        !/[\r\n]/.test(target.assignmentId)
        ? `/subpkg_user/pages/learning-task-detail/detail?assignmentId=${encodeURIComponent(target.assignmentId)}`
        : null;
    case 'ARTICLE_DETAIL':
      return target.articleId
        ? `/subpkg_red/pages/article-detail/detail?articleId=${encodeURIComponent(target.articleId)}` +
            (target.commentId ? `&commentId=${encodeURIComponent(target.commentId)}` : '')
        : null;
    case 'MY_POST_DETAIL':
      return target.postId
        ? `/subpkg_community/pages/my-community/detail?kind=post&id=${encodeURIComponent(target.postId)}`
        : null;
    case 'MY_POST_COMMENT_DETAIL':
      return target.commentId
        ? `/subpkg_community/pages/my-community/detail?kind=comment&id=${encodeURIComponent(target.commentId)}`
        : null;
    case 'MY_REPORT_DETAIL':
      return target.reportId
        ? `/subpkg_community/pages/my-community/detail?kind=report&id=${encodeURIComponent(target.reportId)}`
        : null;
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

interface NavigationOptions {
  external?: boolean;
  isCurrent?: () => boolean;
}
let navigationQueue: Promise<unknown> = Promise.resolve();
let navigationRevision = 0;

export const navigateNotificationTarget = async (
  target?: NotificationTarget,
  options: NavigationOptions = {},
) => {
  const url = resolveNotificationTarget(target);
  if (!url) {
    showInfoToast('这条通知暂无可打开的详情');
    return;
  }
  const revision = ++navigationRevision;
  const isCurrent = () => revision === navigationRevision && (options.isCurrent?.() ?? true);
  const navigation = navigationQueue
    .catch(() => undefined)
    .then(async () => {
      if (!isCurrent()) return;
      if (options.external) {
        // A notification may launch directly into a detail or resume an old stack.
        // Rebuild the same home -> focused detail stack in both cases.
        await wxReLaunch({ url: ROUTES.HOME });
        if (!isCurrent()) return;
        await wxNavigateTo({ url });
        return;
      }
      const pages = getCurrentPages();
      const current = pages.length > 0 ? pages[pages.length - 1] : undefined;
      const [path, query = ''] = url.split('?');
      const sameResource =
        current?.route === path.slice(1) &&
        query.split('&').every((part) => {
          const [key, value = ''] = part.split('=');
          return key === 'commentId' || current.options[key] === decodeURIComponent(value);
        });
      // Replace the current resource with its focused version, retaining its parent.
      if (sameResource) await wxRedirectTo({ url });
      else await wxNavigateTo({ url });
    });
  navigationQueue = navigation;
  await navigation;
};
