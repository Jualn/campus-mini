/**
 * API 返回类型定义
 * 自动生成于: 2026-05-11
 * 来源: http://localhost:8080/doc.html (Swagger Models)
 */

import type {
  ActivityCategory,
  ActivityStatus,
  MediaType,
  ReportReason,
  TargetType,
} from '../utils/constants';

// ============================================================
// 通用Result包装器
// ============================================================

/** 通用API响应包装器 */
export interface Result<T> {
  code: number; // integer(int32)
  message: string; // string
  data: T; // Generic data field
  timestamp: number; // integer(int64)
}

// ============================================================
// 用户资料相关类型
// ============================================================

/** 用户基础信息DTO */
export interface UserInfoDTO {
  id: string; // string(long)
  nickname: string; // string
  avatarUrl: string; // string
  role: number; // integer(int32)
}

/** 用户完整资料VO */
export interface UserProfileVO {
  id: string;
  nickname: string; // string
  avatarUrl: string; // string
  backgroundUrl: string; // string
  bio: string; // string
  gender: number; // integer(int32)
  role: number; // integer(int32)
  roleDesc: string; // string
  status: number; // integer(int32)
  statusDesc: string; // string
  banned: boolean; // boolean
  muted: boolean; // boolean
  capabilities: unknown[]; // array
  createdAt: string; // string(date-time)
}

/** 用户公开资料VO */
export interface UserPublicProfileVO {
  id: string; // string(long)
  nickname: string; // string
  avatarUrl: string; // string
  backgroundUrl: string; // string
  bio: string; // string
  gender: number; // integer(int32)
  createdAt: string; // string
}

/** 用户资料更新请求 */
export interface UserProfileUpdateRequest {
  nickname?: string; // string
  avatarUrl?: string; // string
  avatarObjectKey?: string; // string
  backgroundUrl?: string; // string
  backgroundObjectKey?: string; // string
  bio?: string; // string
  gender?: number; // integer(int32)
}

/** 用户协议状态VO */
export interface UserAgreementStatusVO {
  agreed: boolean; // boolean
  version: string; // string
  agreedAt: string; // string(date-time)
}

/** 用户协议请求 */
export interface UserAgreementRequest {
  version: string; // string
}

/** 用户设置VO */
export interface UserSettingVO {
  notifyComment: boolean; // boolean
  notifyReply: boolean; // boolean
  notifyLike: boolean; // boolean
  notifyActivityRemind: boolean; // boolean
  notifyExamRemind: boolean; // boolean
  notifySystem: boolean; // boolean
  notifyAuditResult: boolean; // boolean
}

/** 用户设置更新请求 */
export interface UserSettingUpdateRequest {
  notifyComment: boolean; // boolean
  notifyReply: boolean; // boolean
  notifyLike: boolean; // boolean
  notifyActivityRemind: boolean; // boolean
  notifyExamRemind: boolean; // boolean
  notifySystem: boolean; // boolean
  notifyAuditResult: boolean; // boolean
}

/** 用户简单信息BO */
export interface UserSimpleBO {
  id: string; // string(long)
  nickname: string; // string
  avatarUrl: string; // string
}

// ============================================================
// 登录相关类型
// ============================================================

/** 登录请求 */
export interface LoginRequest {
  code: string; // string (微信授权码)
}

/** 登录VO */
export interface LoginVO {
  token: string; // string
  userInfo: UserInfoDTO; // UserInfoDTO
}

// ============================================================
// 活动相关类型
// ============================================================

/** 活动创建请求 */
export interface ActivityCreateRequest {
  startPrecision?: number;
  endPrecision?: number;
  registrationEndPrecision?: number;
  registrationEnd?: string | null;
  timeDescription?: string;
  sections?: EventSectionRequest[];
  actions?: EventActionRequest[];
  title: string; // string
  content: string; // string
  location: string; // string
  category: number; // integer(int32)
  organizer: string; // string
  audienceScope: number; // integer(int32)
  contactInfo: string; // string
  joinMethod: string; // string
  qrcodeUrl: string; // string
  startTime: string | null; // string(date-time)
  endTime: string | null; // string(date-time)
  enrollDeadline: string | null; // string(date-time)
  maxParticipants: number | null; // integer(int32)
  attachmentItems: AttachmentItemRequest[]; // array
  timelineItems: TimelineItemRequest[]; // array
}

