import type { MentorAnswerAttribution, MentorQaSummary } from '../types/post-contract';
import { getAvatarInfo } from './avatar';

export function mentorAnswerAvatar(answer: MentorAnswerAttribution) {
  return getAvatarInfo(answer.profileAtAnswer.realName);
}
/** No fallback from commentCount, current account identity or missing historical proof. */
export function readQaSummary(value: unknown): MentorQaSummary | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const s = value as Partial<MentorQaSummary>;
  if (
    typeof s.questionVersion !== 'string' ||
    !s.questionVersion.trim() ||
    typeof s.publicAnswerCount !== 'number' ||
    !Number.isInteger(s.publicAnswerCount) ||
    s.publicAnswerCount < 0 ||
    typeof s.contentLocked !== 'boolean' ||
    typeof s.evaluatedAt !== 'string' ||
    !Number.isFinite(Date.parse(s.evaluatedAt))
  )
    return undefined;
  if (
    s.publicAnswerCount === 0
      ? s.answerState !== 'UNANSWERED'
      : s.answerState !== 'ANSWERED' || !s.contentLocked
  )
    return undefined;
  return s as MentorQaSummary;
}
export function qaAnswerLabel(value?: MentorQaSummary): string {
  const summary = readQaSummary(value);
  return summary
    ? summary.answerState === 'UNANSWERED'
      ? '待回答'
      : `已有回答 · ${summary.publicAnswerCount.toString()} 条正式回答`
    : '回答状态暂不可确认';
}
export function certificationLabel(state?: string): string {
  return (
    (
      {
        VALID: '当前导师认证有效',
        INACTIVE: '当前原账号与原人员组合不再认证',
        UNAVAILABLE: '当前导师认证暂不可确认',
      } as Record<string, string>
    )[state ?? ''] ?? '当前导师认证状态未知'
  );
}
export function hasAnswerAttribution(
  value: unknown,
  published = true,
): value is MentorAnswerAttribution {
  if (!value || typeof value !== 'object') return false;
  const a = value as Partial<MentorAnswerAttribution>;
  return (
    typeof a.questionVersion === 'string' &&
    !!a.questionVersion.trim() &&
    typeof a.qualifiedAt === 'string' &&
    Number.isFinite(Date.parse(a.qualifiedAt)) &&
    (!published ||
      (typeof a.firstPublishedAt === 'string' &&
        Number.isFinite(Date.parse(a.firstPublishedAt)))) &&
    !!a.profileAtAnswer &&
    ['realName', 'position', 'affiliation'].every(
      (k) =>
        typeof a.profileAtAnswer?.[k as keyof MentorAnswerAttribution['profileAtAnswer']] ===
          'string' &&
        !!a.profileAtAnswer[k as keyof MentorAnswerAttribution['profileAtAnswer']].trim(),
    ) &&
    !!a.currentCertification &&
    typeof a.currentCertification.state === 'string' &&
    typeof a.currentCertification.evaluatedAt === 'string' &&
    Number.isFinite(Date.parse(a.currentCertification.evaluatedAt))
  );
}
