export const ROUTES = {
  HOME: '/pages/index/index',
  MESSAGE: '/pages/message/message',
  ME: '/pages/me/me',
} as const;

const encodeId = (id: string | number): string => encodeURIComponent(String(id));

export const buildActivityDetailRoute = (activityId: string | number): string =>
  `/subpkg_activity/pages/detail/detail?activityId=${encodeId(activityId)}`;

export const buildExamDetailRoute = (examId: string | number): string =>
  `/subpkg_exam/pages/detail/detail?examId=${encodeId(examId)}`;

export const buildPostDetailRoute = (postId: string | number): string =>
  `/subpkg_community/pages/detail/detail?postId=${encodeId(postId)}`;