/** 活动更新请求 */
export interface ActivityUpdateRequest {
  id: string; // string(long)
  title: string; // string
  content: string; // string
  location: string; // string
  category: number; // integer(int32)
  organizer: ActivityCategory; // string
  audienceScope: number; // integer(int32)
  contactInfo: string; // string
  joinMethod: string; // string
  qrcodeUrl: string; // string
  startTime: string; // string(date-time)
  endTime: string; // string(date-time)
  enrollDeadline: string; // string(date-time)
  maxParticipants: number; // integer(int32)
  attachmentItems: unknown[]; // array
  timelineItems: unknown[]; // array
}

/** V5 information fields; optional during compatible server rollout. */
export interface EventInformationFields {
  registrationEnd?: string | null;
  registrationStart?: string | null;
  registrationStartPrecision?: number;
  startPrecision?: number;
  endPrecision?: number;
  registrationEndPrecision?: number;
  timeDescription?: string | null;
  registrationMode?: number;
  registrationStatus?: string;
  activityPhase?: string;
  capacity?: number | null;
  capacityUnit?: number | null;
  coverAttachmentId?: string | null;
  audienceSummary?: string | null;
  sections?: { sectionType: string; title: string; content: string }[];
  actions?: {
    actionType: number;
    label: string;
    description?: string | null;
    targetValue?: string | null;
    attachmentId?: string | null;
    isRequired: boolean;
  }[];
}

/** 活动列表VO */
export interface ActivityListVO extends EventInformationFields {
  id: string; // string(long)
  title: string; // string
  location: string; // string
  status: ActivityStatus; // string
  category: ActivityCategory;
  organizer: string; // string
  maxParticipants: number | null; // integer(int32)
  audienceScope: number; // integer(int32)
  enrollDeadline: string; // string(date-time)
  publishedAt: string; // string(date-time)
}

export interface ActivityListBO extends EventInformationFields {
  id: string; // string(long)
  title: string; // string
  location: string; // string
  status: ActivityStatus; // string
  category: ActivityCategory;
  organizer: string; // string
  maxParticipants: number | null; // integer(int32)
  audienceScope: number; // integer(int32)
  enrollDeadline: string; // string(date-time)
  publishedAt: string; // string(date-time)
}

/** 活动详情VO */
export interface ActivityDetailVO extends EventInformationFields {
  id: string; // string(long)
  userId: string; // string(long)
  title: string; // string
  content: string; // string
  location: string; // string
  /** 0-非其他区间 2-报名中 3-进行中 4-已结束 5-已取消 */
  status: ActivityStatus; // string
  category: ActivityCategory; // integer(int32)
  organizer: string; // string
  audienceScope: number; // integer(int32)
  contactInfo: string; // string
  joinMethod: string; // string
  qrcodeUrl: string; // string
  startTime: string; // string(date-time)
  endTime: string; // string(date-time)
  enrollDeadline: string; // string(date-time)
  maxParticipants: number | null; // integer(int32)
  commentCount: number; // integer(int32)
  likeCount: number; // integer(int32)
  viewCount: number; // integer(int32)
  publishedAt: string; // string(date-time)
  author: UserSimpleBO; // UserSimpleBO
  attachmentItems: MediaAttachmentBO[]; // array
  timelineItems: TimelineItemDTO[]; // array
  liked: boolean; // boolean
  enrolled: boolean; // 当前用户是否订阅，与平台报名独立
}

export interface ActivityUploadBO {
  taskId: string; // string
}

// ============================================================
// 考试相关类型
// ============================================================

