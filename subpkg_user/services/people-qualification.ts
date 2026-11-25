// Hand-maintained consumer of canonical api/{paths,schemas}/people-qualification.yaml.
import { http } from '../../utils/request';
import { AuthError, HttpError } from '../../utils/error';
import {
  date,
  invalid,
  object,
  options,
  qualificationSession,
  text,
} from '../../services/mentor-certification';

export { qualificationSession } from '../../services/mentor-certification';
import { getMyPersonBinding, assertCurrentPerson } from '../../services/person-binding';

export interface PartyIdentityApplicationCreate {
  realName: string;
  studentNumber: string;
}
export interface PartyIdentityApplication {
  personId: string;
  bindingId: string;
  applicationId: string;
  applicantUserId: string;
  status: 'APPROVED';
  submittedAt: string;
  decidedAt: string;
  version: string;
  verificationMethod: 'ROSTER_EXACT_MATCH';
}
export interface PartyIdentityApplicationPage {
  items: PartyIdentityApplication[];
  page: number;
  pageSize: number;
  totalItems: number;
  evaluatedAt: string;
}
export type PartyStageId =
  | 'PARTY_ACTIVIST'
  | 'PARTY_DEVELOPMENT_CANDIDATE'
  | 'PROBATIONARY_PARTY_MEMBER'
  | 'FULL_PARTY_MEMBER';
