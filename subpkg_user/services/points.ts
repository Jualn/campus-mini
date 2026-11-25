// Hand-maintained consumer: points-v1-r6 / unified-v1-r4.
import { httpWithMeta } from '../../utils/request';
import { AuthError, HttpError, isHttpError, isNetworkError, isAuthError } from '../../utils/error';
import { getCurrentIdentity, watchCurrentIdentity } from '../../actions/current-user';
import {
  requireCurrentPerson,
  assertCurrentPerson,
  personBindingEpoch,
} from '../../services/person-binding';

export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CLOSED';
export type LedgerKind = 'GRANT' | 'REVERSAL' | 'CORRECTION_GRANT';
export interface ApplicationCreate {
  title: string;
  description: string;
  fileIds: string[];
  acceptingOrganizationId: string;
}
export interface AcceptanceBasis {
  status: 'BOUND';
  organizationId: string;
  membershipId: string;
}
export interface PointApplication extends Omit<ApplicationCreate, 'acceptingOrganizationId'> {
  applicationId: string;
  applicantUserId: string;
  personId: string;
  personName: string;
  acceptingOrganizationName: string;
  accounting: {
    status: 'NONE' | 'EFFECTIVE' | 'REVOKED';
    effectivePoints: number;
    effectiveLedgerId?: string;
  };
  submittedBindingId: string;
  createdAt: string;
  status: ApplicationStatus;
  reviewerUserId?: string;
  reviewedAt?: string;
  reviewNote?: string;
  awardedPoints?: number;
  grantLedgerId?: string;
  // r5 requires the original frozen acceptance cycle; no legacy dual read.
  acceptanceBasis: AcceptanceBasis;
  closedAt?: string;
  closedByUserId?: string;
  closureReason?: string;
}
export interface PointLedger {
  ledgerId: string;
  personId: string;
  applicantUserId: string;
  submittedBindingId: string;
  acceptanceBasis: AcceptanceBasis;
  applicationId: string;
  kind: LedgerKind;
  pointsDelta: number;
  operatorUserId: string;
  reason?: string;
  createdAt: string;
  originalLedgerId?: string;
  correctionId?: string;
  basis?: string;
}
export interface PointSummary {
  personId: string;
  balance: number;
  totalGranted: number;
  totalReversed: number;
  evaluatedAt: string;
}
export type PointEligibility = { evaluatedAt: string } & (
  | { eligible: true; reason?: never }
  | {
      eligible: false;
      reason:
        | 'BUSINESS_STAGE_INELIGIBLE'
        | 'ACCOUNT_UNAVAILABLE'
        | 'NO_ACCEPTING_ORGANIZATION'
        | 'NO_BINDING'
        | 'PERSON_UNAVAILABLE';
    }
);
export interface AcceptingOrganization {
  organizationId: string;
  name: string;
  membershipId: string;
}
export interface AcceptingOrganizations {
  evaluatedAt: string;
  items: AcceptingOrganization[];
}
export interface PointPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
}
export interface PageQuery {
  page?: number;
  pageSize?: number;
}
export interface FileDeclaration {
  fileName: string;
  kind: 'IMAGE' | 'PDF' | 'WORD' | 'VIDEO';
  contentType:
    | 'image/jpeg'
    | 'image/png'
    | 'image/webp'
    | 'video/mp4'
    | 'application/pdf'
    | 'application/msword'
    | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  sizeBytes: number;
}
export interface PointFile extends FileDeclaration {
  fileId: string;
  ownerUserId: string;
  createdAt: string;
  applicationId?: string;
  unboundExpiresAt?: string;
}
export interface PointFileCredentials {
  uploadId: string;
  uploadExpiresAt: string;
  bucket: string;
  region: string;
  objectKeys: string[];
  tmpSecretId: string;
  tmpSecretKey: string;
  sessionToken: string;
  expiredTime: number;
  customDomain?: string | null;
}
export interface PointFileAccess {
  url: string;
  expiresAt: string;
}