/** 考试创建请求 */
export interface ExamCreateRequest {
  title: string; // string
  category: number; // integer(int32)
  content: string; // string
  registrationStart: string; // string(date-time)
  registrationEnd: string; // string(date-time)
  examDate: string; // string(date)
  examDateEnd: string; // string(date)
  officialUrl: string; // string
  attachmentItems: unknown[]; // array
  timelineItems: unknown[]; // array
}

/** 考试更新请求 */
export interface ExamUpdateRequest {
  id: string; // string(long)
  title: string; // string
  category: number; // integer(int32)
  content: string; // string
  registrationStart: string; // string(date-time)
  registrationEnd: string; // string(date-time)
  examDate: string; // string(date)
  examDateEnd: string; // string(date)
  officialUrl: string; // string
  mediaList: unknown[]; // array
  timelineList: unknown[]; // array
}

/** 考试精简VO */
export interface ExamSimpleVO {
  id: string;
  title: string;
  examDate: string;
}

/** 运维发布的公共事项；每条记录对应独立期次。 */
export interface ExamVO extends EventInformationFields {
  id: string;
  title: string;
  category: number;
  content: string | null;
  summary: string | null;
  editionLabel: string | null;
  eventType: number;
  publishStatus: number;
  startTime: string | null;
  endTime: string | null;
  organizer: string | null;
  location: string | null;
  audienceScope: number | null;
  contactName: string | null;
  contactPhone: string | null;
  participantMode: number;
  officialUrl: string | null;
  attachmentItems: MediaAttachmentBO[] | null;
  timelineItems:
    | (Omit<TimelineItemDTO, 'startTime' | 'endTime'> & {
        startTime: string | null;
        endTime: string | null;
      })[]
    | null;
}

export interface ExamDetailVO extends ExamVO {
  subscribed: boolean;
  liked: boolean;
}

/** GET /v1/home/public-matter-reminders 的 canonical 响应。 */
export interface HomePublicMatterRemindersDTO {
  evaluatedAt: string;
  source: 'SUBSCRIPTIONS' | 'DEFAULT';
  items: PublicMatterReminderDTO[];
}

export interface PublicMatterReminderDTO {
  publicMatterId: string;
  name: string;
  nodeName: string;
  reminderAt: string;
}

// ============================================================
// 帖子相关类型
// ============================================================

/** 帖子创建请求 */
export interface PostCreateRequest {
  title: string; // string
  content: string; // string
  attachmentItems: AttachmentItemRequest[]; // array
}

/** 帖子列表BO */
export interface PostListBO {
  id: string; // string(long)
  title: string; // string
  content: string; // string
  likeCount: number; // integer(int32)
  commentCount: number; // integer(int32)
  viewCount: number; // integer(int32)
  publishedAt: string; // string
  author: UserSimpleBO; // UserSimpleBO
  attachments: MediaAttachmentSimpleBO[]; // array
  liked: boolean; // boolean
}

/** 帖子详情VO */
export interface PostDetailVO {
  id: string; // string(long)
  title: string; // string
  content: string; // string
  likeCount: number; // integer(int32)
  commentCount: number; // integer(int32)
  viewCount: number; // integer(int32)
  publishedAt: string; // string
  author: UserSimpleBO; // UserSimpleBO
  attachments: MediaAttachmentSimpleBO[]; // array
  liked: boolean; // boolean
}

// ============================================================
// 评论相关类型
// ============================================================

/** 评论创建请求 */
export interface CommentCreateRequest {
  targetType: TargetType; // string
  targetId: string; // string(long)
  parentId?: string | null; // string(long)
  replyToUid?: string | null; // string(long)
  content: string; // string
  imageUrl?: string; // string
  imageObjectKey?: string; // string
}

/** 评论VO */
export interface CommentVO {
  id: string; // string(long)
  content: string; // string
  imageUrl: string; // string
  likeCount: number; // integer(int32)
  replyCount: number; // integer(int32)
  createdAt: string; // string
  author: UserSimpleBO; // UserSimpleBO
  previewReplies: ReplyVO[]; // ReplyVO[]
  liked: boolean; // boolean
}

