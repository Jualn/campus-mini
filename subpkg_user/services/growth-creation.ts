// Unconfirmed creation survives Page navigation within the current login session.
// Private text and upload credentials are never persisted in Storage.
import { getCurrentIdentity, watchCurrentIdentity } from '../../actions/current-user';
import {
  watchPersonBinding,
  requireCurrentPerson,
  type ActivePersonBinding,
} from '../../services/person-binding';
import { isHttpError, isAuthError } from '../../utils/error';
import { createGrowth, type GrowthCreate } from './growth-record';
export interface GrowthCreation {
  payload: GrowthCreate;
  key: string;
  userId: string;
  personId: string;
  bindingId: string;
  running: boolean;
}
let pending: GrowthCreation | null = null;
let owner = getCurrentIdentity().id;
watchCurrentIdentity(() => {
  const next = getCurrentIdentity().id;
  if (owner !== next) {
    owner = next;
    pending = null;
  }
});
watchPersonBinding(() => {
  pending = null;
});
export const pendingGrowthCreation = () => pending;
export function retainGrowthCreation(
  payload: GrowthCreate,
  binding: ActivePersonBinding,
): GrowthCreation {
  if (pending) {
    if (JSON.stringify(pending.payload) !== JSON.stringify(payload))
      throw new Error('上次创建尚未确认，请先恢复原请求');
    return pending;
  }
  if (binding.userId !== getCurrentIdentity().id) throw new Error('发布账号已变化');
  pending = {
    payload,
    key: `growth_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`,
    userId: binding.userId,
    personId: binding.personId,
    bindingId: binding.bindingId,
    running: false,
  };
  return pending;
}
export async function runGrowthCreation(operation: GrowthCreation) {
  if (pending !== operation || operation.running)
    throw new Error('正在处理或身份已变化，请重新读取');
  operation.running = true;
  try {
    const binding = await requireCurrentPerson();
    if (
      pending !== operation ||
      binding.personId !== operation.personId ||
      binding.bindingId !== operation.bindingId ||
      binding.userId !== operation.userId ||
      operation.userId !== getCurrentIdentity().id
    )
      throw new Error('人员绑定已变化，原操作不能继续');
    const result = await createGrowth(operation.payload, operation.key);
    if (pending !== operation || operation.userId !== getCurrentIdentity().id)
      throw new Error('身份已变化，请重新读取成长档案');
    pending = null;
    return result;
  } catch (error) {
    if (
      isAuthError(error) ||
      (isHttpError(error) && [400, 401, 403, 404, 412, 422, 428].includes(error.statusCode))
    ) {
      if (pending === operation) pending = null;
    }
    throw error;
  } finally {
    operation.running = false;
  }
}
