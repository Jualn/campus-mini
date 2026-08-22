// interact.ts
/**
 * 交互服务 (Interact Service)
 *
 * 对齐 OpenAPI：
 * - POST /v1/interact/view
 * - POST /v1/interact/share
 * - POST /v1/interact/like
 * - DELETE /v1/interact/like
 * - GET /v1/interact/view/count
 * - GET /v1/interact/share/count
 * - GET /v1/interact/liked
 * - GET /v1/interact/like/count
 */

import { api } from './api';
import { createLogger } from '../utils/logger';
import { TARGET_TYPES, type TargetType } from '../utils/constants';

const log = createLogger('InteractService');
void log;

/**
 * 上报浏览行为
 * 请求体: InteractViewRequest
 * {
 *   targetType: number,
 *   targetId: number
 * }
 * 响应体: ResultString
 */
export const reportView = async (data: {
  targetType: TargetType;
  targetId: string;
}): Promise<void> => {
  await api.interact.reportView(data);
};

/**
 * 上报分享行为
 * 请求体: InteractShareRequest
 * {
 *   targetType: number,
 *   targetId: number,
 *   platform?: number // 1/2
 * }
 * 响应体: ResultString
 */
export const reportShare = async (data: {
  targetType: TargetType;
  targetId: string;
  platform: number;
}): Promise<void> => {
  await api.interact.reportShare(data);
};

/**
 * 点赞
 * 请求体: InteractLikeRequest
 * {
 *   targetType: number,
 *   targetId: number
 * }
 * 响应体: ResultString
 */
export const like = async (data: { targetType: TargetType; targetId: string }): Promise<void> => {
  await api.interact.like({ targetType: data.targetType, targetId: data.targetId });
};

/**
 * 取消点赞
 * 请求体: InteractLikeRequest
 */
export const unlike = async (data: { targetType: TargetType; targetId: string }): Promise<void> => {
  await api.interact.unlike({ targetType: data.targetType, targetId: data.targetId });
};

/**
 * 查询浏览数
 * GET /v1/interact/view/count?targetType=&targetId=
 * 响应体: ResultViewCountVO
 */
export const getViewCount = async (targetType: TargetType, targetId: string): Promise<number> => {
  const res = await api.interact.getViewCount({ targetType, targetId });
  return res.count || 0;
};

/**
 * 查询分享数
 * 响应体: ResultShareCountVO
 */
export const getShareCount = async (targetType: TargetType, targetId: string): Promise<number> => {
  const res = await api.interact.getShareCount({ targetType, targetId });
  return res.count || 0;
};

/**
 * 查询点赞状态
 * 响应体: ResultLikeStatusVO
 */
export const isLiked = async (targetType: TargetType, targetId: string): Promise<boolean> => {
  const res = await api.interact.getLikeStatus({ targetType, targetId });
  return res.liked;
};

/**
 * 查询点赞数
 * 响应体: ResultLikeCountVO
 */
export const getLikeCount = async (targetType: TargetType, targetId: string): Promise<number> => {
  const res = await api.interact.getLikeCount({ targetType, targetId });
  return res.count || 0;
};

export const togglePostLike = (postId: string, isLike = true) => {
  const payload = { targetType: TARGET_TYPES.POST.value, targetId: postId };
  return isLike ? like(payload) : unlike(payload);
};
