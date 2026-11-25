import { hasAnswerAttribution, mentorAnswerAvatar } from '../utils/mentor-qa';
// comment.ts
/**
 * 评论服务 (Comment Service)
 *
 * 对齐 OpenAPI：
 * - GET  /v1/comment
 * - POST /v1/comment
 * - DELETE /v1/comment/{commentId}
 */

import { api } from './api';
import { community } from './post-community';
import type { PostThreadRoot } from '../types/post-contract';
import { createLogger } from '../utils/logger';
import type { CommentPageQuery } from '../types/api';
import type { CommentCreateRequest, CommentVO, ReplyVO } from '../types/post-contract';
import type { CommentItem, ReplyItem, ServiceCursorPage } from '../types/business';
import { getAvatarInfo } from '../utils/avatar';
import { formatTime, TimeStyle } from '../utils/time-util';

const log = createLogger('CommentService');

export function transformReplyItem(reply: ReplyVO): ReplyItem {
  return {
    kind: reply.kind,
    replyId: reply.id,
    replyPermission: reply.replyPermission,
    replyToCommentId: reply.replyToCommentId,
    userId: reply.author.id || '',
    nickName: reply.author.nickname ?? '',
    content: reply.content,
    avatarUrl: reply.author.avatarUrl ?? undefined,
    createTime: formatTime(reply.createdAt, TimeStyle.POST) || '',
    likeCount: reply.likeCount,
    isLiked: reply.liked || false,
    replyToName: reply.replyToUser?.nickname ?? '',
    replyToUserId: reply.replyToUser?.id,
    _avatarChar: getAvatarInfo(reply.author.nickname ?? '').char,
    _avatarBg: getAvatarInfo(reply.author.nickname ?? '').bg,
  };
}

export function mapCommentItem(comment: CommentVO): CommentItem {
  const answer =
    comment.kind === 'MENTOR_ANSWER' && hasAnswerAttribution(comment.mentorAnswer)
      ? comment.mentorAnswer
      : undefined;
  const avatar = answer ? mentorAnswerAvatar(answer) : getAvatarInfo(comment.author.nickname ?? '');
  let repliesExpanded = true;
  let hasMoreReplies = false;
  let remainReplies = 0;

  if (comment.replyCount > 0 && comment.previewReplies.length > 0) {
    // 如果有预览评论，则默认未展开
    repliesExpanded = false;
  }
  if (comment.replyCount > comment.previewReplies.length) {
    hasMoreReplies = true;
    remainReplies = Math.max(0, comment.replyCount - comment.previewReplies.length);
  }

  return {
    kind: comment.kind,
    mentorAnswer: answer,
    commentId: comment.id,
    replyPermission: comment.replyPermission,
    userId: comment.author.id || '',
    nickName: answer?.profileAtAnswer.realName ?? comment.author.nickname ?? '',
    content: comment.content || '',
    avatarUrl: comment.author.avatarUrl ?? undefined,
    imageUrl: comment.imageUrl,
    createTime: formatTime(comment.createdAt, TimeStyle.POST) || '',
    likeCount: comment.likeCount || 0,
    isLiked: comment.liked || false,
    replyCount: comment.replyCount || 0,
    replyPreview: comment.previewReplies.map(transformReplyItem),
    replyList: [],
    repliesExpanded: repliesExpanded,
    hasMoreReplies: hasMoreReplies,
    loadingReplies: false,
    remainReplies: remainReplies,
    lastId: '',
    _avatarChar: avatar.char,
    _avatarBg: avatar.bg,
  };
}

