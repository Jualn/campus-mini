// Hand-maintained client projection of contracts/api/schemas/post.yaml.
import type {
  AttachmentItemRequest,
  PostListBO as LegacyPostListBO,
  PostPageQuery as LegacyPostPageQuery,
  CommentVO as LegacyCommentVO,
  ReplyVO as LegacyReplyVO,
  CommentCreateRequest as LegacyCommentCreateRequest,
} from './api';

export type PostType = 'NORMAL' | 'MENTOR_QA';
export interface PostWritePermission {
  state: 'ALLOWED' | 'DENIED' | 'BLOCKED';
  reason:
    | 'NONE'
    | 'NOT_AUTHORIZED'
    | 'MENTOR_REQUIRED'
    | 'QUALIFICATION_UNAVAILABLE'
    | 'TARGET_UNAVAILABLE'
    | 'TYPE_UNSUPPORTED';
}
export interface PostTopic {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  displayOrder: number;
}
export interface PostCategory extends PostTopic {
  postTypes: PostType[];
}
export interface PostOrganization {
  qaSummary?: MentorQaSummary;
  title?: string | null;
  postType?: string;
  category?: PostCategory | null;
  topics?: PostTopic[];
  commentPermission?: PostWritePermission;
}
export interface PostEdit {
  title?: string | null;
  content?: string;
  attachmentItems?: AttachmentItemRequest[];
  categoryId?: string | null;
  topicIds?: string[];
}
export interface PostEditableRepresentation {
  id: string;
  postType: PostType;
  title: string | null;
  content: string;
  attachmentItems: AttachmentItemRequest[];
  categoryId: string | null;
  topicIds: string[];
}
export interface DictionaryPage<T> {
  items: T[];
  nextCursor?: string;
}

// Preserve the historical Swagger snapshot; canonical consumer extensions live here.
export interface PostAuthor {
  id: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  platformOperator?: boolean;
}
export interface PostListBO
  extends Omit<LegacyPostListBO, 'title' | 'author' | 'publishedAt'>, PostOrganization {
  author: PostAuthor;
  publishedAt?: string | null;
}
export type PostDetailVO = PostListBO;
export interface PostCreateRequest {
  title?: string | null;
  content: string;
  attachmentItems?: AttachmentItemRequest[] | null;
  postType?: PostType;
  categoryId?: string | null;
  topicIds?: string[];
}
export interface PostPageQuery extends LegacyPostPageQuery {
  answerState?: 'ALL' | 'UNANSWERED' | 'ANSWERED';
  postType?: 'NORMAL' | 'MENTOR_QA' | 'ALL';
  categoryId?: string;
  topicId?: string;
  keyword?: string;
  cursor?: string;
}
export interface PostPage {
  list: PostListBO[];
  hasMore: boolean;
  nextCursor: string | null;
  cursor?: string;
}
export interface CommentCreateRequest extends LegacyCommentCreateRequest {
  questionVersion?: string;
  replyToCommentId?: string;
}
export interface ReplyVO extends Omit<LegacyReplyVO, 'author' | 'replyToUser'> {
  kind?: string;
  author: PostAuthor;
  replyToUser?: PostAuthor;
  replyToCommentId?: string;
  replyPermission?: PostWritePermission;
}
export interface CommentVO extends Omit<LegacyCommentVO, 'author' | 'previewReplies'> {
  kind?: string;
  mentorAnswer?: MentorAnswerAttribution;
  author: PostAuthor;
  previewReplies: ReplyVO[];
  replyPermission?: PostWritePermission;
}

export interface PostLifecycle {
  acceptedAt: string;
  submissionVersion: string;
  effectiveVersion: string | null;
  visibility: string;
  safety: string;
  authorDeleted: boolean;
  adminHidden: boolean;
  temporaryVisibleUntil?: string;
}
export interface PostAuthorNotice {
  code: string;
  message: string;
  occurredAt: string;
}
export interface PostSubmission {
  id: string;
  lifecycle: PostLifecycle;
  availableActions: string[];
  notice?: PostAuthorNotice;
}
export interface MyPost {
  post: PostListBO;
  submission: PostSubmission;
  publicPost?: PostListBO;
}
export interface PostCommentSubmission {
  postType?: PostType;
  kind?: string;
  id: string;
  postId: string;
  parentId: string | null;
  acceptedAt: string;
  visibility: string;
  safety: string;
  availableActions: string[];
  notice?: PostAuthorNotice;
}
export interface MyPostComment {
  kind?: string;
  mentorAnswer?: MentorAnswerAttribution;
  submission: PostCommentSubmission;
  content: string;
  imageUrl?: string;
}
export interface PrivatePostPage<T> {
  items: T[];
  hasMore: boolean;
  nextCursor?: string;
}
export interface PostThreadReply extends ReplyVO {
  parentId: string;
}
export type PostThreadRoot =
  | (CommentVO & { state: 'VISIBLE' })
  | {
      id: string;
      state: 'AUTHOR_DELETED' | 'ADMIN_HIDDEN';
      createdAt: string;
      replyCount: number;
      previewReplies: PostThreadReply[];
      replyPermission: PostWritePermission;
    };
export interface PostCommentContext {
  postId: string;
  availability: string;
  root?: PostThreadRoot;
  focus?: PostThreadReply;
  nextReplyCursor?: string;
}
export interface PostSavedReference {
  postId: string;
  availability: string;
  post?: PostListBO;
  favoritedAt?: string;
  lastViewedAt?: string;
  expiresAt?: string;
}
export interface PostFavoriteState {
  postId: string;
  favorited: boolean;
}
export interface MyPostReport {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  remark?: string | null;
  status: string;
  outcome: string;
  resultSummary?: string;
  createdAt: string;
  handledAt?: string | null;
}

export interface MentorQaSummary {
  questionVersion: string;
  answerState: 'UNANSWERED' | 'ANSWERED';
  publicAnswerCount: number;
  contentLocked: boolean;
  evaluatedAt: string;
}
export interface MentorAnswerAttribution {
  questionVersion: string;
  qualifiedAt: string;
  firstPublishedAt?: string;
  profileAtAnswer: { realName: string; position: string; affiliation: string };
  currentCertification: { state: string; evaluatedAt: string };
}
