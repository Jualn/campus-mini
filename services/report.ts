import { POST_CAPABILITIES } from '../config/post-capabilities';
import type { ReportCreateRequest } from '../types/api';
import { api } from './api';

/**
 * 举报服务
 *
 * 提供举报相关的功能，如提交举报等。
 * @param options 举报请求参数，包含举报对象类型、对象ID、举报理由等信息
 * @returns void
 */
export const report = async (options: ReportCreateRequest): Promise<void> => {
  if (POST_CAPABILITIES.communityV1) {
    const { mark, ...request } = options;
    await api.report.create({ ...request, remark: mark });
  } else await api.report.create(options);
  // 举报相关逻辑
};
