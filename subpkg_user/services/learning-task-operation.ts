// Unresolved operations survive Page navigation in this login session, preserving replay identity.
// Private draft text stays in memory, never Storage. This is not a shared business-state Store.
import { getCurrentIdentity, watchCurrentIdentity } from '../../actions/current-user';
import { isHttpError, isAuthError } from '../../utils/error';
import {
  confirmLearningTask,
  submitLearningTask,
  requireSubject,
  type SubmissionCreate,
  type LearningTaskSubject,
} from './learning-task';
import {
  requireCurrentPerson,
  watchPersonBinding,
  personBindingEpoch,
} from '../../services/person-binding';

interface Operation {
  key: string;
  etag: string;
  body: SubmissionCreate | null;
  userId: string;
  running: boolean;
  subject: LearningTaskSubject;
  bindingId?: string;
}
const pending = new Map<string, Operation>();
const starting = new Set<string>();
watchPersonBinding(() => {
  for (const [assignmentId, operation] of pending)
    if (operation.subject.type === 'PERSON') pending.delete(assignmentId);
});
let owner = getCurrentIdentity().id;
let sessionRevision = 0;
watchCurrentIdentity(() => {
  const next = getCurrentIdentity().id;
  if (owner !== next) {
    ++sessionRevision;
    pending.clear();
    owner = next;
  }
});
export function pendingOperation(taskId: string) {
  return pending.get(taskId);
}
export async function runLearningOperation(
  taskId: string,
  etag: string,
  body: SubmissionCreate | null,
  subject: LearningTaskSubject,
) {
  let op = pending.get(taskId);
  if (op?.running || starting.has(taskId)) throw new Error('请求处理中，请稍候');
  if (!op) {
    const userId = getCurrentIdentity().id;
    if (!userId) throw new Error('请先登录后操作');
    const responsibility = requireSubject(subject);
    const epoch = personBindingEpoch();
    starting.add(taskId);
    let binding;
    try {
      binding = responsibility.type === 'PERSON' ? await requireCurrentPerson() : null;
    } finally {
      starting.delete(taskId);
    }
    if (
      getCurrentIdentity().id !== userId ||
      (responsibility.type === 'PERSON' && epoch !== personBindingEpoch())
    )
      throw new Error('账号或人员绑定已变化，请重新填写');
    if (binding && responsibility.type === 'PERSON' && binding.personId !== responsibility.personId)
      throw new Error('人员绑定已变化，请重新读取分配');
    op = {
      key: `lt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`,
      etag,
      body,
      userId,
      running: false,
      subject: responsibility,
      ...(binding ? { bindingId: binding.bindingId } : {}),
    };
    pending.set(taskId, op);
  }
  const current = op;
  const revision = sessionRevision;
  current.running = true;
  try {
    if (current.subject.type === 'PERSON') {
      const binding = await requireCurrentPerson();
      if (
        binding.personId !== current.subject.personId ||
        binding.bindingId !== current.bindingId ||
        pending.get(taskId) !== current
      )
        throw new Error('人员绑定已变化，原操作不能继续');
    } else if (current.subject.userId !== getCurrentIdentity().id)
      throw new Error('账号任务不属于当前账号');
    const result =
      current.body === null
        ? await confirmLearningTask(taskId, current.etag, current.key)
        : await submitLearningTask(taskId, current.body, current.etag, current.key);
    if (
      revision !== sessionRevision ||
      current.userId !== getCurrentIdentity().id ||
      pending.get(taskId) !== current
    )
      throw new Error('登录身份已变化，请重新读取任务');
    if (pending.get(taskId) === current) pending.delete(taskId);
    return result;
  } catch (error) {
    // Transport, 5xx, malformed success and in-progress conflicts are unknown outcomes.
    // Definitive rejections allow editing a new operation after refreshing the Assignment.
    if (
      isAuthError(error) ||
      (isHttpError(error) && error.statusCode < 500 && ![408, 409, 429].includes(error.statusCode))
    ) {
      if (pending.get(taskId) === current) pending.delete(taskId);
    }
    throw error;
  } finally {
    current.running = false;
  }
}
