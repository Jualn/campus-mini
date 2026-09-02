import type { CommentItem, ReplyItem } from '../../types/business';
import { getAvatarInfo } from '../../utils/avatar';

export interface CommentAuthor {
  userId: string;
  nickName: string;
  avatarBg: string;
  avatarChar: string;
  avatarUrl: string;
}

export function createCommentAuthor({
  userId,
  nickName,
  avatarUrl,
}: {
  userId?: string;
  nickName?: string;
  avatarUrl?: string;
}): CommentAuthor {
  const displayName = nickName ?? '我';
  const avatar = getAvatarInfo(displayName);
  return {
    userId: userId ?? '',
    nickName: displayName,
    avatarBg: avatar.bg,
    avatarChar: avatar.char,
    avatarUrl: avatarUrl ?? '',
  };
}

export function createOptimisticReply({
  id,
  author,
  content,
  replyToName,
  replyToUserId,
}: {
  id: string;
  author: CommentAuthor;
  content: string;
  replyToName: string;
  replyToUserId?: string;
}): ReplyItem {
  return {
    replyId: id,
    userId: author.userId,
    nickName: author.nickName,
    content,
    avatarUrl: author.avatarUrl,
    createTime: '刚刚',
    likeCount: 0,
    isLiked: false,
    replyToName,
    replyToUserId,
    _avatarChar: author.avatarChar,
    _avatarBg: author.avatarBg,
  };
}

export function createOptimisticComment({
  id,
  author,
  content,
  imageUrl,
}: {
  id: string;
  author: CommentAuthor;
  content: string;
  imageUrl: string;
}): CommentItem {
  return {
    commentId: id,
    userId: author.userId,
    nickName: author.nickName,
    content,
    avatarUrl: author.avatarUrl,
    imageUrl,
    createTime: '刚刚',
    likeCount: 0,
    isLiked: false,
    replyCount: 0,
    replyPreview: [],
    replyList: [],
    repliesExpanded: true,
    hasMoreReplies: false,
    loadingReplies: false,
    remainReplies: 0,
    lastId: '',
    _avatarChar: author.avatarChar,
    _avatarBg: author.avatarBg,
  };
}

export function mergeUniqueReplies(current: ReplyItem[], incoming: ReplyItem[]): ReplyItem[] {
  const existingIds = new Set(current.map((reply) => reply.replyId));
  return [...current, ...incoming.filter((reply) => !existingIds.has(reply.replyId))];
}

export function buildCommentUpdatePatch(
  index: number,
  fields: Partial<CommentItem>,
): Record<string, unknown> {
  const prefix = `commentList[${index.toString()}]`;
  const updates: Record<string, unknown> = {};
  Object.keys(fields).forEach((key) => {
    updates[`${prefix}.${key}`] = fields[key as keyof CommentItem];
  });
  return updates;
}

export function calculateCommentCount(current: number, delta: number): number {
  return Math.max(0, current + delta);
}

export function isCurrentUser(currentUserId: string, candidateUserId: string): boolean {
  return Boolean(currentUserId) && currentUserId === candidateUserId;
}