/** 子评论VO */
export interface ReplyVO {
  id: string; // string(long)
  parentId: string; // string(long)
  content: string; // string
  likeCount: number; // integer(int32)
  createdAt: string; // string
  author: UserSimpleBO; // UserSimpleBO
  replyToUser: UserSimpleBO; // UserSimpleBO
  liked: boolean; // boolean
}

// ============================================================
// 时间轴相关类型
// ============================================================

/** 时间轴项目请求 */
export interface TimelineItemRequest {
  startPrecision?: number;
  endPrecision?: number;
  label: string; // string
  description: string; // string
  startTime: string | null; // string(date-time)
  endTime: string | null; // string(date-time)
  sortOrder: number; // integer(int32)
}

/** 时间轴更新请求 */
export interface TimelineUpdateRequest {
  id: string; // string(long)
  label: string; // string
  description: string; // string
  startTime: string; // string(date-time)
  endTime: string; // string(date-time)
  sortOrder: number; // integer(int32)
}

/** 时间轴VO */
export interface TimelineVO {
  id: string; // string(long)
  targetType: TargetType; // string
  targetId: string; // string(long)
  label: string; // string
  description: string; // string
  startTime: string; // string(date-time)
  endTime: string; // string(date-time)
  sortOrder: number; // integer(int32)
}

/** 时间轴BO */
export interface TimelineItemDTO {
  id?: string;
  startPrecision?: number;
  endPrecision?: number;
  timeDescription?: string;
  location?: string;
  label: string; // string
  description: string; // string
  startTime: string; // string(date-time)
  endTime: string; // string(date-time)
  sortOrder: number; // integer(int32)
}

// ============================================================
// 互动相关类型
// ============================================================

/** 点赞请求 */
export interface InteractLikeRequest {
  targetType: TargetType; // string
  targetId: string; // string(long)
}

/** 分享请求 */
export interface InteractShareRequest {
  targetType: TargetType; // string
  targetId: string; // string(long)
  platform: number; // integer(int32)
}

/** 浏览请求 */
export interface InteractViewRequest {
  targetType: TargetType; // string
  targetId: string; // string(long)
}

/** 点赞数VO */
export interface LikeCountVO {
  count: number; // integer(int64)
}

/** 点赞状态VO */
export interface LikeStatusVO {
  liked: boolean; // boolean
}

/** 分享数VO */
export interface ShareCountVO {
  count: number; // integer(int64)
}

/** 浏览数VO */
export interface ViewCountVO {
  count: number; // integer(int64)
}

// ============================================================
// 通知相关类型
// ============================================================

export type NotificationCategory = 'ACTIVITY' | 'PUBLIC_EVENT';
export type NotificationChannel = 'IN_APP' | 'WECHAT_MINI_PROGRAM' | 'WECHAT_OFFICIAL_ACCOUNT';

export interface NotificationPreferenceItem {
  category: string;
  channel: string;
  enabled: boolean;
  source: string;
}

export interface NotificationPreferences {
  defaultVersion: string;
  items: NotificationPreferenceItem[];
}

export interface UpdateNotificationPreferences {
  changes: {
    category: NotificationCategory;
    channel: NotificationChannel;
    enabled: boolean | null;
  }[];
}

export interface NotificationChannelCapabilityItem {
  category: string;
  notificationType: string;
  channel: string;
  available: boolean;
  permission: string;
  unavailableReasons: string[];
}

export interface NotificationChannelCapabilities {
  evaluatedAt: string;
  items: NotificationChannelCapabilityItem[];
}

/** Canonical 收件箱通知；未知 type/target 也需保留文本展示。 */
export interface InboxNotification {
  notificationId: string;
  type: string;
  category?: string;
  title: string;
  content: string;
  target?: {
    type: string;
    resourceId: string;
  };
  isRead: boolean;
  createdAt: string;
}

export interface NotificationCursorPage {
  items: InboxNotification[];
  nextCursor?: string;
}

export interface NotificationUnreadCount {
  unreadCount: number;
}

