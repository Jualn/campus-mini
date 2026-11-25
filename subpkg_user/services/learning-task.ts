// Hand-maintained consumer types: contracts/api/{schemas,paths}/learning-task.yaml.
import { http, httpWithMeta } from '../../utils/request';
import { isHttpError } from '../../utils/error';
import { getCurrentIdentity } from '../../actions/current-user';
import { requireCurrentPerson, assertCurrentPerson } from '../../services/person-binding';

export type Progress = 'NOT_STARTED' | 'PENDING_REVIEW' | 'REJECTED' | 'COMPLETED';
export type DisplayStatus =
  | 'NOT_STARTED'
  | 'PENDING_REVIEW'
  | 'RESUBMISSION_REQUIRED'
  | 'COMPLETED'
  | 'OVERDUE'
  | 'REVOKED'
  | 'CANCELLED';
export type FileKind = 'IMAGE' | 'VIDEO' | 'PDF' | 'WORD';
export interface Requirements {
  confirmationRequired: boolean;
  minimumTextLength: number;
  minimumFiles: number;
  maximumFiles: number;
  allowedFileKinds: FileKind[];
}
export interface LearningTask {
  taskId: string;
  title: string;
  description: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';
  article?: { articleId: string; availability: 'AVAILABLE' | 'UNAVAILABLE' };
  requirements: Requirements;
  reviewRequired: boolean;
  firstDeadline: string;
  deadlineRevision: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  publishedAt?: string;
  closedAt?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
}
export interface Assignment {
  assignmentId: string;
  taskId: string;
  subject: LearningTaskSubject;
  confirmedByUserId?: string;
  confirmedBindingId?: string;
  allocationStatus: 'ACTIVE' | 'REVOKED';
  progress: Progress;
  displayStatus: DisplayStatus;
  assignedAt: string;
  assignedBy: string;
  confirmedAt?: string;
  firstSubmittedAt?: string;
  onTimeFirstSubmission?: boolean;
  latestSubmissionId?: string;
  supplementDeadline?: string;
  completedAt?: string;
  revokedAt?: string;
  revokedBy?: string;
  revocationReason?: string;
}
export interface MyDetail {
  task: LearningTask;
  assignment: Assignment;
}
export interface SubmissionCreate {
  text?: string;
  fileIds?: string[];
  confirmed?: true;
}
export interface Submission {
  subject: LearningTaskSubject;
  submittedByUserId: string;
  bindingId?: string;
  text?: string;
  fileIds?: string[];
  submissionId: string;
  assignmentId: string;
  attempt: number;
  kind: 'MATERIAL';
  submittedAt: string;
  confirmedAt?: string;
  reviewStatus: 'NOT_REQUIRED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  reviewedAt?: string;
  reviewedBy?: string;
  reviewReason?: string;
}
export interface MyPage {
  items: MyDetail[];
  nextCursor?: string;
  personUnavailable?: boolean; // Local read failure, never a wire field or empty-person assertion.
}
export type LearningTaskSubject =
  | { type: 'PERSON'; personId: string }
  | { type: 'ACCOUNT'; userId: string };
export function requireSubject(value: unknown): LearningTaskSubject {
  if (!value || typeof value !== 'object') throw new Error('任务责任主体无效');
  const raw = value as Record<string, unknown>;
  if (raw.type === 'PERSON' && !('userId' in raw))
    return { type: 'PERSON', personId: resourceId(raw.personId) };
  if (raw.type === 'ACCOUNT' && !('personId' in raw))
    return { type: 'ACCOUNT', userId: resourceId(raw.userId) };
  throw new Error('任务责任主体无效');
}
export async function assertLearningSubject(subject: LearningTaskSubject) {
  await assertLearningSubjects([subject]);
}
async function assertLearningSubjects(subjects: LearningTaskSubject[]) {
  const owner = getCurrentIdentity().id;
  if (subjects.some((subject) => subject.type === 'ACCOUNT' && subject.userId !== owner))
    throw new Error('账号任务不属于当前登录账号');
  const personal = subjects.filter((subject) => subject.type === 'PERSON');
  if (!personal.length) return;
  const binding = await requireCurrentPerson();
  if (personal.some((subject) => subject.personId !== binding.personId))
    throw new Error('人员任务不属于当前绑定人员');
  await assertCurrentPerson(binding);
  if (owner !== getCurrentIdentity().id) throw new Error('登录账号已变化');
}
export interface SubmissionPage {
  items: Submission[];
  page: number;
  pageSize: number;
  totalItems: number;
}
export interface PrivateFileDeclaration {
  fileName: string;
  kind: FileKind;
  contentType:
    | 'video/mp4'
    | 'image/jpeg'
    | 'image/png'
    | 'image/webp'
    | 'application/pdf'
    | 'application/msword'
    | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  sizeBytes: number;
}
export interface PrivateFile extends PrivateFileDeclaration {
  fileId: string;
  assignmentId: string;
  createdAt: string;
  unboundExpiresAt?: string;
}
export interface PrivateFileAccess {
  url: string;
  expiresAt: string;
}
export interface PrivateFileCredentials {
  uploadId: string;
  bucket: string;
  region: string;
  objectKeys: string[];
  tmpSecretId: string;
  tmpSecretKey: string;
  sessionToken: string;
  expiredTime: number;
  customDomain?: string | null;
}

