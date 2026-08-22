import { interactService, postService } from '../services/index';
import { emitPostCreated, emitPostDeleted, emitPostUpdated } from '../events/post-event';
import { postSyncStore } from '../stores/postSyncStore';
import { getUserId } from '../stores/helper';
import { TARGET_TYPES } from '../utils/constants';
import { createLogger } from '../utils/logger';
import type { PostCardItem, PostDetail } from '../types/business';
import type { PostCreateRequest } from '../types/api';
import type { PostUpdatePayload } from '../events/post-event';

const log = createLogger('PostAction');

const VIEW_PATCH_TTL_MS = 10 * 60 * 1000;
const MAX_VIEWED_POSTS = 500;

const viewedPostIds = new Set<string>();

function pruneViewedOverflow() {
  if (viewedPostIds.size <= MAX_VIEWED_POSTS) return;

  const removeCount = viewedPostIds.size - MAX_VIEWED_POSTS;
  const ids = Array.from(viewedPostIds);

  for (let i = 0; i < removeCount; i += 1) {
    viewedPostIds.delete(ids[i]);
  }
}

export function mergePostSyncCache<T extends PostCardItem | PostDetail>(item: T): T;
export function mergePostSyncCache<T extends PostCardItem | PostDetail>(
  list: T[],
): {
  merged: T[];
  changed: boolean;
};
export function mergePostSyncCache<T extends PostCardItem | PostDetail>(
  input: T | T[],
): T | { merged: T[]; changed: boolean } {
  if (Array.isArray(input)) {
    let changed = false;
    const merged = input.map((post) => {
      const next = mergeOnePost(post);
      if (next !== post) changed = true;
      return next;
    });
    return { merged, changed };
  }

  return mergeOnePost(input);
}

function mergeOnePost<T extends PostCardItem | PostDetail>(post: T): T {
  const cached = postSyncStore.get(post.id);
  if (!cached) return post;

  const nextIsLiked = typeof cached.isLiked === 'boolean' ? cached.isLiked : post.isLiked;

  const nextLikeCount =
    typeof cached.likeCount === 'number' ? Math.max(0, cached.likeCount) : post.likeCount;

  const nextCommentCount =
    typeof cached.commentCount === 'number' ? Math.max(0, cached.commentCount) : post.commentCount;

  const serverViewCount = typeof post.viewCount === 'number' ? Math.max(0, post.viewCount) : 0;
  const cachedViewCount =
    typeof cached.viewCount === 'number' ? Math.max(0, cached.viewCount) : undefined;
  const nextViewCount =
    typeof cachedViewCount === 'number'
      ? Math.max(serverViewCount, cachedViewCount)
      : post.viewCount;

  const hasDiff =
    nextIsLiked !== post.isLiked ||
    nextLikeCount !== post.likeCount ||
    nextCommentCount !== post.commentCount ||
    nextViewCount !== post.viewCount;

  if (!hasDiff) return post;

  return {
    ...post,
    isLiked: nextIsLiked,
    likeCount: nextLikeCount,
    commentCount: nextCommentCount,
    viewCount: nextViewCount,
  };
}

export const syncPostPatch = (patch: PostUpdatePayload): PostUpdatePayload | null =>
  emitPostUpdated(patch);

export const syncPostCommentCount = (postId: string, count: number): PostUpdatePayload | null =>
  syncPostPatch({
    id: postId,
    commentCount: Math.max(0, count || 0),
  });

export const fetchPostList = async (query: Parameters<typeof postService.fetchPostList>[0]) => {
  const page = await postService.fetchPostList(query);
  const { merged } = mergePostSyncCache(page.list);
  return {
    ...page,
    list: merged,
  };
};

export const getUserPosts = async (
  userId: string,
  options?: Parameters<typeof postService.getUserPosts>[1],
) => {
  const page = await postService.getUserPosts(userId, options);
  const { merged } = mergePostSyncCache(page.list);
  return {
    ...page,
    list: merged,
  };
};

export const getUserLikedPosts = async (
  userId: string,
  options?: Parameters<typeof postService.getUserLikedPosts>[1],
) => {
  const page = await postService.getUserLikedPosts(userId, options);
  const { merged } = mergePostSyncCache(page.list);
  return {
    ...page,
    list: merged,
  };
};

export const getPostDetail = async (postId: string): Promise<PostDetail> => {
  const detail = await postService.getPostDetail(postId);
  return {
    ...mergePostSyncCache(detail),
    isSelf: getUserId() === detail.userId,
  };
};

export const publishPostAndSync = async (data: PostCreateRequest): Promise<PostCardItem> => {
  const post = await postService.publishPost(data);
  emitPostCreated(post);
  return post;
};

export const deletePostAndSync = async (postId: string): Promise<void> => {
  await postService.deletePost(postId);
  emitPostDeleted(postId);
};

export const recordPostView = (postId: string, currentViewCount?: number): boolean => {
  if (!postId || viewedPostIds.has(postId)) return false;

  viewedPostIds.add(postId);
  pruneViewedOverflow();

  const cached = postSyncStore.get(postId);
  const baseCount = Math.max(
    typeof currentViewCount === 'number' ? currentViewCount : 0,
    typeof cached?.viewCount === 'number' ? cached.viewCount : 0,
  );

  const nextViewCount = Math.max(0, baseCount + 1);

  postSyncStore.set(
    {
      id: postId,
      viewCount: nextViewCount,
    },
    {
      ttlMs: VIEW_PATCH_TTL_MS,
    },
  );

  syncPostPatch({
    id: postId,
    viewCount: nextViewCount,
  });

  interactService
    .reportView({
      targetType: TARGET_TYPES.POST.value,
      targetId: postId,
    })
    .catch((err: unknown) => {
      log.warn('recordPostView', 'report view failed', err);
    });

  return true;
};

export const clearPostViewHistory = (): void => {
  viewedPostIds.clear();
};

export const togglePostLikeAndSync = async (options: {
  postId: string;
  currentLiked: boolean;
  currentLikeCount: number;
}): Promise<{ liked: boolean; likeCount: number }> => {
  const safeLikeCount = Math.max(0, options.currentLikeCount || 0);
  const nextLiked = !options.currentLiked;
  const nextLikeCount = Math.max(0, safeLikeCount + (options.currentLiked ? -1 : 1));

  syncPostPatch({
    id: options.postId,
    isLiked: nextLiked,
    likeCount: nextLikeCount,
  });

  try {
    if (options.currentLiked) {
      await interactService.unlike({
        targetType: TARGET_TYPES.POST.value,
        targetId: options.postId,
      });
    } else {
      await interactService.like({ targetType: TARGET_TYPES.POST.value, targetId: options.postId });
    }
  } catch (err) {
    syncPostPatch({
      id: options.postId,
      isLiked: options.currentLiked,
      likeCount: safeLikeCount,
    });
    throw err;
  }

  return {
    liked: nextLiked,
    likeCount: nextLikeCount,
  };
};
