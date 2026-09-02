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
import { createLogger } from '../utils/logger';
import type { CommentCreateRequest, CommentPageQuery, CommentVO, ReplyVO } from '../types/api';
import type { CommentItem, ReplyItem, ServiceCursorPage } from '../types/business';
import { getAvatarInfo } from '../utils/avatar';
import { formatTime, TimeStyle } from '../utils/time-util';

const log = createLogger('CommentService');

function transformReplyItem(reply: ReplyVO): ReplyItem {
  return {
    replyId: reply.id,
    userId: reply.author.id || '',
    nickName: reply.author.nickname || '',
    content: reply.content,
    avatarUrl: reply.author.avatarUrl,
    createTime: formatTime(reply.createdAt, TimeStyle.POST) || '',
    likeCount: reply.likeCount,
    isLiked: reply.liked || false,
    replyToName: reply.replyToUser.nickname || '',
    replyToUserId: reply.replyToUser.id,
    _avatarChar: getAvatarInfo(reply.author.nickname).char,
    _avatarBg: getAvatarInfo(reply.author.nickname).bg,
  };
}

function mapCommentItem(comment: CommentVO): CommentItem {
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
    commentId: comment.id,
    userId: comment.author.id || '',
    nickName: comment.author.nickname || '',
    content: comment.content || '',
    avatarUrl: comment.author.avatarUrl,
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
    _avatarChar: getAvatarInfo(comment.author.nickname).char,
    _avatarBg: getAvatarInfo(comment.author.nickname).bg,
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
  query: CommentPageQuery,
): Promise<ServiceCursorPage<CommentItem>> => {
  const page = await api.comment.getList(query);
  return {
    list: page.list.map(mapCommentItem),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
  };
};

export const getReplyList = async (
  query: CommentPageQuery,
): Promise<ServiceCursorPage<ReplyItem>> => {
  const page = await api.comment.getReplyList(query);
  return {
    list: page.list.map(transformReplyItem),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
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