export function resourceId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || /[\r\n]/.test(value))
    throw new Error('学习任务标识无效');
  return value;
}
const base = '/v1/users/me/learning-tasks';
const path = (assignmentId: string) =>
  `/v1/users/me/learning-task-assignments/${encodeURIComponent(resourceId(assignmentId))}`;
const read = { auth: 'required' as const, sensitive: true };
export const learningTaskRoute = (assignmentId: string) =>
  `/subpkg_user/pages/learning-task-detail/detail?assignmentId=${encodeURIComponent(resourceId(assignmentId))}`;

// Reject malformed state before rendering an actionable form; tolerate additive fields.
export function requireDetail(value: unknown, assignmentId?: string): MyDetail {
  const raw = value as { task?: Partial<LearningTask>; assignment?: Partial<Assignment> } | null;
  const t = raw?.task,
    a = raw?.assignment,
    r = t?.requirements as Partial<Requirements> | undefined;
  if (
    !t ||
    !a ||
    !r ||
    resourceId(t.taskId) !== resourceId(a.taskId) ||
    (assignmentId && a.assignmentId !== assignmentId) ||
    !['PUBLISHED', 'CLOSED', 'CANCELLED'].includes(t.status ?? '') ||
    !['ACTIVE', 'REVOKED'].includes(a.allocationStatus ?? '') ||
    !['NOT_STARTED', 'PENDING_REVIEW', 'REJECTED', 'COMPLETED'].includes(a.progress ?? '') ||
    ![
      'NOT_STARTED',
      'PENDING_REVIEW',
      'RESUBMISSION_REQUIRED',
      'COMPLETED',
      'OVERDUE',
      'REVOKED',
      'CANCELLED',
    ].includes(a.displayStatus ?? '') ||
    typeof t.title !== 'string' ||
    typeof t.description !== 'string' ||
    typeof t.reviewRequired !== 'boolean' ||
    !Number.isFinite(Date.parse(t.firstDeadline ?? '')) ||
    typeof r.confirmationRequired !== 'boolean' ||
    typeof r.minimumTextLength !== 'number' ||
    !Number.isInteger(r.minimumTextLength) ||
    r.minimumTextLength < 0 ||
    r.minimumTextLength > 10000 ||
    typeof r.minimumFiles !== 'number' ||
    !Number.isInteger(r.minimumFiles) ||
    r.minimumFiles < 0 ||
    typeof r.maximumFiles !== 'number' ||
    !Number.isInteger(r.maximumFiles) ||
    r.maximumFiles < r.minimumFiles ||
    r.maximumFiles > 9 ||
    !Array.isArray(r.allowedFileKinds) ||
    r.allowedFileKinds.some((k) => !['IMAGE', 'VIDEO', 'PDF', 'WORD'].includes(k)) ||
    (r.maximumFiles > 0 && !r.allowedFileKinds.length) ||
    (r.maximumFiles === 0 && r.allowedFileKinds.length > 0) ||
    (!r.confirmationRequired && !r.minimumTextLength && !r.minimumFiles) ||
    (!r.minimumTextLength && !r.minimumFiles && t.reviewRequired) ||
    (a.supplementDeadline !== undefined && !Number.isFinite(Date.parse(a.supplementDeadline)))
  )
    throw new Error('学习任务响应格式不正确');
  resourceId(a.assignmentId);
  requireSubject(a.subject);
  if (a.confirmedAt) {
    resourceId(a.confirmedByUserId);
    if (a.subject?.type === 'PERSON') resourceId(a.confirmedBindingId);
    else if (a.confirmedBindingId !== undefined) throw new Error('账号任务不能带人员绑定证明');
  }
  if (t.article) {
    resourceId(t.article.articleId);
    if (!['AVAILABLE', 'UNAVAILABLE'].includes(t.article.availability))
      throw new Error('关联文章状态无效');
  }
  return value as MyDetail;
}
export function requireSubmission(value: unknown, assignmentId?: string): Submission {
  const s = value as Partial<Submission> | null;
  resourceId(s?.submissionId);
  if (!s) throw new Error('成果响应格式不正确');
  resourceId(s.assignmentId);
  const subject = requireSubject(s.subject);
  resourceId(s.submittedByUserId);
  if (subject.type === 'PERSON') resourceId(s.bindingId);
  else if (s.bindingId !== undefined) throw new Error('账号成果不能带人员绑定证明');
  if (
    (assignmentId && s.assignmentId !== assignmentId) ||
    s.kind !== 'MATERIAL' ||
    typeof s.attempt !== 'number' ||
    !Number.isInteger(s.attempt) ||
    s.attempt < 1 ||
    !['NOT_REQUIRED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'].includes(s.reviewStatus ?? '') ||
    !Number.isFinite(Date.parse(s.submittedAt ?? '')) ||
    (s.text !== undefined && typeof s.text !== 'string') ||
    (s.fileIds !== undefined && (!Array.isArray(s.fileIds) || s.fileIds.length > 9)) ||
    (s.reviewStatus === 'REJECTED' && typeof s.reviewReason !== 'string')
  )
    throw new Error('成果响应格式不正确');
  s.fileIds?.forEach(resourceId);
  return s as Submission;
}
export async function listMyLearningTasks(cursor?: string, progress?: Progress): Promise<MyPage> {
  const p = await http.get<MyPage | null>(base, { cursor, progress, pageSize: 20 }, read);
  if (
    !Array.isArray(p?.items) ||
    p.items.length > 50 ||
    (p.nextCursor !== undefined &&
      (typeof p.nextCursor !== 'string' || !p.nextCursor || p.nextCursor.length > 1024))
  )
    throw new Error('任务分页格式不正确');
  p.items.forEach((d) => requireDetail(d));
  const account = p.items.filter((d) => d.assignment.subject.type === 'ACCOUNT');
  for (const d of account) await assertLearningSubject(d.assignment.subject);
  const personal = p.items.filter((d) => d.assignment.subject.type === 'PERSON');
  if (personal.length) {
    try {
      const binding = await requireCurrentPerson();
      if (
        personal.some(
          (d) =>
            d.assignment.subject.type !== 'PERSON' ||
            d.assignment.subject.personId !== binding.personId,
        )
      )
        throw new Error('人员任务不属于当前绑定');
      await assertCurrentPerson(binding);
    } catch {
      return { ...p, items: account, personUnavailable: true };
    }
  }
  return p;
}
export async function getMyLearningTask(taskId: string) {
  const response = await httpWithMeta.get<MyDetail>(path(taskId), undefined, read);
  const etag: unknown = response.headers.etag;
  const detail = requireDetail(response.data, taskId);
  await assertLearningSubject(detail.assignment.subject);
  return {
    detail,
    etag: typeof etag === 'string' ? etag : '',
  };
}
function write(etag: string, key: string) {
  if (!/^"[^"\r\n]+"$/.test(etag)) throw new Error('缺少有效任务版本，请刷新后重试');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(key)) throw new Error('操作标识无效');
  return { ...read, retryAuth: false, headers: { 'If-Match': etag, 'Idempotency-Key': key } };
}
export async function confirmLearningTask(taskId: string, etag: string, key: string) {
  const detail = requireDetail(
    await http.post<MyDetail>(`${path(taskId)}:confirm`, { confirmed: true }, write(etag, key)),
    taskId,
  );
  await assertLearningSubject(detail.assignment.subject);
  return detail;
}
export async function submitLearningTask(
  taskId: string,
  body: SubmissionCreate,
  etag: string,
  key: string,
) {
  body.fileIds?.forEach(resourceId);
  const submission = requireSubmission(
    await http.post<Submission>(`${path(taskId)}/submissions`, body, write(etag, key)),
  );
  await assertLearningSubject(submission.subject);
  return submission;
}
export async function listMyLearningTaskSubmissions(
  taskId: string,
  page = 1,
): Promise<SubmissionPage> {
  const p = await http.get<SubmissionPage | null>(
    `${path(taskId)}/submissions`,
    { page, pageSize: 20 },
    read,
  );
  if (
    !Array.isArray(p?.items) ||
    p.items.length > 100 ||
    p.page !== page ||
    !Number.isInteger(p.pageSize) ||
    p.pageSize < 1 ||
    p.pageSize > 100 ||
    !Number.isInteger(p.totalItems) ||
    p.totalItems < 0
  )
    throw new Error('成果分页格式不正确');
  p.items.forEach((s) => requireSubmission(s));
  await assertLearningSubjects(p.items.map((submission) => submission.subject));
  return p;
}
export async function getMyLearningTaskSubmission(taskId: string, submissionId: string) {
  const s = requireSubmission(
    await http.get<Submission>(
      `${path(taskId)}/submissions/${encodeURIComponent(resourceId(submissionId))}`,
      undefined,
      read,
    ),
  );
  if (s.submissionId !== submissionId) throw new Error('成果标识不匹配');
  if (s.assignmentId !== taskId) throw new Error('成果不属于当前分配');
  await assertLearningSubject(s.subject);
  return s;
}
const privateWrite = (key: string) => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(key)) throw new Error('操作标识无效');
  return { ...read, retryAuth: false, headers: { 'Idempotency-Key': key } };
};
export async function createLearningTaskFileUploadCredentials(
  taskId: string,
  files: PrivateFileDeclaration[],
  key: string,
): Promise<PrivateFileCredentials> {
  return http.post(`${path(taskId)}/file-upload-credentials`, { files }, privateWrite(key));
}
export async function registerLearningTaskFile(
  taskId: string,
  uploadId: string,
  fileIndex: number,
  key: string,
): Promise<PrivateFile> {
  resourceId(uploadId);
  if (!Number.isInteger(fileIndex) || fileIndex < 0 || fileIndex > 8)
    throw new Error('文件序号无效');
  return requirePrivateFile(
    await http.post(`${path(taskId)}/files`, { uploadId, fileIndex }, privateWrite(key)),
    taskId,
  );
}
export async function getMyLearningTaskFile(taskId: string, fileId: string): Promise<PrivateFile> {
  const file = requirePrivateFile(
    await http.get(
      `${path(taskId)}/files/${encodeURIComponent(resourceId(fileId))}`,
      undefined,
      read,
    ),
    taskId,
  );
  if (file.fileId !== fileId) throw new Error('文件标识不匹配');
  return file;
}
export async function getMyLearningTaskFileAccess(
  taskId: string,
  fileId: string,
): Promise<PrivateFileAccess> {
  const access = await http.get<PrivateFileAccess | null>(
    `${path(taskId)}/files/${encodeURIComponent(resourceId(fileId))}/access`,
    undefined,
    read,
  );
  if (
    !access ||
    !/^https:\/\/[^/\s]+\//i.test(access.url) ||
    !Number.isFinite(Date.parse(access.expiresAt)) ||
    Date.parse(access.expiresAt) <= Date.now()
  )
    throw new Error('文件访问地址无效或已过期，请重新打开');
  return access;
}
export function learningTaskError(error: unknown): string {
  if (isHttpError(error)) {
    if (error.statusCode === 404) return '任务不存在或未分配给你';
    if (error.statusCode === 403) return '暂无权限查看或操作该任务';
    if (error.statusCode === 412 || error.statusCode === 428) return '任务进度已变化，请刷新后操作';
    if (error.problemType === '/problems/learning-task-dependency-unavailable')
      return '学习任务依赖尚未就绪，请稍后重试';
    return error.userMessage;
  }
  return (
    (error as { userMessage?: string; message?: string } | null)?.userMessage ??
    (error as Error | null)?.message ??
    '加载失败，请重试'
  );
}

