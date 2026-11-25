import { POST_CAPABILITIES } from '../config/post-capabilities';
import { createCommunityPost } from './post-creation';
import * as interactService from '../services/interact';
import * as postService from '../services/post';
import { emitPostCreated, emitPostDeleted, emitPostUpdated } from '../events/post-event';
import { postSyncStore } from '../stores/postSyncStore';
import { getUserId } from '../stores/helper';
import { TARGET_TYPES } from '../utils/constants';
import { createLogger } from '../utils/logger';
import type { PostCardItem, PostDetail } from '../types/business';
import type { PostCreateRequest, PostLifecycle } from '../types/post-contract';
import type { PostUpdatePayload } from '../events/post-event';
import { peekCurrentProfile } from './current-user';
import { projectPostAuthor } from '../utils/user-projection';

export const syncPostAuthor = <T extends PostCardItem | PostDetail>(post: T): T =>
  projectPostAuthor(post, peekCurrentProfile());

const log = createLogger('PostAction');

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
  post = syncPostAuthor(post);
  const cached = postSyncStore.get(post.id);
  if (!cached) return post;

  const nextIsLiked = typeof cached.isLiked === 'boolean' ? cached.isLiked : post.isLiked;

  const nextLikeCount =
    typeof cached.likeCount === 'number' ? Math.max(0, cached.likeCount) : post.likeCount;

  const nextCommentCount =
    !POST_CAPABILITIES.communityV1 && typeof cached.commentCount === 'number'
      ? Math.max(0, cached.commentCount)
      : post.commentCount;

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
  if (!userId || userId !== getUserId()) throw new Error('只能查看自己的喜欢内容');
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

export const publishPostAndSync = async (
  data: PostCreateRequest,
): Promise<{ id: string; lifecycle?: PostLifecycle }> => {
  if (
    data.postType === 'MENTOR_QA' &&
    (!POST_CAPABILITIES.communityV1 ||
      !POST_CAPABILITIES.mentorQa ||
      !POST_CAPABILITIES.organization ||
      !data.categoryId ||
      !data.content.trim())
  )
    throw new Error('答疑尚未开放或缺少正文、适用分类');
  if (POST_CAPABILITIES.communityV1) {
    if (!data.content.trim() && !data.attachmentItems?.some((x) => x.type === 'IMAGE' && x.url))
      throw new Error('请填写正文或添加图片');
    if ((data.attachmentItems?.length ?? 0) > 9) throw new Error('最多添加九张图片');
    if (!POST_CAPABILITIES.organization && (data.categoryId || data.topicIds?.length))
      throw new Error('分类话题服务尚未开放');
    return createCommunityPost(data);
  }
  const post = await postService.publishPost(data);
  emitPostCreated(post);
  return post;
};

export const deletePostAndSync = async (postId: string): Promise<void> => {
  await postService.deletePost(postId);
  emitPostDeleted(postId);
};

const legacyViewedPostIds = new Set<string>();
export const recordPostView = (
  postId: string,
  currentViewCount?: number,
  postType = 'NORMAL',
): boolean => {
  const owner = getUserId();
  if (!postId || !owner) return false;
  if (
    (postType !== 'NORMAL' && !(postType === 'MENTOR_QA' && POST_CAPABILITIES.mentorQa)) ||
    !POST_CAPABILITIES.communityV1
  ) {
    if (!['NORMAL', 'MENTOR_QA'].includes(postType) || legacyViewedPostIds.has(postId))
      return false;
    legacyViewedPostIds.add(postId);
    if (legacyViewedPostIds.size > 500)
      legacyViewedPostIds.delete(legacyViewedPostIds.values().next().value ?? '');
    const nextViewCount =
      Math.max(currentViewCount ?? 0, postSyncStore.get(postId)?.viewCount ?? 0) + 1;
    postSyncStore.set({ id: postId, viewCount: nextViewCount }, { ttlMs: 10 * 60 * 1000 });
    syncPostPatch({ id: postId, viewCount: nextViewCount });
    void interactService
      .reportView({ targetType: TARGET_TYPES.POST.value, targetId: postId })
      .catch((error: unknown) => {
        log.warn('recordPostView', 'report view failed', error);
      });
    return true;
  }
  interactService
    .reportView({ targetType: TARGET_TYPES.POST.value, targetId: postId })
    .then(async () => {
      const detail = await postService.getPostDetail(postId);
      if (owner === getUserId()) syncPostPatch({ id: postId, viewCount: detail.viewCount });
    })
    .catch((err: unknown) => {
      log.warn('recordPostView', 'report view failed', err);
    });
  return true;
};

export const clearPostViewHistory = (): void => {
  // Clearing session memory never resets the server-owned NORMAL daily quota.
  legacyViewedPostIds.clear();
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