export function mapThreadRoot(root: PostThreadRoot, postType?: string): CommentItem {
  if (
    root.state === 'VISIBLE' &&
    postType === 'MENTOR_QA' &&
    (root.kind !== 'MENTOR_ANSWER' ||
      !hasAnswerAttribution(root.mentorAnswer) ||
      root.previewReplies.some((x) => x.kind !== 'DISCUSSION'))
  )
    throw new Error('正式回答的历史身份或讨论表示暂不可确认');
  if (root.state === 'VISIBLE') return { ...mapCommentItem(root), threadState: root.state };
  if (!['AUTHOR_DELETED', 'ADMIN_HIDDEN'].includes(root.state))
    throw new Error('评论服务尚未返回受支持的线程表示');
  // Whitelist placeholder fields; never copy removed body, image or author extensions.
  return {
    commentId: root.id,
    placeholder: true,
    threadState: root.state,
    userId: '',
    nickName: '',
    content: '',
    avatarUrl: '',
    imageUrl: '',
    createTime: '',
    likeCount: 0,
    isLiked: false,
    replyPermission: root.replyPermission,
    replyCount: root.replyCount,
    replyPreview: root.previewReplies.map(transformReplyItem),
    replyList: [],
    repliesExpanded: false,
    hasMoreReplies: root.replyCount > root.previewReplies.length,
    loadingReplies: false,
    remainReplies: Math.max(0, root.replyCount - root.previewReplies.length),
    lastId: '',
    _avatarChar: '',
    _avatarBg: '',
  };
}

/**
 * 分页获取评论
 * @example
 * GET /v1/comment
 * 请求参数: CommentPageQuery
 * {
 *   targetType: number,   // 1=post, 2=activity, 3=exam, 4=comment
 *   targetId: string,
 *   parentId?: number,
 *   lastId?: string,
 *   pageSize?: number
 * }
 *
 * 返回值: ResultPageResultCommentVO
 * {
 *   list: CommentItem[],
 *   hasMore: boolean,
 *   nextCursor: string
 * }
 */
export const getCommentList = async (
  query: CommentPageQuery & { representation?: 'thread'; postType?: string },
): Promise<ServiceCursorPage<CommentItem>> => {
  const thread = query.targetType === 'POST' && query.representation === 'thread';
  const page = thread
    ? await community.roots(query.targetId, query.lastId, query.pageSize)
    : await api.comment.getList((({ postType: _postType, ...wire }) => wire)(query));
  return {
    list: thread
      ? (page.list as PostThreadRoot[]).map((x) => mapThreadRoot(x, query.postType))
      : (page.list as CommentVO[]).map(mapCommentItem),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor ?? undefined,
  };
};

export const getReplyList = async (
  query: CommentPageQuery & { representation?: 'thread'; postType?: string },
): Promise<ServiceCursorPage<ReplyItem>> => {
  const page =
    query.targetType === 'POST' && query.representation === 'thread'
      ? await community.replies(query.targetId, query.parentId ?? '', query.lastId, query.pageSize)
      : await api.comment.getReplyList((({ postType: _postType, ...wire }) => wire)(query));
  if (query.postType === 'MENTOR_QA' && page.list.some((x) => x.kind !== 'DISCUSSION'))
    throw new Error('讨论表示暂不支持');
  return {
    list: page.list.map(transformReplyItem),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor ?? undefined,
  };
};

/**
 * 创建评论
 *
 * POST /v1/comment
 * 请求体: CommentCreateRequest
 * {
 *   targetType: number,
 *   targetId: string,
 *   parentId?: string,
 *   replyToUid?: string,
 *   content: string,
 *   imageUrl?: string
 * }
 *
 * 响应体: ResultLong
 * {
 *   code: number,
 *   message: string,
 *   data: number,
 *   timestamp: number
 * }
 */
export const createComment = async (data: CommentCreateRequest): Promise<string> => {
  return api.comment.create(data);
};

/**
 * 删除评论
 *
 * DELETE /v1/comment/{commentId}
 * 响应体: ResultVoid
 */
export const removeComment = async (commentId: string) => {
  if (!commentId) {
    return Promise.reject(new Error('commentId不能为空'));
  }

  try {
    return await api.comment.remove(commentId);
  } catch (err) {
    log.error('removeComment', `删除评论失败 [${commentId}]`, err);
    throw err;
  }
};
