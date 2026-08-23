import type * as ApiTypes from '../types/api';
import { http } from '../utils/request';

export const api = {
  auth: {
    login: (payload: ApiTypes.LoginRequest) =>
      http.post<ApiTypes.LoginVO>('/v1/auth/login', payload, { auth: 'none' }),
  },

  user: {
    getCurrentProfile: () => http.get<ApiTypes.UserProfileVO>('/v1/users/me'),

    updateCurrentProfile: (payload: ApiTypes.UserProfileUpdateRequest) =>
      http.put<null>('/v1/users/me', payload),

    getPublicProfile: (userId: string) =>
      http.get<ApiTypes.UserPublicProfileVO>(`/v1/users/public/${userId}`),

    getAgreementStatus: () => http.get<ApiTypes.UserAgreementStatusVO>('/v1/users/me/agreement'),

    bindPhone: (phone: number) =>
      http.post<null>('/v1/users/me/bindPhone?phone=' + phone.toString()),

    agreeAgreement: (payload: ApiTypes.UserAgreementRequest) =>
      http.post<string>('/v1/users/me/agreement', payload),
  },

  setting: {
    get: () => http.get<ApiTypes.UserSettingVO>('/v1/setting'),
    update: (payload: Partial<ApiTypes.UserSettingUpdateRequest>) =>
      http.put<null>('/v1/setting', payload),
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

    getDetail: (id: number) => http.get<ApiTypes.ExamDetailVO>(`/v1/exam/${id.toString()}`),

    getTimeline: (id: number) =>
      http.get<ApiTypes.TimelineVO[]>(`/timeline/target/3/${id.toString()}`),

    subscribe: (id: number) => http.post<string>(`/v1/exam/${id.toString()}/subscribe`),

    unsubscribe: (id: number) => http.del<string>(`/v1/exam/${id.toString()}/subscribe`),
  },

  media: {
    getUploadCredential: (payload: ApiTypes.MediaUploadCredentialRequest) =>
      http.post<ApiTypes.CosUploadCredentialDTO>('/v1/media/upload/credential', payload),

    saveAttachments: (payload: ApiTypes.MediaAttachmentCreateRequest) =>
      http.post<ApiTypes.MediaAttachmentBO[]>('/v1/media/attachments', payload),

    removeAttachment: (attachmentId: string) =>
      http.del<null>(`/v1/media/attachments/${attachmentId}`),
  },

  notify: {
    getMyList: (query: ApiTypes.NotificationPageQuery) =>
      http.get<ApiTypes.PageResultNotificationVO>('/v1/notify/me', query),

    getUnreadCount: () => http.get<number>('/v1/notify/me/unread-count'),

    markRead: (id: string) => http.put<null>(`/v1/notify/${id}/read`),

    markAllRead: () => http.put<null>('/v1/notify/me/read-all'),
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
