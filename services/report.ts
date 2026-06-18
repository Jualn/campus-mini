import type { ReportCreateRequest } from '../types/api';
import api from './api';

/**
 * 举报服务
 *
 * 提供举报相关的功能，如提交举报等。
 * @param options 举报请求参数，包含举报对象类型、对象ID、举报理由等信息
 * @returns void
 */
export const report = async (options: ReportCreateRequest): Promise<void> => {
  await api.report.create(options);
  // 举报相关逻辑
};

export default {
  report,
};
