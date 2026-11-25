import type {
  MyDetail,
  DisplayStatus,
  Submission,
  SubmissionCreate,
  FileKind,
} from './learning-task';
import { formatTime, TimeStyle } from '../../utils/time-util';

type StatusTone = 'primary' | 'success' | 'warning' | 'danger' | 'muted';

export const statusLabels: Record<DisplayStatus, string> = {
  NOT_STARTED: '待完成',
  PENDING_REVIEW: '待审核',
  RESUBMISSION_REQUIRED: '已驳回待补交',
  COMPLETED: '已完成',
  OVERDUE: '已逾期',
  REVOKED: '分配已撤销',
  CANCELLED: '任务已取消',
};
export const statusTones: Record<DisplayStatus, StatusTone> = {
  NOT_STARTED: 'primary',
  PENDING_REVIEW: 'warning',
  RESUBMISSION_REQUIRED: 'danger',
  COMPLETED: 'success',
  OVERDUE: 'danger',
  REVOKED: 'muted',
  CANCELLED: 'muted',
};
export const reviewLabels: Record<Submission['reviewStatus'], string> = {
  NOT_REQUIRED: '无需审核',
  PENDING_REVIEW: '待审核',
  APPROVED: '审核通过',
  REJECTED: '审核驳回',
};
export const reviewTones: Record<Submission['reviewStatus'], StatusTone> = {
  NOT_REQUIRED: 'muted',
  PENDING_REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};
export function submissionPresentation(submission: Submission) {
  return {
    reviewLabel: reviewLabels[submission.reviewStatus],
    reviewTone: reviewTones[submission.reviewStatus],
    submittedAtText: formatTime(submission.submittedAt, TimeStyle.SHORT_YMDHM),
    confirmedAtText: submission.confirmedAt
      ? formatTime(submission.confirmedAt, TimeStyle.SHORT_YMDHM)
      : '',
    reviewedAtText: submission.reviewedAt
      ? formatTime(submission.reviewedAt, TimeStyle.SHORT_YMDHM)
      : '',
  };
}
const fileKindLabels: Record<FileKind, string> = {
  IMAGE: '图片',
  VIDEO: 'MP4 视频',
  PDF: 'PDF',
  WORD: 'Word 文档',
};
export function presentation(d: MyDetail, now = Date.now()) {
  const t = d.task,
    a = d.assignment,
    r = t.requirements;
  // Server displayStatus is the authoritative projection. Local time may only close an action window.
  const deadline = a.progress === 'REJECTED' ? a.supplementDeadline : t.firstDeadline;
  const canAct =
    t.status === 'PUBLISHED' &&
    a.allocationStatus === 'ACTIVE' &&
    ((a.progress === 'NOT_STARTED' && a.displayStatus === 'NOT_STARTED') ||
      (a.progress === 'REJECTED' && a.displayStatus === 'RESUBMISSION_REQUIRED')) &&
    !!deadline &&
    now < Date.parse(deadline);
  const pureConfirmation =
    r.confirmationRequired &&
    r.minimumTextLength === 0 &&
    r.minimumFiles === 0 &&
    !t.reviewRequired;
  const lifecycle = `${t.status === 'CANCELLED' ? '任务已取消' : t.status === 'CLOSED' ? '任务已结束' : '任务进行中'}${a.allocationStatus === 'REVOKED' ? ' · 分配已撤销' : ''}`;
  return {
    statusLabel: statusLabels[a.displayStatus],
    statusTone: statusTones[a.displayStatus],
    lifecycle,
    canAct,
    pureConfirmation,
    deadline: deadline ?? '',
    deadlineText: deadline ? formatTime(deadline, TimeStyle.SHORT_YMDHM) : '',
    supplementDeadlineText: a.supplementDeadline
      ? formatTime(a.supplementDeadline, TimeStyle.SHORT_YMDHM)
      : '',
    confirmedAtText: a.confirmedAt ? formatTime(a.confirmedAt, TimeStyle.SHORT_YMDHM) : '',
    completedAtText: a.completedAt ? formatTime(a.completedAt, TimeStyle.SHORT_YMDHM) : '',
    fileKindsLabel: r.allowedFileKinds.map((kind) => fileKindLabels[kind]).join(' / '),
    windowClosed: !!deadline && now >= Date.parse(deadline),
    requirementsLabel: `${r.confirmationRequired ? '主动确认学习；' : ''}心得至少 ${r.minimumTextLength.toString()} 字；附件 ${r.minimumFiles.toString()}–${r.maximumFiles.toString()} 个`,
  };
}
export function textLength(text: string) {
  return Array.from(text.trim()).length;
}
export function validateSubmission(
  d: MyDetail,
  text: string,
  confirmed: boolean,
  selectedCount: number,
): string {
  const r = d.task.requirements;
  if (!presentation(d).canAct) return '当前任务不可提交，请刷新状态';
  if (r.confirmationRequired && !confirmed) return '请主动确认已完成学习';
  if (textLength(text) < r.minimumTextLength)
    return `心得至少需要 ${r.minimumTextLength.toString()} 字（去除首尾空白）`;
  if (textLength(text) > 10000) return '心得最多 10000 字';
  if (selectedCount < r.minimumFiles || selectedCount > r.maximumFiles)
    return '附件数量不符合任务要求';
  if (!text.trim() && !selectedCount) return '请填写心得或使用纯确认入口';
  return '';
}
export function submissionBody(
  d: MyDetail,
  text: string,
  fileIds: string[] = [],
): SubmissionCreate {
  return {
    ...(text.trim() ? { text: text.trim() } : {}),
    ...(fileIds.length ? { fileIds } : {}),
    ...(d.task.requirements.confirmationRequired ? { confirmed: true as const } : {}),
  };
}
export interface SelectedFile {
  name: string;
  path: string;
  size: number;
  kind: FileKind;
  status: '待上传' | '上传中' | '已登记';
  fileId?: string;
  unboundExpiresAt?: string;
}
export function selectedFile(
  name: string,
  path: string,
  size: number | undefined,
  allowed: FileKind[],
): SelectedFile {
  const ext = name.split('.').pop()?.toLowerCase();
  const kind: FileKind | undefined =
    ext && ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
      ? 'IMAGE'
      : ext === 'mp4'
        ? 'VIDEO'
        : ext === 'pdf'
          ? 'PDF'
          : ext && ['doc', 'docx'].includes(ext)
            ? 'WORD'
            : undefined;
  if (!kind || !allowed.includes(kind))
    throw new Error('请选择任务允许的 IMAGE/VIDEO/PDF/WORD 文件');
  if (
    !size ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > (kind === 'VIDEO' ? 209715200 : 10485760)
  )
    throw new Error('图片/文档不超过 10MiB，MP4 不超过 200MiB');
  return { name, path, size, kind, status: '待上传' };
}
