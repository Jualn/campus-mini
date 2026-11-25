// Login-session memory only; unresolved private requests survive page navigation.
import { getCurrentIdentity, watchCurrentIdentity } from '../../actions/current-user';
import { HttpError } from '../../utils/error';
import { getMyPersonBinding } from '../../services/person-binding';
import {
  createMyPartyIdentityApplication,
  listMyPartyIdentityApplications,
  getMyPartyIdentity,
  normalizePartyApplication,
  qualificationSession,
  type PartyIdentityApplicationCreate,
  type PartyIdentityApplication,
} from './people-qualification';

interface Operation {
  body: PartyIdentityApplicationCreate;
  key: string;
  running: boolean;
  receipt?: PartyIdentityApplication;
}
export class PartyBindingReconciliationError extends Error {
  constructor() {
    super('人员绑定申请已成功，但当前绑定或身份暂不可确认；请保留原申请并重新查询');
  }
}
let pending: Operation | null = null;
let owner = getCurrentIdentity().id;
watchCurrentIdentity(() => {
  if (owner !== getCurrentIdentity().id) {
    owner = getCurrentIdentity().id;
    pending = null;
  }
});
export const pendingPartyApplication = () => pending;
export async function submitPartyApplication(body: PartyIdentityApplicationCreate) {
  const check = qualificationSession();
  if (pending?.running) throw new Error('申请处理中');
  const retry = !!pending;
  pending ??= {
    body: normalizePartyApplication(body),
    key: `party_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`,
    running: false,
  };
  const current = pending;
  current.running = true;
  let attempted = false;
  let confirmed = false;
  try {
    // Receipts are historical, not current identity. Never infer success of this
    // logical operation from a different receipt; reconcile then replay original key.
    if (retry) {
      await getMyPersonBinding();
      await getMyPartyIdentity();
      await listMyPartyIdentityApplications();
    }
    check();
    attempted = true;
    const receipt =
      current.receipt ?? (await createMyPartyIdentityApplication(current.body, current.key));
    current.receipt = receipt;
    confirmed = true;
    check();
    await getMyPersonBinding();
    await getMyPartyIdentity();
    check();
    if (pending === current) pending = null;
    return receipt;
  } catch (error) {
    const definitive =
      attempted &&
      !confirmed &&
      error instanceof HttpError &&
      !(retry && [401, 403, 404].includes(error.statusCode)) &&
      ((error.statusCode < 500 && ![408, 409, 429].includes(error.statusCode)) ||
        (error.statusCode === 409 && error.problemType === '/problems/roster-state-conflict'));
    if (definitive && pending === current) pending = null;
    if (current.receipt) throw new PartyBindingReconciliationError();
    throw error;
  } finally {
    current.running = false;
  }
}
