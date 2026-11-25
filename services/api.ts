import { rejectMiniProgramActivityPublishing } from '../utils/activity-publishing';
import type {
  PostEditableRepresentation,
  PostEdit,
  PostListBO,
  PostDetailVO,
  PostCreateRequest,
  PostPageQuery,
  PostPage,
  CommentCreateRequest,
  CommentVO,
  ReplyVO,
} from '../types/post-contract';
import type * as ApiTypes from '../types/api';
import type * as NotificationTypes from '../types/notification-contract';
import type { UserProfile, UpdateMyProfileRequest } from '../types/profile-contract';
import { http, httpWithMeta } from '../utils/request';

export const api = {
  auth: {
    logout: (token: string) => http.post<void>('/v1/auth/logout', undefined, { auth: 'none', retryAuth: false, sensitive: true, headers: { Authorization: `Bearer ${token}` } }),
    login: (payload: ApiTypes.LoginRequest) =>
      http.post<ApiTypes.LoginVO>('/v1/auth/login', payload, { auth: 'none', sensitive: true }),
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
    getList: (query: PostPageQuery) =>
      http.get<PostPage>('/v1/post', { postType: 'NORMAL', ...query }, { sensitive: true }),

    getUserLikePost: (userId: string, lastId?: string, pageSize?: number) =>
      http.get<PostPage>(
        '/v1/post/liked?postType=NORMAL&userId=' +
          userId +
          (lastId ? `&lastLikeId=${lastId}` : '') +
          (pageSize ? `&pageSize=${String(pageSize)}` : ''),
      ),

    getDetail: (postId: string) =>
      http.get<PostDetailVO>(`/v1/post/${postId}`, undefined, { sensitive: true }),

    create: (payload: PostCreateRequest) =>
      http.post<PostListBO>('/v1/post', payload, { sensitive: true, retryAuth: false }),

    getEditable: (postId: string) =>
      httpWithMeta.get<PostEditableRepresentation>(
        `/v1/post/${encodeURIComponent(postId)}`,
        { view: 'edit' },
        { sensitive: true },
      ),
    edit: (postId: string, payload: PostEdit, etag: string) =>
      httpWithMeta.post<PostEditableRepresentation>(
        `/v1/post/${encodeURIComponent(postId)}:edit`,
        payload,
        { headers: { 'If-Match': etag }, retryAuth: false, sensitive: true },
      ),

    remove: (postId: string) => http.del<null>(`/v1/post/${postId}`),
  },

  comment: {
    getList: (query: ApiTypes.CommentPageQuery) =>
      http.get<{ list: CommentVO[]; hasMore: boolean; nextCursor: string | null }>(
        '/v1/comment',
        query,
        { sensitive: true },
      ),

    getReplyList: (query: ApiTypes.CommentPageQuery) =>
      http.get<{ list: ReplyVO[]; hasMore: boolean; nextCursor: string | null }>(
        '/v1/comment/replies',
        query,
        { sensitive: true },
      ),

    create: (payload: CommentCreateRequest) =>
      http.post<string>('/v1/comment', payload, { sensitive: true, retryAuth: false }),

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
    // Retired ordinary-token writes must not be redirected to admin APIs.
    create: (_payload: ApiTypes.ActivityCreateRequest): Promise<string> =>
      rejectMiniProgramActivityPublishing(),

    fetchActivityList: (query: ApiTypes.ActivityPageQuery) =>
      http.get<ApiTypes.PageResultActivityListBO>('/v1/activity', query),

    fetchActivityDetail: (id: string) => http.get<ApiTypes.ActivityDetailVO>(`/v1/activity/${id}`),

    upload: (_filePath: string): Promise<ApiTypes.ActivityUploadBO> =>
      rejectMiniProgramActivityPublishing(),

    activtyPublishStream: <T>(
      _taskId: string,
      _skipped: string | undefined,
      _parser?: (line: string) => T,
    ): ReturnType<typeof http.stream<T>> => rejectMiniProgramActivityPublishing(),
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
    listNotifications: (query: NotificationTypes.NotificationListQuery) =>
      http.get<NotificationTypes.NotificationListResponse>('/v1/users/me/notifications', query, {
        sensitive: true,
      }),
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
    deleteNotification: (id: string) =>
      http.del(`/v1/users/me/notifications/${encodeURIComponent(id)}`, undefined, {
        sensitive: true,
      }),
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

    getSubscriptionOptions: (query?: { sceneCode: ApiTypes.NotificationSubscriptionSceneCode; resourceId?: string }) =>
      http.get<ApiTypes.NotificationSubscriptionOptions>(
        '/v1/users/me/notification-subscription-options',
        query,
        { sensitive: true },
      ),
  },

  report: {
    create: (payload: Omit<ApiTypes.ReportCreateRequest, 'mark'> & { mark?: string; remark?: string }) =>
      http.post<null>('/v1/reports', payload, { sensitive: true, retryAuth: false }),
  },

  search: {
    searchPosts: (query: ApiTypes.SearchQuery) => http.get<PostPage>('/v1/search/posts', query),
  },
};
