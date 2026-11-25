import { getCurrentIdentity, watchCurrentIdentity } from '../actions/current-user';
import { AuthError, HttpError } from '../utils/error';
import { http } from '../utils/request';

export interface CertifiedMentorProfile {
  personId: string;
  bindingId: string;
  qualificationId: string;
  userId: string;
  realName: string;
  position: string;
  affiliation: string;
  certified: true;
  evaluatedAt: string;
  validUntil?: string;
}

export const options = { auth: 'required' as const, sensitive: true, retryAuth: false };
let revision = 0;
let owner = getCurrentIdentity().id;
watchCurrentIdentity(() => {
  const next = getCurrentIdentity().id;
  if (next !== owner) {
    owner = next;
    revision++;
  }
});
export function qualificationSession() {
  const userId = getCurrentIdentity().id,
    generation = revision;
  if (!userId) throw new AuthError();
  return () => {
    if (generation !== revision || userId !== getCurrentIdentity().id) throw new AuthError();
    return userId;
  };
}
export function invalid(): never {
  throw new HttpError(502, 'Invalid qualification response', {
    userMessage: '身份服务响应异常，请重新查询',
  });
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
export function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || Array.from(value).length > max)
    return invalid();
  return value;
}
export function date(value: unknown): string {
  const result = text(value, 100);
  if (!Number.isFinite(Date.parse(result))) return invalid();
  return result;
}

export async function getCertifiedMentorProfile(userId: string): Promise<CertifiedMentorProfile> {
  const check = qualificationSession();
  const value = object(
    await http.get(`/v1/mentors/${encodeURIComponent(text(userId, 128))}`, undefined, options),
  );
  check();
  if (value.userId !== userId || value.certified !== true) return invalid();
  return {
    userId,
    realName: text(value.realName, 100),
    personId: text(value.personId, 128),
    bindingId: text(value.bindingId, 128),
    qualificationId: text(value.qualificationId, 128),
    position: text(value.position, 200),
    affiliation: text(value.affiliation, 200),
    certified: true,
    evaluatedAt: date(value.evaluatedAt),
    ...(value.validUntil === undefined ? {} : { validUntil: date(value.validUntil) }),
  };
}
