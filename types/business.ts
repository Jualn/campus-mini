// 业务实体类型

import { type TargetType } from '../utils/constants';
import type { ActivityUiStatus, Attachment, Contact, TimelineNode } from '../services/activity';

// *********************** Service 层返回类型定义 ***********************

export interface ServiceDataResult<T> {
  data: T;
}
export interface ServiceCursorPage<T> {
  list: T[];
  hasMore: boolean;
  nextCursor?: string;
}

// *********************** components 中使用的类型定义 ***********************

// components/comment-panel/index.ts 中使用的类型
export interface ReplyItem {
  replyId: string;
  userId: string;
  nickName: string;
  content: string;
  avatarUrl?: string;
  createTime?: string;
  likeCount: number;
  isLiked?: boolean;
  replyToName?: string;
  _avatarChar: string;
  _avatarBg: string;
}
export interface ReplyTarget {
  commentId: string;
  nickName: string;
  userId: string;
}
export interface CommentItem {
  commentId: string;
  userId: string;
  nickName: string;
  content: string;
  avatarUrl?: string;
  imageUrl?: string;
  createTime?: string;
  likeCount: number;
  isLiked?: boolean;
  replyCount: number;
  replyPreview?: ReplyItem[];
  /** 已展示数据 */
  replyList: ReplyItem[];
  repliesExpanded: boolean;
  hasMoreReplies: boolean;
  loadingReplies: boolean;
  remainReplies: number;
  /** 分页游标，记录子评论下一次请求的最后一个id */
  lastId: string;
  _avatarChar: string;
  _avatarBg: string;
}

// components/user-profile/index.ts 中使用的类型

// user-profile 组件中使用的 tab 值
export type UserProfileTab = 'posts' | 'likes';
export interface UserProfileInfo {
  /** 目前只用于了me页面使用 */
  id?: string;
  bannerUrl?: string;
  avatarUrl?: string;
  nickname: string;
  verified?: boolean;
  // handle?: string;
  bio?: string;
  joinYear?: string;
  // followingCount?: number;
  // followerCount?: number;
  //  likeCount?: number;
}

// components/post-card/index.ts 中使用的类型
export interface PostCardItem {
  id: string;
  userId: string;
  avatarUrl: string;
  nickname: string;
  createdAt: string;
  content: string;
  images?: string[];
  commentCount: number;
  isLiked: boolean;
  likeCount: number;
  viewCount: number;
}

// components/in-app-banner/index.ts 中使用的类型
export type BannerRouteMethod = 'navigateTo' | 'switchTab';

export type BannerMessage = Partial<{
  id: string;
  type: string;
  icon: string;
  tagText: string;
  title: string;
  content: string;
  targetType: string;
  targetId: string;
  notificationCount: number;
  isAggregate: boolean;
  accentClass: string;
  routeUrl: string;
  routeMethod: BannerRouteMethod;
}>;

// *********************** subpkg_setting 中使用的类型定义 ***********************

// subpkg_setting/pages/setting/setting.ts 中使用的类型
export interface Settings {
  notify: {
    activity: boolean;
    exam: boolean;
    interaction: boolean;
    system: boolean;
    audit: boolean;
  };
}

// ************************** subpkg_user 类型定义 *****************************

// subpkg_user/pages/edit-profile/edit-profile.ts 中使用的类型
/**
 * 用户编辑资料表单
 */
export interface EditProfileForm {
  nickname: string;
  bio: string;
  // handle: string;
  // school: string;
  // dept: string;
  // gender: string;
  avatarUrl: string;
  bannerUrl: string;
}

// subpkg_user/pages/user/user.ts 中使用的类型
export interface UserPageData {
  userInfo: UserProfileInfo;
  posts: PostCardItem[];
  activeTab: string;
  // isFollowing: boolean;
}

// *********************** subpkg_exam 中使用的类型定义 ***********************

// subpkg_exam/pages/detail/detail.ts 中使用的类型
export interface ExamDetail {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  desc?: string;
  organizer?: string;
  tagline: string;
  frequency?: string;
  timeSource?: string;
  timeline?: ExamTimelineItem[];
  info?: ExamInfoItem[];
  subjects?: ExamSubjectItem[];
  mustKnow?: string[];
  links?: ExamLinkItem[];
}
export interface ExamTimelineItem {
  /** 时间线标签,如“报名开始”、“考试时间”等 */
  label: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  time?: string;
  /** 信息来源,如“官方发布”、“网友爆料”等 */
  source?: string;
  note?: string;
}
export interface ExamInfoItem {
  /** 信息项标签，如“报名条件”、“考试科目”等 */
  label: string;
  /** 信息内容 */
  value: string;
}
export interface ExamSubjectItem {
  /** 科目名称，如“英语”、“数学”等 */
  name: string;
  /** 考试分数，如“150分”、“120分”等 */
  score?: string;
  /** 科目描述 */
  desc?: string;
}
export interface ExamLinkItem {
  icon?: string;
  /** 链接标签，如“报名入口”、“准考证打印”等 */
  label: string;
  desc?: string;
  url: string;
  /* 是否是主要链接，如报名链接、准考证打印链接等 */
  primary?: boolean;
}