export function requirePrivateFile(value: unknown, assignmentId: string): PrivateFile {
  if (!value || typeof value !== 'object') throw new Error('私有文件响应无效');
  const file = value as PrivateFile;
  resourceId(file.fileId);
  const mimeKinds: Record<string, FileKind | undefined> = {
    'image/jpeg': 'IMAGE',
    'image/png': 'IMAGE',
    'image/webp': 'IMAGE',
    'video/mp4': 'VIDEO',
    'application/pdf': 'PDF',
    'application/msword': 'WORD',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'WORD',
  };
  if (
    mimeKinds[file.contentType] !== file.kind ||
    !Number.isFinite(Date.parse(file.createdAt)) ||
    file.assignmentId !== assignmentId ||
    !['IMAGE', 'VIDEO', 'PDF', 'WORD'].includes(file.kind) ||
    !Number.isInteger(file.sizeBytes) ||
    file.sizeBytes <= 0 ||
    file.sizeBytes > (file.kind === 'VIDEO' ? 209715200 : 10485760) ||
    typeof file.fileName !== 'string' ||
    !file.fileName.trim() ||
    (file.unboundExpiresAt !== undefined && !Number.isFinite(Date.parse(file.unboundExpiresAt)))
  )
    throw new Error('私有文件响应不匹配');
  return file;
}