// ============================================================
// 媒体相关类型
// ============================================================

/** 媒体上传凭证请求 */
export interface MediaUploadCredentialRequest {
  targetType: TargetType; // string
  fileNames: string[]; // string
}

/** COS上传凭证DTO */
export interface CosUploadCredentialDTO {
  bucket: string; // string
  region: string; // string
  objectKeys: string[]; // 对象键列表。
  uploadUrl?: string; // 预签名上传 URL（PUT），STS 流程下不返回。
  fileUrl?: string; // 资源访问 URL，STS 流程下不返回。
  expireAt?: string; // 凭证过期时间。(date-time)
  tmpSecretId?: string; // STS 临时凭证字段
  tmpSecretKey?: string; // STS 临时凭证字段
  sessionToken?: string; // STS 临时凭证字段
  expiredTime?: number; // 单位为 epoch seconds
  customDomain?: string; // 自定义访问域名，如果提供则优先使用该域名而非默认的官方域名
}

/** 媒体附件BO */
export interface MediaAttachmentBO {
  id: string; // string(long)
  type: string; // string
  objectKey?: string; // COS 对象键；外链类型为空
  url: string; // string
  originalName: string; // string
  sortOrder: number; // integer(int32)
}

/** 媒体附件简单BO */
export interface MediaAttachmentSimpleBO {
  id: string; // string(long)
  targetId: string; // string(long)
  url: string; // string
  sortOrder: number; // integer(int32)
}

/** 附件项请求 */
export interface AttachmentItemRequest {
  type: MediaType; // string
  objectKey?: string; // COS 对象键；外链类型不传
  url: string; // string
  originalName: string; // string
  sortOrder: number; // integer(int32)
}

// ============================================================
// 举报相关类型
// ============================================================

export interface ReportCreateRequest {
  targetType: TargetType; // string
  targetId: string; // string(long)
  reason: ReportReason; // string
  mark: string; // string
}

// ============================================================
// 查询参数类型
// ============================================================

export interface SearchQuery {
  keyword: string; // 必填
  lastId?: string; // 游标
  pageSize?: number;
}

export interface LegacyPageQuery {
  page?: number;
  pageSize?: number;
}

export interface LegacySearchQuery extends LegacyPageQuery {
  keyword: string;
}

export interface PostPageQuery {
  lastId?: string;
  pageSize?: number;
  status?: number;
  userId?: string;
}

/** 评论分页查询参数 parentId 为 null 时就代表查询子评论 */
export interface CommentPageQuery {
  targetType: TargetType;
  targetId: string;
  parentId?: string;
  lastId?: string;
  pageSize?: number;
}

export interface ActivityPageQuery {
  lastId?: string;
  pageSize?: number;
  category?: number;
  status?: number;
  keyword?: string;
}

export interface ExamPageQuery {
  lastId?: string;
  pageSize?: number;
  category?: number;
  status?: number;
  keyword?: string;
}

export interface NotificationPageQuery {
  cursor?: string;
  pageSize?: number;
  category?: NotificationCategory;
  isRead?: boolean;
}

export interface InteractTargetQuery {
  targetType: TargetType;
  targetId: string;
}

// ============================================================
// 分页相关类型
// ============================================================

/** 活动列表分页结果 */
export interface PageResultActivityListBO {
  list: ActivityListBO[]; // array
  hasMore: boolean; // boolean
  nextCursor: string; // string(long)
}

/** 评论分页结果 */
export interface PageResultCommentVO {
  list: CommentVO[]; // array
  hasMore: boolean; // boolean
  nextCursor: string; // string(long)
}

/** 子评论分页结果 */
export interface PageResultReplyVO {
  list: ReplyVO[]; // array
  hasMore: boolean; // boolean
  nextCursor: string; // string(long)
}

/** 考试分页结果 */
export interface PageResultExamVO {
  list: ExamVO[]; // array
  hasMore: boolean; // boolean
  nextCursor: string; // string(long)
}

