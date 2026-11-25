import { POST_CAPABILITIES } from '../config/post-capabilities';
import type { PostWritePermission } from '../types/post-contract';

export function readPostPermission(value: unknown): PostWritePermission | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const permission = value as Partial<PostWritePermission>;
  if (permission.state === 'ALLOWED' && permission.reason === 'NONE')
    return permission as PostWritePermission;
  if (permission.state === 'BLOCKED' && permission.reason === 'QUALIFICATION_UNAVAILABLE')
    return permission as PostWritePermission;
  if (
    permission.state === 'DENIED' &&
    ['NOT_AUTHORIZED', 'MENTOR_REQUIRED', 'TARGET_UNAVAILABLE', 'TYPE_UNSUPPORTED'].includes(
      permission.reason ?? '',
    )
  )
    return permission as PostWritePermission;
  return undefined;
}

export function resolvePostType(type?: string): string {
  return (
    type ??
    (POST_CAPABILITIES.legacyNormalProvider &&
    !POST_CAPABILITIES.organization &&
    !POST_CAPABILITIES.communityV1
      ? 'NORMAL'
      : 'UNKNOWN')
  );
}
export function postWriteFeedback(
  type: string,
  permission?: PostWritePermission,
  discussion = false,
): string {
  if (type === 'NORMAL') {
    // The ordinary comment endpoint authorizes the caller at submission time.
    return '';
  }
  if (type !== 'MENTOR_QA') return '暂不支持此内容类型，当前仅可浏览';
  if (!POST_CAPABILITIES.mentorQa) return '导师答疑尚未开放';
  if (permission?.state === 'BLOCKED')
    return discussion
      ? '写入状态暂不可确认，请稍后再试'
      : '导师资格服务暂不可用，请稍后再试';
  if (permission?.state === 'DENIED') {
    if (discussion) return '当前内容暂不能评论或回复';
    return permission.reason === 'MENTOR_REQUIRED'
      ? '暂无正式回答权限，请联系管理员核实人员关联及导师资格'
      : '当前问题暂不能正式回答';
  }
  if (!discussion && !POST_CAPABILITIES.mentorAnswers)
    return '正式导师回答暂未开放';
  if (permission?.state === 'ALLOWED' && permission.reason === 'NONE') return '';
  return '写入资格暂不可确认，当前仅可浏览';
}
export function postFieldFeedback(pointer: string, code: string): string {
  const field = pointer.startsWith('/topicIds')
    ? '话题'
    : pointer === '/categoryId'
      ? '分类'
      : '输入内容';
  const reasons: Record<string, string> = {
    REQUIRED: '尚未选择',
    NOT_FOUND: '已不存在',
    INACTIVE: '已禁用，请重新选择',
    NOT_APPLICABLE: '不适用于当前内容',
    LIMIT_EXCEEDED: '超过允许数量',
    DUPLICATE: '重复选择',
    INVALID_ETAG: '版本信息无效，请重新读取',
  };
  return `${field}：${reasons[code] ?? '验证未通过，请检查后重试'}`;
}
export function assertStrongEtag(etag?: string): string {
  if (!etag || !/^"[^"\r\n]+"$/.test(etag)) throw new Error('缺少有效强 ETag，无法编辑');
  return etag;
}
export function validateTopicIds(ids: string[]): void {
  if (ids.length > 3 || new Set(ids).size !== ids.length || ids.some((id) => !id))
    throw new Error('最多选择三个不同话题');
}