export interface PartyIdentityRecord {
  recordId: string;
  identityKind: 'PARTY_DEVELOPMENT';
  stageId: PartyStageId;
  status: 'ACTIVE' | 'INACTIVE' | 'REVOKED';
  validFrom: string;
  validUntil?: string;
}
export interface MyPartyIdentity {
  personId?: string;
  bindingId?: string;
  userId: string;
  identityVerification?: 'UNKNOWN' | 'DISPUTED' | 'VERIFIED';
  effectiveStatus:
    | 'UNKNOWN'
    | 'DISPUTED'
    | 'NONE'
    | 'ACTIVE'
    | 'EXPIRED'
    | 'INACTIVE'
    | 'REVOKED'
    | 'UNBOUND'
    | 'PERSON_UNAVAILABLE'
    | 'NOT_YET_VALID';
  evaluatedAt: string;
  presence?: 'NONE' | 'RECORDED';
  currentRecord?: PartyIdentityRecord;
  verifiedAt?: string;
  verificationMethod?: string;
}
function application(value: unknown, userId: string): PartyIdentityApplication {
  const item = object(value);
  if (
    item.status !== 'APPROVED' ||
    item.verificationMethod !== 'ROSTER_EXACT_MATCH' ||
    item.applicantUserId !== userId
  )
    return invalid();
  return {
    applicationId: text(item.applicationId, 128),
    personId: text(item.personId, 128),
    bindingId: text(item.bindingId, 128),
    applicantUserId: userId,
    status: 'APPROVED',
    submittedAt: date(item.submittedAt),
    decidedAt: date(item.decidedAt),
    version: text(item.version, 128),
    verificationMethod: 'ROSTER_EXACT_MATCH',
  };
}
export function normalizePartyApplication(
  body: PartyIdentityApplicationCreate,
): PartyIdentityApplicationCreate {
  // Only trim ends; preserve leading zeroes, internal spaces and character case.
  return {
    realName: text(body.realName.trim(), 100),
    studentNumber: text(body.studentNumber.trim(), 100),
  };
}
export async function createMyPartyIdentityApplication(
  body: PartyIdentityApplicationCreate,
  key: string,
) {
  const check = qualificationSession();
  const normalized = normalizePartyApplication(body);
  const value = await http.post('/v1/users/me/party-identity-applications', normalized, {
    ...options,
    headers: { 'Idempotency-Key': text(key, 128) },
  });
  return application(value, check());
}
export async function listMyPartyIdentityApplications(
  page = 1,
): Promise<PartyIdentityApplicationPage> {
  const check = qualificationSession();
  const value = object(
    await http.get('/v1/users/me/party-identity-applications', { page, pageSize: 20 }, options),
  );
  const userId = check();
  if (
    !Array.isArray(value.items) ||
    value.page !== page ||
    value.pageSize !== 20 ||
    !Number.isInteger(value.totalItems) ||
    Number(value.totalItems) < value.items.length
  )
    return invalid();
  return {
    items: value.items.map((item) => application(item, userId)),
    page,
    pageSize: 20,
    totalItems: Number(value.totalItems),
    evaluatedAt: date(value.evaluatedAt),
  };
}
export async function getMyPartyIdentity(): Promise<MyPartyIdentity> {
  const check = qualificationSession();
  const binding = await getMyPersonBinding();
  const value = object(await http.get('/v1/users/me/party-identity', undefined, options));
  if (value.userId !== check()) return invalid();
  const evaluatedAt = date(value.evaluatedAt);
  if (value.effectiveStatus === 'UNBOUND') {
    if (
      binding.state !== 'UNBOUND' ||
      [
        'personId',
        'bindingId',
        'identityVerification',
        'currentRecord',
        'presence',
        'verifiedAt',
        'verificationMethod',
      ].some((key) => key in value)
    )
      return invalid();
    const current = await getMyPersonBinding();
    if (current.state !== 'UNBOUND') return invalid();
    return { userId: check(), effectiveStatus: 'UNBOUND', evaluatedAt };
  }
  if (
    binding.state !== 'BOUND' ||
    value.personId !== binding.personId ||
    value.bindingId !== binding.bindingId
  )
    return invalid();
  if (binding.personStatus === 'ACTIVE') await assertCurrentPerson(binding);
  else {
    const current = await getMyPersonBinding();
    if (current.state !== 'BOUND' || current.bindingId !== binding.bindingId) return invalid();
  }
  check();
  const subject = { personId: binding.personId, bindingId: binding.bindingId };
  if (value.effectiveStatus === 'PERSON_UNAVAILABLE') {
    if (
      [
        'identityVerification',
        'currentRecord',
        'presence',
        'verifiedAt',
        'verificationMethod',
      ].some((key) => key in value)
    )
      return invalid();
    return { ...subject, userId: check(), effectiveStatus: 'PERSON_UNAVAILABLE', evaluatedAt };
  }
  if (binding.personStatus !== 'ACTIVE') return invalid();
  if (value.identityVerification === 'UNKNOWN' || value.identityVerification === 'DISPUTED') {
    if (
      value.effectiveStatus !== value.identityVerification ||
      ['presence', 'currentRecord', 'verifiedAt', 'verificationMethod'].some((key) => key in value)
    )
      return invalid();
    return {
      userId: value.userId,
      ...subject,
      identityVerification: value.identityVerification,
      effectiveStatus: value.identityVerification,
      evaluatedAt,
    };
  }
  if (value.identityVerification !== 'VERIFIED') return invalid();
  if (value.verificationMethod === 'ROSTER_EXACT_MATCH') return invalid();
  const base = {
    ...subject,
    userId: value.userId,
    identityVerification: 'VERIFIED' as const,
    evaluatedAt,
    verifiedAt: date(value.verifiedAt),
    verificationMethod: text(value.verificationMethod, 64),
  };
  if (value.presence === 'NONE') {
    if (value.effectiveStatus !== 'NONE' || 'currentRecord' in value) return invalid();
    return { ...base, presence: 'NONE', effectiveStatus: 'NONE' };
  }
  if (value.presence !== 'RECORDED') return invalid();
  const record = object(value.currentRecord);
  if (
    record.identityKind !== 'PARTY_DEVELOPMENT' ||
    ![
      'PARTY_ACTIVIST',
      'PARTY_DEVELOPMENT_CANDIDATE',
      'PROBATIONARY_PARTY_MEMBER',
      'FULL_PARTY_MEMBER',
    ].includes(String(record.stageId)) ||
    !['ACTIVE', 'INACTIVE', 'REVOKED'].includes(String(record.status))
  )
    return invalid();
  const currentRecord: PartyIdentityRecord = {
    recordId: text(record.recordId, 128),
    identityKind: 'PARTY_DEVELOPMENT',
    stageId: record.stageId as PartyStageId,
    status: record.status as PartyIdentityRecord['status'],
    validFrom: date(record.validFrom),
    ...(record.validUntil === undefined ? {} : { validUntil: date(record.validUntil) }),
  };
  if (
    currentRecord.validUntil &&
    Date.parse(currentRecord.validUntil) <= Date.parse(currentRecord.validFrom)
  )
    return invalid();
  // Check the provider's derived status against its own evaluation time, never grant from a local clock.
  const expected =
    currentRecord.status !== 'ACTIVE'
      ? currentRecord.status
      : Date.parse(currentRecord.validFrom) > Date.parse(evaluatedAt)
        ? 'NOT_YET_VALID'
        : currentRecord.validUntil &&
            Date.parse(currentRecord.validUntil) <= Date.parse(evaluatedAt)
          ? 'EXPIRED'
          : 'ACTIVE';
  if (value.effectiveStatus !== expected) return invalid();
  return { ...base, presence: 'RECORDED', currentRecord, effectiveStatus: expected };
}
export function qualificationError(error: unknown): string {
  if (error instanceof AuthError) return '登录状态已变化，请重新登录后查询';
  if (error instanceof HttpError) {
    if (error.problemType === '/problems/roster-state-conflict')
      return '暂未能完成关联，请核对姓名、学号；如仍失败，请联系管理员核实。';
    if (error.problemType === '/problems/people-operation-in-progress')
      return '原申请仍在处理中，请查询后使用原申请重试';
    if (error.problemType === '/problems/people-idempotency-conflict')
      return '原申请信息与提交记录不一致，请联系管理员核实';
    if (error.statusCode === 409)
      return '暂未能完成关联，请核对姓名、学号；如仍失败，请联系管理员核实。';
    if (error.statusCode === 429) return '操作过于频繁，请稍后再查询';
    if (error.statusCode === 401) return '登录已失效，请重新登录';
    if (error.statusCode === 403) return '当前账号暂不能使用此功能';
    if (error.statusCode === 400) return '请核对填写信息后重试';
    if (error.statusCode === 404) return '服务或目标暂不可用，请稍后查询';
  }
  // Do not surface backend detail, candidate counts or other people's information.
  return '身份服务或网络暂不可用，当前结果尚未确认，请稍后查询';
}
