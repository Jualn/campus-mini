// Current User -> Person boundary. Observations only invalidate local work; never grant authority.
import { http } from '../utils/request';
import { getCurrentIdentity, watchCurrentIdentity } from '../actions/current-user';
import { AuthError, HttpError } from '../utils/error';

export type MyPersonBinding = { userId: string; version: string; evaluatedAt: string } & (
  | { state: 'UNBOUND' }
  | { state: 'BOUND'; personId: string; bindingId: string; personStatus: 'ACTIVE' | 'ARCHIVED' }
);
export type ActivePersonBinding = Extract<MyPersonBinding, { state: 'BOUND' }>;
let owner = getCurrentIdentity().id;
let epoch = 0;
let generation = 0;
let fingerprint: string | null = null;
let requestSequence = 0;
let appliedSequence = 0;
const listeners = new Set<() => void>();
const invalidate = () => {
  epoch++;
  for (const listener of listeners) listener();
};
watchCurrentIdentity(() => {
  const next = getCurrentIdentity().id;
  if (owner === next) return;
  owner = next;
  generation++;
  fingerprint = null;
  invalidate();
});
export const personBindingEpoch = () => epoch;
export function watchPersonBinding(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function invalid(): never {
  throw new HttpError(502, 'Invalid current person binding', {
    userMessage: '当前人员绑定暂不可确认，请重新查询',
  });
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) return invalid();
  return value;
}
export async function getMyPersonBinding(): Promise<MyPersonBinding> {
  const sequence = ++requestSequence;
  const userId = getCurrentIdentity().id,
    revision = generation;
  if (!userId) throw new AuthError();
  const value = await http.get('/v1/users/me/person-binding', undefined, {
    auth: 'required',
    sensitive: true,
    retryAuth: false,
  });
  if (revision !== generation || userId !== getCurrentIdentity().id) throw new AuthError();
  if (!value || typeof value !== 'object') return invalid();
  const raw = value as Record<string, unknown>;
  if (
    raw.userId !== userId ||
    typeof raw.evaluatedAt !== 'string' ||
    !Number.isFinite(Date.parse(raw.evaluatedAt))
  )
    return invalid();
  const base = { userId, version: id(raw.version), evaluatedAt: raw.evaluatedAt };
  let binding: MyPersonBinding;
  if (raw.state === 'UNBOUND') {
    if ('personId' in raw || 'bindingId' in raw || 'personStatus' in raw) return invalid();
    binding = { ...base, state: 'UNBOUND' };
  } else if (
    raw.state === 'BOUND' &&
    (raw.personStatus === 'ACTIVE' || raw.personStatus === 'ARCHIVED')
  )
    binding = {
      ...base,
      state: 'BOUND',
      personId: id(raw.personId),
      bindingId: id(raw.bindingId),
      personStatus: raw.personStatus,
    };
  else return invalid();
  const next = JSON.stringify(
    binding.state === 'BOUND'
      ? [binding.state, binding.personId, binding.bindingId, binding.personStatus, binding.version]
      : [binding.state, binding.version],
  );
  if (sequence < appliedSequence && next !== fingerprint)
    throw new AuthError('人员绑定读取已被更新，请重新查询');
  appliedSequence = Math.max(sequence, appliedSequence);
  if (fingerprint !== null && fingerprint !== next) {
    fingerprint = next;
    invalidate();
  } else fingerprint = next;
  return binding;
}
export async function requireCurrentPerson(): Promise<ActivePersonBinding> {
  const binding = await getMyPersonBinding();
  if (binding.state !== 'BOUND')
    throw new HttpError(403, 'No person binding', { userMessage: '请先关联人员档案' });
  if (binding.personStatus !== 'ACTIVE')
    throw new HttpError(403, 'Person unavailable', { userMessage: '人员档案当前不可用' });
  return binding;
}
export async function assertCurrentPerson(binding: ActivePersonBinding) {
  const current = await requireCurrentPerson();
  if (
    current.userId !== binding.userId ||
    current.personId !== binding.personId ||
    current.bindingId !== binding.bindingId
  )
    throw new AuthError('人员绑定已变化，请重新读取当前业务');
}
