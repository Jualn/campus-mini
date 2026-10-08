// post.ts
/**
 * 帖子服务 (Post Service)
 *
 * 对齐 OpenAPI：
 * - GET  /v1/post
 * - POST /v1/post
 * - GET  /v1/post/{postId}
 * - DELETE /v1/post/{postId}
 */

import { api } from './api';
import type { PostCardItem, PostDetail, ServiceCursorPage } from '../types/business';
import type { PostCreateRequest, PostDetailVO, PostListBO } from '../types/api';
import { formatTime, TimeStyle } from '../utils/time-util';
import { getAvatarInfo } from '../utils/avatar';

export const mapPostListItem = (post: PostListBO): PostCardItem => ({
  id: post.id,
  userId: post.author.id,
  content: post.content || '',
  images: post.attachments.map((item) => item.url).filter(Boolean),
  createdAt: formatTime(post.publishedAt || '', TimeStyle.POST),
  nickname: post.author.nickname || '',
  avatarUrl: post.author.avatarUrl || '',
  commentCount: post.commentCount || 0,
  likeCount: post.likeCount || 0,
  viewCount: post.viewCount || 0,
  isLiked: post.liked,
});

const mapPostDetail = (post: PostDetailVO): PostDetail => ({
  id: post.id,
  userId: post.author.id,
  nickname: post.author.nickname || '',
  avatar: post.author.avatarUrl || '',
  // ipLocation: '', // API 当前未提供IP归属信息，后续根据实际数据调整
  // handle: '', // API 当前未提供用户handle信息，后续根据实际数据调整
  content: post.content || '',
  images: post.attachments.map((item) => item.url).filter(Boolean),
  // topics: [],
  commentCount: post.commentCount || 0,
  likeCount: post.likeCount || 0,
  isLiked: post.liked,
  createdAtText: post.publishedAt ? formatTime(post.publishedAt, TimeStyle.POST) : '',
  viewCount: post.viewCount || 0,
  isSelf: false,
  // isFollowing: false,
  _avatarBg: getAvatarInfo(post.author.nickname).bg,
  _avatarChar: getAvatarInfo(post.author.nickname).char,
});

/**
 * 获取帖子列表
 *
 * GET /v1/post
 * 请求参数: PostPageQuery
 * {
 *   lastId?: number,
 *   pageSize?: number,
 *   status?: number
 * }
 *
 * 响应体: ResultPageResultPostListBO
 * {
 *   code: number,
 *   message: string,
 *   data: {
 *     list: [{ id, title, content, likeCount, commentCount, viewCount, publishedAt, author, attachments }],
 *     hasMore: boolean,
 *     nextCursor: number
 *   },
 *   timestamp: number
 * }
 */
export const fetchPostList = async (query: {
  lastId?: string;
  pageSize?: number;
  status?: number;
}): Promise<ServiceCursorPage<PostCardItem>> => {
  const page = await api.post.getList(query);
  return {
    list: page.list.map(mapPostListItem),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
  };
};

/**
 * 获取用户的帖子列表
 *
 * @param userId 用户id
 * @param options 可选项，包括分页参数 lastId 和 pageSize，以及状态过滤 status
 * @returns 帖子列表和分页信息
 */
export const getUserPosts = async (
  userId: string,
  options: { lastId?: string; pageSize?: number; status?: number } = {},
): Promise<ServiceCursorPage<PostCardItem>> => {
  const { lastId, pageSize = 20, status } = options;

  const page = await api.post.getList({
    lastId,
    pageSize,
    status,
    userId,
  });
  return {
    list: page.list.map(mapPostListItem),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
  };
};

/**
 * 获取用户点赞的帖子列表
 * GET /v1/post/liked?userId={userId}&lastLikeId={lastLikeId}&pageSize={pageSize}
 * 响应体: ResultPageResultPostListBO
 *
 * @param userId 用户id
 * @param options 可选项，包括分页参数 lastId 和 pageSize
 * @returns 帖子列表和分页信息
 */
export const getUserLikedPosts = async (
  userId: string,
  options: { lastId?: string; pageSize?: number } = {},
): Promise<ServiceCursorPage<PostCardItem>> => {
  const { lastId, pageSize = 20 } = options;

  const page = await api.post.getUserLikePost(userId, lastId, pageSize);
  return {
    list: page.list.map(mapPostListItem),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
  };
};

/**
 * 获取帖子详情
 *
 * GET /v1/post/{postId}
 * 响应体: ResultPostDetailVO
 * {
 *   code: number,
 *   message: string,
 *   data: {
 *     id: number,
 *     title: string,
 *     content: string,
 *     likeCount: number,
 *     commentCount: number,
 *     viewCount: number,
 *     publishedAt: string,
 *     author: { id, nickname, avatarUrl },
 *     attachments: MediaAttachmentSimpleBO[]
 *   },
 *   timestamp: number
 * }
 * @param {string} postId - 帖子ID
 * @returns {Promise}
 */
export const getPostDetail = async (postId: string): Promise<PostDetail> => {
  if (!postId) {
    return Promise.reject(new Error('postId不能为空'));
  }

  const detail = await api.post.getDetail(postId);
  return mapPostDetail(detail);
};

/**
 * 发布新帖子
 *@example
 * POST /v1/post
 * 请求体: PostCreateRequest
 * {
 *   title?: string,
 *   content: string,
 *   attachmentItems?: [{ type, url, originalName?, sortOrder? }]
 * }
 *
 * 响应体: ResultPostListBO
 */
export const publishPost = async (data: PostCreateRequest): Promise<PostCardItem> => {
  const { content, title, attachmentItems } = data;

  if (!content || content.trim().length === 0) {
    return Promise.reject(new Error('帖子内容不能为空'));
  }

  const card = await api.post.create({
    title,
    content: content.trim(),
    attachmentItems,
  });

  return mapPostListItem(card);
};

/**
 * 编辑帖子（后端文档当前未列出对应接口，作为本地扩展保留）
 * @param {number} postId - 帖子ID
 * @param {Object} data - 更新的数据
 * @returns {Promise}
 */
export const editPost = async (
  postId: string,
  data: Partial<PostCreateRequest>,
): Promise<unknown> => {
  if (!postId) {
    return Promise.reject(new Error('postId不能为空'));
  }

  return api.post.edit(postId, data);
};

/**
 * 删除帖子
 *
 * DELETE /v1/post/{postId}
 * 响应体: ResultString
 * @param {string} postId - 帖子ID
 * @returns {Promise}
 */
export const deletePost = async (postId: string): Promise<void> => {
  if (!postId) {
    return Promise.reject(new Error('postId不能为空'));
  }

  await api.post.remove(postId);
};

/**
 * 收藏帖子（后端文档当前未列出，作为本地扩展保留）
 * @param {string} postId - 帖子ID
 * @param {boolean} collect - true收藏，false取消收藏
 * @returns {Promise}
 */
export const togglePostCollect = (postId: string, collect: boolean): Promise<unknown> => {
  if (!postId) {
    return Promise.reject(new Error('postId不能为空'));
  }

  return Promise.resolve({ postId, collect });
};