const base = '/v1/users/me/points';
const options = { auth: 'required' as const, retryAuth: false, sensitive: true };
let generation = 0;
let owner = getCurrentIdentity().id;
watchCurrentIdentity(() => {
  const next = getCurrentIdentity().id;
  if (owner !== next) {
    owner = next;
    generation++;
  }
});
// Identity is used only to reject stale/cross-account results, never to grant eligibility.
export function pointSession() {
  const userId = getCurrentIdentity().id,
    revision = generation;
  const bindingRevision = personBindingEpoch();
  if (!userId) throw new AuthError();
  return () => {
    if (
      revision !== generation ||
      userId !== getCurrentIdentity().id ||
      bindingRevision !== personBindingEpoch()
    )
      throw new AuthError('账号或人员绑定已变化');
    return userId;
  };
}
function invalid(): never {
  throw new HttpError(502, 'Invalid Points response', {
    userMessage: '积分服务响应异常，请重新查询',
  });
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
export function pointId(value: unknown): string {
  if (typeof value !== 'string' || !value.length || Array.from(value).length > 128)
    return invalid();
  return value;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || Array.from(value).length > max)
    return invalid();
  return value;
}
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    return invalid();
  return value;
}
function time(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/i.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    return invalid();
  return value;
}
function absent(raw: Record<string, unknown>, keys: string[]) {
  if (keys.some((k) => k in raw)) invalid();
}
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 9) return invalid();
  const result = value.map(pointId);
  if (new Set(result).size !== result.length) return invalid();
  return result;
}
function only(raw: Record<string, unknown>, keys: string[]) {
  if (Object.keys(raw).some((k) => !keys.includes(k))) throw new Error('积分请求含不支持的字段');
}
export function applicationBody(value: ApplicationCreate): ApplicationCreate {
  const r = object(value);
  only(r, ['title', 'description', 'fileIds', 'acceptingOrganizationId']);
  return {
    title: text(r.title, 120),
    description: text(r.description, 10000),
    fileIds: ids(r.fileIds),
    acceptingOrganizationId: pointId(r.acceptingOrganizationId),
  };
}
function application(value: unknown, personId: string): PointApplication {
  const r = object(value);
  text(r.title, 120);
  text(r.description, 10000);
  ids(r.fileIds);
  pointId(r.applicationId);
  pointId(r.applicantUserId);
  pointId(r.submittedBindingId);
  if (pointId(r.personId) !== personId) invalid();
  text(r.personName, 100);
  text(r.acceptingOrganizationName, 200);
  time(r.createdAt);
  {
    const basis = object(r.acceptanceBasis);
    if (basis.status === 'BOUND') {
      pointId(basis.organizationId);
      pointId(basis.membershipId);
    } else invalid();
  }
  if (!['PENDING', 'APPROVED', 'REJECTED', 'CLOSED'].includes(String(r.status))) invalid();
  if (r.status === 'PENDING' || r.status === 'CLOSED')
    absent(r, ['reviewerUserId', 'reviewedAt', 'reviewNote', 'awardedPoints', 'grantLedgerId']);
  else {
    pointId(r.reviewerUserId);
    time(r.reviewedAt);
    if ('reviewNote' in r) text(r.reviewNote, 2000);
  }
  if (r.status === 'APPROVED') {
    integer(r.awardedPoints, 1, 2147483647);
    pointId(r.grantLedgerId);
  } else absent(r, ['awardedPoints', 'grantLedgerId']);
  if (r.status === 'CLOSED') {
    time(r.closedAt);
    pointId(r.closedByUserId);
    text(r.closureReason, 2000);
  } else absent(r, ['closedAt', 'closedByUserId', 'closureReason']);
  const accounting = object(r.accounting);
  if (accounting.status === 'EFFECTIVE') {
    if (r.status !== 'APPROVED') invalid();
    integer(accounting.effectivePoints, 1, 2147483647);
    pointId(accounting.effectiveLedgerId);
  } else {
    if (accounting.status !== (r.status === 'APPROVED' ? 'REVOKED' : 'NONE')) invalid();
    if (accounting.effectivePoints !== 0) invalid();
    absent(accounting, ['effectiveLedgerId']);
  }
  return r as unknown as PointApplication;
}
function ledger(value: unknown, personId: string): PointLedger {
  const r = object(value);
  for (const k of [
    'ledgerId',
    'personId',
    'applicationId',
    'operatorUserId',
    'applicantUserId',
    'submittedBindingId',
  ])
    pointId(r[k]);
  if (r.personId !== personId) invalid();
  const basis = object(r.acceptanceBasis);
  if (basis.status !== 'BOUND') invalid();
  pointId(basis.organizationId);
  pointId(basis.membershipId);
  if ('reason' in r) text(r.reason, 2000);
  time(r.createdAt);
  if (r.kind === 'GRANT') {
    integer(r.pointsDelta, 1, 2147483647);
    absent(r, ['originalLedgerId', 'correctionId', 'basis']);
  } else if (r.kind === 'REVERSAL' || r.kind === 'CORRECTION_GRANT') {
    if (r.kind === 'REVERSAL') integer(r.pointsDelta, -2147483647, -1);
    else {
      integer(r.pointsDelta, 1, 10);
      pointId(r.correctionId);
    }
    if ('correctionId' in r) pointId(r.correctionId);
    text(r.reason, 2000);
    text(r.basis, 2000);
    pointId(r.originalLedgerId);
  } else invalid();
  return r as unknown as PointLedger;
}
const mime = {
  VIDEO: ['video/mp4'],
  IMAGE: ['image/jpeg', 'image/png', 'image/webp'],
  PDF: ['application/pdf'],
  WORD: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
};
export function fileDeclaration(value: FileDeclaration): FileDeclaration {
  const r = object(value);
  only(r, ['fileName', 'kind', 'contentType', 'sizeBytes']);
  text(r.fileName, 255);
  integer(r.sizeBytes, 1, 10485760);
  if (
    !Object.prototype.hasOwnProperty.call(mime, String(r.kind)) ||
    !mime[r.kind as keyof typeof mime].includes(String(r.contentType))
  )
    invalid();
  return {
    fileName: r.fileName,
    kind: r.kind,
    contentType: r.contentType,
    sizeBytes: r.sizeBytes,
  } as FileDeclaration;
}
function file(value: unknown, userId: string): PointFile {
  const r = object(value);
  fileDeclaration({
    fileName: r.fileName,
    kind: r.kind,
    contentType: r.contentType,
    sizeBytes: r.sizeBytes,
  } as FileDeclaration);
  pointId(r.fileId);
  pointId(r.ownerUserId);
  time(r.createdAt);
  if ('applicationId' in r) {
    pointId(r.applicationId);
    absent(r, ['unboundExpiresAt']);
  } else {
    if (r.ownerUserId !== userId) invalid();
    time(r.unboundExpiresAt);
  }
  return r as unknown as PointFile;
}
export function pointKey(key: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(key)) throw new Error('积分操作幂等标识无效');
  return key;
}
export function newPointKey(): string {
  return `points_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}
async function read<T>(
  suffix: string,
  parse: (value: unknown, userId: string, personId: string) => T,
  query?: unknown,
  needsPerson = true,
): Promise<T> {
  const session = pointSession();
  const binding = needsPerson ? await requireCurrentPerson() : null;
  session();
  const response = await httpWithMeta.get(base + suffix, query, options);
  if (response.statusCode !== 200) invalid();
  if (binding) await assertCurrentPerson(binding);
  return parse(response.data, session(), binding?.personId ?? '');
}
async function write<T>(
  suffix: string,
  body: unknown,
  key: string,
  status: number,
  parse: (value: unknown, userId: string, personId: string) => T,
): Promise<T> {
  const session = pointSession();
  const binding = await requireCurrentPerson();
  session();
  const response = await httpWithMeta.post(base + suffix, body, {
    ...options,
    headers: { 'Idempotency-Key': pointKey(key) },
  });
  if (response.statusCode !== status) invalid();
  await assertCurrentPerson(binding);
  return parse(response.data, session(), binding.personId);
}
function pagination(query: PageQuery) {
  return {
    page: integer(query.page ?? 1, 1, 2147483647),
    pageSize: integer(query.pageSize ?? 20, 1, 100),
  };
}
function page<T>(
  value: unknown,
  userId: string,
  query: Required<PageQuery>,
  parse: (value: unknown, userId: string) => T,
): PointPage<T> {
  const r = object(value);
  if (
    r.page !== query.page ||
    r.pageSize !== query.pageSize ||
    !Array.isArray(r.items) ||
    r.items.length > query.pageSize
  )
    invalid();
  integer(r.totalItems, 0);
  return {
    items: (r.items as unknown[]).map((v) => parse(v, userId)),
    ...query,
    totalItems: r.totalItems as number,
  };
}
export const getMyPointsEligibility = () =>
  read(
    '/eligibility',
    (value) => {
      const r = object(value);
      time(r.evaluatedAt);
      if (r.eligible === true) absent(r, ['reason']);
      else if (
        r.eligible !== false ||
        ![
          'BUSINESS_STAGE_INELIGIBLE',
          'ACCOUNT_UNAVAILABLE',
          'NO_ACCEPTING_ORGANIZATION',
          'NO_BINDING',
          'PERSON_UNAVAILABLE',
        ].includes(String(r.reason))
      )
        invalid();
      return r as unknown as PointEligibility;
    },
    undefined,
    false,
  );
export function createPointApplication(input: ApplicationCreate, key: string) {
  const body = applicationBody(input);
  return write('/applications', body, key, 201, (v, _u, p) => {
    const result = application(v, p);
    if (result.acceptanceBasis.organizationId !== body.acceptingOrganizationId) invalid();
    return result;
  });
}
export const listMyPointAcceptingOrganizations = () =>
  read('/accepting-organizations', (value) => {
    const r = object(value);
    time(r.evaluatedAt);
    if (!Array.isArray(r.items)) invalid();
    const items = (r.items as unknown[]).map((value) => {
      const item = object(value);
      return {
        organizationId: pointId(item.organizationId),
        name: text(item.name, 128),
        membershipId: pointId(item.membershipId),
      };
    });
    if (new Set(items.map((item) => item.organizationId)).size !== items.length) invalid();
    return { evaluatedAt: r.evaluatedAt as string, items };
  });
export function pointCloseBody(value: { reason: string }) {
  const r = object(value);
  only(r, ['reason']);
  return { reason: text(r.reason, 2000) };
}
export const closeMyPointApplication = (
  applicationId: string,
  body: { reason: string },
  key: string,
) =>
  write(
    `/applications/${encodeURIComponent(pointId(applicationId))}:close`,
    pointCloseBody(body),
    key,
    200,
    (v, _u, p) => {
      const result = application(v, p);
      if (result.applicationId !== applicationId || result.status !== 'CLOSED') invalid();
      return result;
    },
  );
export const getMyPointApplication = (applicationId: string) =>
  read(`/applications/${encodeURIComponent(pointId(applicationId))}`, (v, _u, p) => {
    const result = application(v, p);
    if (result.applicationId !== applicationId) invalid();
    return result;
  });
export function listMyPointApplications(query: PageQuery & { status?: ApplicationStatus } = {}) {
  only(object(query), ['page', 'pageSize', 'status']);
  const p = pagination(query);
  if (
    query.status !== undefined &&
    !['PENDING', 'APPROVED', 'REJECTED', 'CLOSED'].includes(query.status)
  )
    invalid();
  return read(
    '/applications',
    (v, _u, personId) => {
      const result = page(v, personId, p, application);
      if (query.status && result.items.some((i) => i.status !== query.status)) invalid();
      return result;
    },
    { ...p, ...(query.status ? { status: query.status } : {}) },
  );
}
export const getMyPointSummary = () =>
  read('/summary', (v, _u, personId) => {
    const r = object(v);
    if (pointId(r.personId) !== personId) invalid();
    time(r.evaluatedAt);
    const balance = integer(r.balance, 0),
      granted = integer(r.totalGranted, 0),
      reversed = integer(r.totalReversed, 0);
    if (balance !== granted - reversed) invalid();
    return r as unknown as PointSummary;
  });
export function listMyPointLedger(
  query: PageQuery & { kind?: LedgerKind; applicationId?: string } = {},
) {
  only(object(query), ['page', 'pageSize', 'kind', 'applicationId']);
  const p = pagination(query);
  if (query.kind !== undefined && !['GRANT', 'REVERSAL', 'CORRECTION_GRANT'].includes(query.kind))
    invalid();
  const applicationId =
    query.applicationId === undefined ? undefined : pointId(query.applicationId);
  return read(
    '/ledger',
    (v, _u, personId) => {
      const result = page(v, personId, p, ledger);
      if (query.kind && result.items.some((i) => i.kind !== query.kind)) invalid();
      if (applicationId && result.items.some((i) => i.applicationId !== applicationId)) invalid();
      return result;
    },
    {
      ...p,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(applicationId ? { applicationId } : {}),
    },
  );
}
export function createPointFileUploadCredentials(files: FileDeclaration[], key: string) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 9) invalid();
  const body = { files: files.map(fileDeclaration) };
  return write('/file-upload-credentials', body, key, 200, (value) => {
    const r = object(value);
    pointId(r.uploadId);
    time(r.uploadExpiresAt);
    for (const k of ['bucket', 'region', 'tmpSecretId', 'tmpSecretKey', 'sessionToken'])
      text(r[k], 10000);
    if (
      !Array.isArray(r.objectKeys) ||
      r.objectKeys.length !== body.files.length ||
      new Set(r.objectKeys).size !== r.objectKeys.length
    )
      invalid();
    r.objectKeys.forEach((k) => text(k, 10000));
    if (
      r.customDomain !== undefined &&
      r.customDomain !== null &&
      typeof r.customDomain !== 'string'
    )
      invalid();
    if (integer(r.expiredTime, 1) * 1000 !== Date.parse(r.uploadExpiresAt as string)) invalid();
    return r as unknown as PointFileCredentials;
  });
}
export const registerPointFile = (uploadId: string, fileIndex: number, key: string) =>
  write(
    '/files',
    {
      uploadId: pointId(uploadId),
      fileIndex: integer(fileIndex, 0, 8),
    },
    key,
    201,
    file,
  );
export const getMyPointFile = (fileId: string) =>
  read(`/files/${encodeURIComponent(pointId(fileId))}`, (v, u) => {
    const result = file(v, u);
    if (result.fileId !== fileId) invalid();
    return result;
  });
export const getMyPointFileAccess = (fileId: string) =>
  read(`/files/${encodeURIComponent(pointId(fileId))}/access`, (value) => {
    const r = object(value);
    time(r.expiresAt);
    if (typeof r.url !== 'string' || !/^https:\/\/[^/\s?#@]+(?:[/?#]|$)/i.test(r.url)) invalid();
    return { url: r.url, expiresAt: r.expiresAt } as PointFileAccess;
  });

// Keep the original shared error instance/status/type; this supplies presentation only.
export function pointsErrorMessage(error: unknown): string {
  if (isAuthError(error)) return '请重新登录后查询操作结果';
  if (isNetworkError(error)) return '网络失败，提交结果可能未知，请保留本次操作并查询';
  if (isHttpError(error)) {
    const messages: Record<string, string> = {
      '/problems/points-ineligible':
        '当前账号、有效业务阶段或合法受理组织不满足申报条件，请刷新资格',
      '/problems/points-acceptance-unavailable':
        '原受理组织或成员周期已失效，不能继续审批；可由本人结束旧申请后重新申报，历史保留',
      '/problems/points-application-finalized': '申请已处理，请刷新查询当前状态',
      '/problems/points-file-unavailable': '证明材料不可用，请检查材料权限或重新上传',
      '/problems/points-operation-in-progress': '本次操作仍在处理中，请稍后查询或使用原操作重试',
      '/problems/points-idempotency-conflict': '本次操作内容冲突，请保留原操作并核查',
      '/problems/points-upload-expired': '上传凭证已过期，新上传需要新的操作',
      '/problems/points-dependency-unavailable': '积分依赖服务暂不可用，请稍后查询',
      '/problems/points-overflow': '积分数值超限，暂时无法查询',
    };
    if (messages[error.problemType ?? '']) return messages[error.problemType ?? ''];
    if (error.statusCode === 404) return '申请或材料不存在、不可访问或已过期';
    if (error.statusCode === 403) return '没有访问申请或证明材料的权限';
    return error.userMessage;
  }
  return '操作结果未确认，请保留本次操作后重新查询';
}
