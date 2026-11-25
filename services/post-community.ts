import { http } from '../utils/request';
import type {
  PostType,
  MyPost,
  MyPostComment,
  MyPostReport,
  PrivatePostPage,
  PostSavedReference,
  PostFavoriteState,
  PostSubmission,
  PostCommentSubmission,
  PostCommentContext,
  PostThreadRoot,
  PostThreadReply,
  PostCreateRequest,
  CommentCreateRequest,
} from '../types/post-contract';

const privateRead = { sensitive: true, retryAuth: false };
const id = encodeURIComponent;
export const community = {
  myPosts: (cursor?: string, postType?: PostType | 'ALL') =>
    http.get<PrivatePostPage<MyPost>>(
      '/v1/users/me/posts',
      { cursor, pageSize: 20, ...(postType ? { postType } : {}) },
      privateRead,
    ),
  myPost: (postId: string) =>
    http.get<MyPost>(`/v1/users/me/posts/${id(postId)}`, undefined, privateRead),
  postReceipt: (key: string) =>
    http.get<PostSubmission>('/v1/users/me/posts/creation-receipt', { key }, privateRead),
  myComments: (cursor?: string, postType?: PostType | 'ALL') =>
    http.get<PrivatePostPage<MyPostComment>>(
      '/v1/users/me/post-comments',
      { cursor, pageSize: 20, ...(postType ? { postType } : {}) },
      privateRead,
    ),
  myComment: (commentId: string) =>
    http.get<MyPostComment>(`/v1/users/me/post-comments/${id(commentId)}`, undefined, privateRead),
  commentReceipt: (key: string) =>
    http.get<PostCommentSubmission>(
      '/v1/users/me/post-comments/creation-receipt',
      { key },
      privateRead,
    ),
  context: (postId: string, commentId: string) =>
    http.get<PostCommentContext>(
      `/v1/comment/${id(commentId)}/context`,
      { postId },
      { sensitive: true },
    ),
  roots: (targetId: string, lastId?: string, pageSize = 20) =>
    http.get<{ list: PostThreadRoot[]; hasMore: boolean; nextCursor: string | null }>(
      '/v1/comment',
      { targetType: 'POST', targetId, representation: 'thread', lastId, pageSize },
      { sensitive: true },
    ),
  replies: (targetId: string, parentId: string, lastId?: string, pageSize = 20) =>
    http.get<{ list: PostThreadReply[]; hasMore: boolean; nextCursor: string | null }>(
      '/v1/comment/replies',
      { targetType: 'POST', targetId, parentId, representation: 'thread', lastId, pageSize },
      { sensitive: true },
    ),
  favorite: (postId: string) =>
    http.get<PostFavoriteState>(`/v1/post/${id(postId)}/favorite`, undefined, privateRead),
  setFavorite: (postId: string, value: boolean) =>
    value
      ? http.put<PostFavoriteState>(`/v1/post/${id(postId)}/favorite`, undefined, privateRead)
      : http.del<PostFavoriteState>(`/v1/post/${id(postId)}/favorite`, undefined, privateRead),
  favorites: (cursor?: string, postType?: PostType | 'ALL') =>
    http.get<PrivatePostPage<PostSavedReference>>(
      '/v1/users/me/post-favorites',
      { cursor, pageSize: 20, ...(postType ? { postType } : {}) },
      privateRead,
    ),
  history: (cursor?: string, postType?: PostType | 'ALL') =>
    http.get<PrivatePostPage<PostSavedReference>>(
      '/v1/users/me/post-view-history',
      { cursor, pageSize: 20, ...(postType ? { postType } : {}) },
      privateRead,
    ),
  clearHistory: () =>
    http.del<{ clearedThrough: string }>('/v1/users/me/post-view-history', undefined, privateRead),
  reports: (lastId?: string) =>
    http.get<{ list: MyPostReport[]; hasMore: boolean; nextCursor: string | null }>(
      '/v1/reports/me',
      { lastId, pageSize: 20 },
      privateRead,
    ),
  report: (reportId: string) =>
    http.get<MyPostReport>(`/v1/reports/me/${id(reportId)}`, undefined, privateRead),
  createPost: (payload: PostCreateRequest, key: string) =>
    http.post<{ data: unknown; submission?: PostSubmission }>('/v1/post', payload, {
      ...privateRead,
      preserveEnvelope: true,
      headers: { 'Idempotency-Key': key },
    }),
  createComment: (payload: CommentCreateRequest, key: string) =>
    http.post<{ data: string; submission?: PostCommentSubmission }>('/v1/comment', payload, {
      ...privateRead,
      preserveEnvelope: true,
      headers: { 'Idempotency-Key': key },
    }),
};
