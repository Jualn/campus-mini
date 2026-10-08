import type * as ApiTypes from '../types/api';
import type * as NotificationTypes from '../types/notification-contract';
import type { UserProfile, UpdateMyProfileRequest } from '../types/profile-contract';
import { http } from '../utils/request';

export const api = {
  auth: {
    login: (payload: ApiTypes.LoginRequest) =>
      http.post<ApiTypes.LoginVO>('/v1/auth/login', payload, { auth: 'none' }),
  },

  user: {
    getCurrentProfile: () =>
      http.get<UserProfile>('/v1/users/me/profile', undefined, { sensitive: true }),

    updateCurrentProfile: (payload: UpdateMyProfileRequest) =>
      http.post<UserProfile>('/v1/users/me/profile', payload, { sensitive: true }),

    getPublicProfile: (userId: string) =>
      http.get<UserProfile>(`/v1/users/${encodeURIComponent(userId)}/profile`, undefined, {
        sensitive: true,
      }),

    getAgreementStatus: () => http.get<ApiTypes.UserAgreementStatusVO>('/v1/users/me/agreement'),

    bindPhone: (phone: number) =>
      http.post<null>('/v1/users/me/bindPhone?phone=' + phone.toString()),

    agreeAgreement: (payload: ApiTypes.UserAgreementRequest) =>
      http.post<string>('/v1/users/me/agreement', payload),
  },

  home: {
    getPublicMatterReminders: () =>
      http.get<ApiTypes.HomePublicMatterRemindersDTO>(
        '/v1/home/public-matter-reminders',
        undefined,
        {
          auth: 'required',
        },
      ),
  },

  setting: {
    get: () => http.get<ApiTypes.UserSettingVO>('/v1/setting'),
    update: (payload: Partial<ApiTypes.UserSettingUpdateRequest>) =>
      http.put<null>('/v1/setting', payload),
  },

  wx: {
    createOfficialAccountBindOauthUrl: () =>
      http.get<{ url: string }>('/v1/wx/bind/oauth-url', undefined, { auth: 'required' }),
  },

  post: {
    getList: (query: ApiTypes.PostPageQuery) =>
      http.get<ApiTypes.PageResultPostListBO>('/v1/post', query),

    getUserLikePost: (userId: string, lastId?: string, pageSize?: number) =>
      http.get<ApiTypes.PageResultPostListBO>(
        '/v1/post/liked?userId=' +
          userId +
          (lastId ? `&lastLikeId=${lastId}` : '') +
          (pageSize ? `&pageSize=${String(pageSize)}` : ''),
      ),

    getDetail: (postId: string) => http.get<ApiTypes.PostDetailVO>(`/v1/post/${postId}`),

    create: (payload: ApiTypes.PostCreateRequest) =>
      http.post<ApiTypes.PostListBO>('/v1/post', payload),

    edit: (postId: string, payload: Partial<ApiTypes.PostCreateRequest>) =>
      http.post<string>(`/v1/post/${postId}`, payload),

    remove: (postId: string) => http.del<null>(`/v1/post/${postId}`),
  },

  comment: {
    getList: (query: ApiTypes.CommentPageQuery) =>
      http.get<ApiTypes.PageResultCommentVO>('/v1/comment', query),

    getReplyList: (query: ApiTypes.CommentPageQuery) =>
      http.get<ApiTypes.PageResultReplyVO>('/v1/comment/replies', query),

    create: (payload: ApiTypes.CommentCreateRequest) => http.post<string>('/v1/comment', payload),

    remove: (commentId: string) => http.del<null>(`/v1/comment/${commentId}`),
  },

  interact: {
    reportView: (payload: ApiTypes.InteractViewRequest) =>
      http.post<null>('/v1/interact/view', payload),

    reportShare: (payload: ApiTypes.InteractShareRequest) =>
      http.post<string>('/v1/interact/share', payload),

    like: (payload: ApiTypes.InteractLikeRequest) => http.post<null>('/v1/interact/like', payload),

    unlike: (payload: ApiTypes.InteractLikeRequest) => http.del<null>('/v1/interact/like', payload),

    getViewCount: (query: ApiTypes.InteractTargetQuery) =>
      http.get<ApiTypes.ViewCountVO>('/v1/interact/view/count', query),
    getShareCount: (query: ApiTypes.InteractTargetQuery) =>
      http.get<ApiTypes.ShareCountVO>('/v1/interact/share/count', query),

    getLikeStatus: (query: ApiTypes.InteractTargetQuery) =>
      http.get<ApiTypes.LikeStatusVO>('/v1/interact/liked', query),

    getLikeCount: (query: ApiTypes.InteractTargetQuery) =>
      http.get<ApiTypes.LikeCountVO>('/v1/interact/like/count', query),
  },

  activity: {
    subscribe: (id: string) =>
      http.post<null>(`/v1/activity/${encodeURIComponent(id)}/subscribe`, undefined, {
        auth: 'required',
      }),
    unsubscribe: (id: string) =>
      http.del<null>(`/v1/activity/${encodeURIComponent(id)}/subscribe`, undefined, {
        auth: 'required',
      }),
    create: (payload: ApiTypes.ActivityCreateRequest) => http.post<string>('/v1/activity', payload),

    fetchActivityList: (query: ApiTypes.ActivityPageQuery) =>
      http.get<ApiTypes.PageResultActivityListBO>('/v1/activity', query),

    fetchActivityDetail: (id: string) => http.get<ApiTypes.ActivityDetailVO>(`/v1/activity/${id}`),

    upload: (filePath: string) =>
      http.upload<ApiTypes.ActivityUploadBO>('/v1/activity/ai-extract/upload', filePath),

    activtyPublishStream: <T>(
      taskId: string,
      skipped: string | undefined,
      parser?: (line: string) => T,
    ) =>
      http.stream<T>(
        `/v1/activity/ai-extract/stream?taskId=${taskId}&skipped=${String(skipped)}`,
        undefined,
        undefined,
        parser,
      ),
  },

  exam: {
    getSimpleList: () => http.get<ApiTypes.ExamSimpleVO[]>('/v1/exam/simple'),
    getList: (query: ApiTypes.ExamPageQuery) =>
      http.get<ApiTypes.PageResultExamVO>('/v1/exam', query),
    getDetail: (id: string) =>
      http.get<ApiTypes.ExamDetailVO>(`/v1/exam/${encodeURIComponent(id)}`),
    getTimeline: (id: string) =>
      http.get<ApiTypes.TimelineVO[]>(`/timeline/target/3/${encodeURIComponent(id)}`),
    subscribe: (id: string) =>
      http.post<null>(`/v1/exam/${encodeURIComponent(id)}/subscribe`, undefined, {
        auth: 'required',
      }),
    unsubscribe: (id: string) =>
      http.del<null>(`/v1/exam/${encodeURIComponent(id)}/subscribe`, undefined, {
        auth: 'required',
      }),
  },

  media: {
    getUploadCredential: (payload: ApiTypes.MediaUploadCredentialRequest) =>
      http.post<ApiTypes.CosUploadCredentialDTO>('/v1/media/upload/credential', payload),
  },

  notify: {
    getStructuredList: (query: NotificationTypes.NotificationListQuery) =>
      http.get<NotificationTypes.NotificationListResponse>(
        '/v1/users/me/notifications',
        { ...query, representation: 'structured' },
        { sensitive: true },
      ),
    getSummary: (afterCursor?: string) =>
      http.get<NotificationTypes.NotificationSummary>(
        '/v1/users/me/notifications/summary',
        { afterCursor },
        { sensitive: true },
      ),
    getNotification: (id: string) =>
      http.get<NotificationTypes.NotificationItem>(
        `/v1/users/me/notifications/${encodeURIComponent(id)}`,
        undefined,
        { sensitive: true },
      ),
    batchRead: (notificationIds: string[]) =>
      http.post<NotificationTypes.NotificationReadResult>(
        '/v1/users/me/notifications:batch-read',
        { notificationIds },
        { sensitive: true },
      ),
    readThrough: (throughCursor: string) =>
      http.post<NotificationTypes.NotificationReadResult>(
        '/v1/users/me/notifications:mark-read-through',
        { throughCursor },
        { sensitive: true },
      ),
    getMyList: (query: ApiTypes.NotificationPageQuery) =>
      http.get<ApiTypes.NotificationCursorPage>('/v1/users/me/notifications', query),

    getUnreadCount: () =>
      http.get<ApiTypes.NotificationUnreadCount>('/v1/users/me/notifications/unread-count'),

    markRead: (id: string) =>
      http.put<null>(`/v1/users/me/notifications/${encodeURIComponent(id)}/read-state`, {
        isRead: true,
      }),

    markAllRead: () => http.post<null>('/v1/users/me/notifications:mark-all-read'),

    getPreferences: () =>
      http.get<ApiTypes.NotificationPreferences>('/v1/users/me/notification-preferences'),

    batchUpdatePreferences: (data: ApiTypes.UpdateNotificationPreferences) =>
      http.post<ApiTypes.NotificationPreferences>(
        '/v1/users/me/notification-preferences:batch-update',
        data,
      ),

    getChannelCapabilities: () =>
      http.get<ApiTypes.NotificationChannelCapabilities>(
        '/v1/users/me/notification-channel-capabilities',
      ),
  },

  report: {
    create: (payload: ApiTypes.ReportCreateRequest) => http.post<null>('/v1/reports', payload),
  },

  search: {
    searchPosts: (query: ApiTypes.SearchQuery) =>
      http.get<ApiTypes.PageResultPostListBO>('/v1/search/posts', query),

    searchActivities: (query: ApiTypes.SearchQuery) =>
      http.get<ApiTypes.PageResultActivityListBO>('/v1/search/activities', query),
  },
};