// subpkg_exam/pages/list/list.ts 中使用的类型
export interface ExamListPagePayload {
  allExams: ExamListItem[];
  hotExam: HotExam;
}
export interface ExamSearchItem {
  id: string;
  color?: string;
  icon?: string;
  name: string;
  tagline: string;
}
export interface HotExam {
  id: string;
  color?: string;
  enrollStatus?: string;
  name: string;
  tagline: string;
  examDate?: string;
  icon?: string;
  daysLeft: number;
}
export interface ExamListItem {
  id: string;
  color?: string;
  icon?: string;
  name: string;
  enrollStatus?: string;
  tagline: string;
  frequency?: string;
  daysLeft: number;
  examDate?: string;
  category?: string;
  currentTerm?: {
    enrollStart?: string;
    enrollEnd?: string;
    examDate?: string;
    admitDate?: string;
    resultDate?: string;
  };
}

// ************************ subpkg_activity 中使用的类型定义 ***********************

// subpkg_activity/pages/list/list.ts 中使用的类型
/** 列表页卡片（轻量，只含卡片所需字段） */
export interface ActivityCard {
  id: string;
  title: string;
  type: string;
  typeIcon: string;
  typeColor: string;
  scope: string[];
  location: string;
  organizer: string;
  max_participants: number | null;
  // summary: string;
  status: ActivityUiStatus;
  statusLabel: string;
  /** 距报名截止剩余天数，无截止或已过期时为 null */
  daysToDeadline: number | null;
  enroll_deadline: string;
  // startDateShort: string;
  cover?: string;
  published_at: string;
  // series_name: string;
}

// subpkg_activity/pages/detail/detail.ts 中使用的类型
/** 详情页数据（在 ActivityCard 基础上扩展完整字段） */
export interface ActivityDetail {
  id: string;
  typeIcon: string;
  typeColor: string;
  cover?: string;
  title: string;
  type: string;
  statusLabel: string;
  organizer: string;
  scope: string[];
  startDateShort: string;
  daysToDeadline: number | null;
  status: ActivityUiStatus;
  description: string;
  location: string;
  max_participants: number | null;
  enroll_deadline: string;
  start_time: string;
  end_time: string;
  timeline: TimelineNode[];
  // rewards: Reward[];
  join_method: string;
  qrcode_url?: string;
  contacts: Contact[];
  attachments: Attachment[];
  // source: string;
  published_at: string;
  is_cancelled: boolean;
}

// ************************** subpkg_community 中使用的类型定义 ***********************

// subpkg_community/pages/detail/detail.ts 中使用的类型
export interface PostDetail {
  id: string;
  avatar: string;
  _avatarBg: string;
  _avatarChar: string;
  userId: string;
  nickname: string;
  verified?: boolean;
  createdAtText: string;
  // ipLocation?: string;
  // handle?: string;
  isSelf?: boolean;
  // isFollowing?: boolean;
  content: string;
  images?: string[];
  // topics?: string[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
}

// *************************** message 页面中使用的类型定义 *******************************
export interface MessageFeedData {
  allMessages: MessageItem[];
  groupedMessages: MessageItem[];
  urgentMessages: MessageItem[];
  olderMessages: MessageItem[];
  unreadCount: number;
  totalCount: number;
  filterTabs: FilterTab[];
}
/**
 * 通知消息类型
 */
export type MessageType = 'system' | 'activity' | 'exam' | 'interaction';
/**
 * 通知消息项
 */
export interface MessageItem {
  id: string;
  type: MessageType;
  icon: string;
  title: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  targetType: TargetType;
  targetId: string;
  timeAgo?: string;
  shortTitle?: string;
  shortContent?: string;
  typeLabel?: string;
  actionLabel?: string;
  isUrgent?: boolean;
  senderInitial?: string;
  _isGroup?: boolean;
  _grouped?: MessageItem[];
  groupTitle?: string;
  timeRange?: string;
}
export interface FilterTab {
  id: string;
  icon: string;
  label: string;
  count?: number;
}

// ****************************** index 页面中使用的类型定义 *******************************
/**
 * 首页活动卡片
 */
export interface IndexActivityCard {
  id: string;
  title: string;
  poster: string;
}

export interface IndexExamCardItem {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** YYYY-MM-DD */
  date: string;
  days: number;
}

// ******************************  me 页面中使用的类型定义 *******************************
export interface MePageData {
  userInfo: UserProfileInfo;
  posts: PostCardItem[];
  activeTab: string;
}
