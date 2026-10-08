export const ROUTES = {
  HOME: '/pages/index/index',
  MESSAGE: '/pages/message/message',
  ME: '/pages/me/me',
} as const;

const encodeId = (id: string | number): string => encodeURIComponent(String(id));

export const buildActivityDetailRoute = (activityId: string | number): string =>
  `/subpkg_activity/pages/detail/detail?activityId=${encodeId(activityId)}`;

export const buildPublicEventDetailRoute = (publicEventId: string | number): string =>
  `/subpkg_public_event/pages/detail/detail?publicEventId=${encodeId(publicEventId)}`;

export const buildPostDetailRoute = (postId: string | number): string =>
  `/subpkg_community/pages/detail/detail?postId=${encodeId(postId)}`;

export const buildUserProfileRoute = (userId: string | number): string =>
  `/subpkg_user/pages/user/user?userId=${encodeId(userId)}`;
