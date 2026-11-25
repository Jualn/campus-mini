import type { PostLifecycle, PostSubmission, PostCommentSubmission } from '../types/post-contract';
export function lifecycleLabel(lifecycle?: PostLifecycle): string {
  if (!lifecycle) return '状态暂未确认';
  if (
    !['PUBLIC', 'TEMPORARY', 'PRIVATE'].includes(lifecycle.visibility) ||
    !['CHECKING', 'PASSED', 'REVIEW_REQUIRED', 'REJECTED', 'CHECK_FAILED'].includes(
      lifecycle.safety,
    )
  )
    return '状态暂未识别，请刷新查看';
  if (lifecycle.authorDeleted) return '已删除';
  if (lifecycle.adminHidden) return '已被管理隐藏';
  if (lifecycle.visibility === 'TEMPORARY')
    return Date.parse(lifecycle.temporaryVisibleUntil ?? '') > Date.now()
      ? '临时公开，仍在检查'
      : '临时公开已到期，请刷新状态';
  if (lifecycle.visibility === 'PUBLIC' && lifecycle.effectiveVersion) {
    if (lifecycle.effectiveVersion !== lifecycle.submissionVersion)
      return `${safetyLabel(lifecycle.safety)}；先前版本仍公开`;
    return '已公开';
  }
  return safetyLabel(lifecycle.safety);
}
export function safetyLabel(safety: string): string {
  return (
    (
      {
        CHECKING: '已受理，尚未公开',
        PASSED: '当前未公开',
        REJECTED: '安全检查未通过',
        REVIEW_REQUIRED: '等待进一步核查',
        CHECK_FAILED: '检查暂不可用',
      } as Record<string, string>
    )[safety] ?? '状态暂未识别，请刷新查看'
  );
}
export function canOpenPublicPostDetail(lifecycle?: PostLifecycle, now = Date.now()): boolean {
  if (
    !lifecycle?.effectiveVersion ||
    lifecycle.authorDeleted ||
    lifecycle.adminHidden
  )
    return false;
  if (lifecycle.visibility === 'PUBLIC') return true;
  return (
    lifecycle.visibility === 'TEMPORARY' &&
    Date.parse(lifecycle.temporaryVisibleUntil ?? '') > now
  );
}

export function knownSubmission(value?: PostSubmission): boolean {
  const l = value?.lifecycle;
  return (
    !!l &&
    ['PUBLIC', 'TEMPORARY', 'PRIVATE'].includes(l.visibility) &&
    ['CHECKING', 'PASSED', 'REJECTED', 'REVIEW_REQUIRED', 'CHECK_FAILED'].includes(l.safety)
  );
}
export function commentLabel(s: PostCommentSubmission): string {
  return s.visibility === 'PUBLIC' && s.safety === 'PASSED' ? '已公开' : safetyLabel(s.safety);
}
export function reportLabel(outcome: string): string {
  return (
    (
      {
        PENDING: '已受理',
        NOT_UPHELD: '举报不成立',
        UPHELD_RETAINED: '举报成立，保留内容',
        UPHELD_HIDDEN: '举报成立，内容已下架',
        TARGET_UNAVAILABLE: '目标已失效',
      } as Record<string, string>
    )[outcome] ?? '结果暂未识别'
  );
}
export const newPostEventId = (): string =>
  `mp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