/** 帖子列表分页结果 */
export interface PageResultPostListBO {
  list: PostListBO[]; // array
  hasMore: boolean; // boolean
  nextCursor: string; // string(long)
}

// ============================================================
// Result包装器类型
// ============================================================

export type ResultUserProfileVO = Result<UserProfileVO>;
export type ResultUserPublicProfileVO = Result<UserPublicProfileVO>;
export type ResultLoginVO = Result<LoginVO>;
export type ResultUserAgreementStatusVO = Result<UserAgreementStatusVO>;
export type ResultUserSettingVO = Result<UserSettingVO>;
export type ResultCosUploadCredentialDTO = Result<CosUploadCredentialDTO>;
export type ResultActivityDetailVO = Result<ActivityDetailVO>;
export type ResultExamDetailVO = Result<ExamDetailVO>;
export type ResultPostDetailVO = Result<PostDetailVO>;
export type ResultString = Result<string>;
export type ResultLong = Result<number>;
export type ResultVoid = Result<null>;
export type ResultLikeCountVO = Result<LikeCountVO>;
export type ResultLikeStatusVO = Result<LikeStatusVO>;
export type ResultShareCountVO = Result<ShareCountVO>;
export type ResultViewCountVO = Result<ViewCountVO>;
export type ResultListTimelineVO = Result<TimelineVO[]>;
export type ResultPageResultActivityListBO = Result<PageResultActivityListBO>;
export type ResultPageResultCommentVO = Result<PageResultCommentVO>;
export type ResultPageResultExamVO = Result<PageResultExamVO>;
export type ResultPageResultPostListBO = Result<PageResultPostListBO>;
export type ResultAuditCheckResultVO = Result<AuditCheckResultVO>;
export type ResultBindQrInfo = Result<BindQrInfo>;

// ============================================================
// 审核相关类型
// ============================================================

/** 审核文本检查请求 */
export interface AuditTextCheckRequest {
  targetType: TargetType; // string
  targetId: string; // string(long)
  content: string; // string
  scene: number; // integer(int32)
  openid: string; // string
}

/** 审核媒体检查请求 */
export interface AuditMediaCheckRequest {
  targetType: TargetType; // string
  targetId: string; // string(long)
  mediaUrl: string; // string
  mediaType: MediaType; // integer(int32)
  scene: number; // integer(int32)
  openid: string; // string
}

/** 审核检查结果VO */
export interface AuditCheckResultVO {
  passed: boolean; // boolean
  pending: boolean; // boolean
  traceId: string; // string
  suggest: string; // string
  label: number; // integer(int32)
}

/** 微信媒体审核回调请求 */
export interface WxMediaAuditCallbackRequest {
  version: number; // integer(int32)
  appid: string; // string
  traceId: string; // string
  errcode: number; // integer(int32)
  errmsg: string; // string
  result: ResultInfo; // ResultInfo
  detail: unknown[]; // array
  event: string; // string
  fromUserName: string; // string
  msgType: string; // string
  createTime: number; // integer(int32)
  toUserName: string; // string
}

/** 结果信息 */
export interface ResultInfo {
  suggest: string; // string
  label: number; // integer(int32)
}

/** 绑定二维码信息 */
export interface BindQrInfo {
  scene: string; // string
  ticket: string; // string
  qrUrl: string; // string
  expireAt: string; // string(date-time)
}

/** 详情信息 */
export interface DetailInfo {
  strategy: string; // string
  errcode: number; // integer(int32)
  suggest: string; // string
  label: number; // integer(int32)
  prob: number; // integer(int32)
}

/** 小程序创建接口支持的分节与入口；资源引用使用字符串 ID 或 objectKey。 */
export interface EventSectionRequest {
  sectionType: string;
  title: string;
  content: string;
  sortOrder: number;
}
export interface EventActionRequest {
  actionType: number;
  label: string;
  description: string;
  targetValue: string;
  attachmentId?: string;
  attachmentObjectKey?: string;
  isRequired: boolean;
  sortOrder: number;
}
