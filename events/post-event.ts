import eventBus, { EVENTS } from '../utils/event-bus';
import { postSyncStore } from '../store/postSyncStore';
import type { PostCardItem } from '../types/business';

export interface PostUpdatePayload {
  id: string;
  isLiked?: boolean;
  likeCount?: number;
  commentCount?: number;
  viewCount?: number;
}

export function normalizePostPatch(patch: PostUpdatePayload): PostUpdatePayload | null {
  if (!patch.id) return null;

  const payload: PostUpdatePayload = { id: patch.id };

  if (typeof patch.isLiked === 'boolean') {
    payload.isLiked = patch.isLiked;
  }

  if (typeof patch.likeCount === 'number') {
    payload.likeCount = Math.max(0, patch.likeCount);
  }

  if (typeof patch.commentCount === 'number') {
    payload.commentCount = Math.max(0, patch.commentCount);
  }

  if (typeof patch.viewCount === 'number') {
    payload.viewCount = Math.max(0, patch.viewCount);
  }

  return payload;
}

/**
 * 统一同步帖子局部更新。
 *
 * 目前仍保留 postSyncStore 写入，避免返回页面或重新拉取列表时丢失最近一次本地变更。
 * 页面和组件不要再直接调用 postSyncStore.set 或 eventBus.emit(EVENTS.POST_UPDATED)。
 */
export function emitPostUpdated(patch: PostUpdatePayload): PostUpdatePayload | null {
  const payload = normalizePostPatch(patch);
  if (!payload) return null;

  postSyncStore.set(payload);
  eventBus.emit(EVENTS.POST_UPDATED, payload);
  return payload;
}

export function emitPostCreated(post: PostCardItem): void {
  if (!post.id) return;
  eventBus.emit(EVENTS.POST_CREATED, post);
}

export function emitPostDeleted(postId: string): void {
  if (!postId) return;
  postSyncStore.clear(postId);
  eventBus.emit(EVENTS.POST_DELETED, postId);
}
