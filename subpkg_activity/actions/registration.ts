import { ensureLogin } from '../../actions/auth';
import { getUserId } from '../../stores/helper';
import {
  storage,
  STORAGE_KEYS,
  type RegistrationFieldCandidateProfile,
  type RegistrationReusablePurpose,
} from '../../utils/storage';
import * as service from '../services/registration';
import type {
  MyRegistration,
  RegistrationAnswers,
  RegistrationField,
  RegistrationForm,
} from '../types/registration';

const MAX_CANDIDATES_PER_PURPOSE = 5;

function isReusablePurpose(
  purpose: RegistrationField['purpose'],
): purpose is RegistrationReusablePurpose {
  return purpose !== 'CUSTOM';
}

function isReusableField(field: RegistrationField): boolean {
  return field.type === 'text' && isReusablePurpose(field.purpose);
}

function readCandidateProfile(userId: string): RegistrationFieldCandidateProfile | undefined {
  const profile = storage.get(STORAGE_KEYS.REGISTRATION_FIELD_CANDIDATES);
  if (profile?.userId !== userId) return undefined;
  return profile;
}

function saveCandidates(
  userId: string,
  fields: RegistrationField[],
  answers: RegistrationAnswers,
): void {
  const now = Date.now();
  const previous = readCandidateProfile(userId);
  const values: RegistrationFieldCandidateProfile['values'] = { ...(previous?.values ?? {}) };
  for (const field of fields) {
    if (!isReusableField(field) || !isReusablePurpose(field.purpose)) continue;
    const raw = answers[field.key];
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    if (!value || service.registrationTextError(field, value)) continue;
    const existing = values[field.purpose] ?? [];
    values[field.purpose] = [
      { value, updatedAt: now },
      ...existing.filter((item) => item.value !== value),
    ].slice(0, MAX_CANDIDATES_PER_PURPOSE);
  }
  storage.set(STORAGE_KEYS.REGISTRATION_FIELD_CANDIDATES, {
    version: 1,
    userId,
    updatedAt: now,
    values,
  });
}

async function settle<T>(
  promise: Promise<T>,
): Promise<{ status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown }> {
  try {
    return { status: 'fulfilled', value: await promise };
  } catch (reason) {
    return { status: 'rejected', reason };
  }
}

async function forCurrentUser<T>(operation: (userId: string) => Promise<T> | T): Promise<T> {
  await ensureLogin();
  const userId = getUserId();
  if (!userId) throw new Error('登录状态不可用，请重试');
  const result = await operation(userId);
  if (getUserId() !== userId) throw new Error('登录状态已变化，请重试');
  return result;
}

export async function loadRegistration(id: string) {
  return forCurrentUser(() =>
    Promise.all([settle(service.readRegistrationForm(id)), settle(service.readMyRegistration(id))]),
  );
}

export async function readMyRegistration(id: string) {
  return forCurrentUser(() => service.readMyRegistration(id));
}

export async function readRegistrationCandidates(fields: RegistrationField[]) {
  return forCurrentUser((userId) => {
    const profile = readCandidateProfile(userId);
    const byFieldKey: Record<string, string[]> = {};
    if (profile) {
      for (const field of fields) {
        if (!isReusableField(field) || !isReusablePurpose(field.purpose)) continue;
        byFieldKey[field.key] = (profile.values[field.purpose] ?? [])
          .map((item) => item.value)
          .filter((value) => !service.registrationTextError(field, value));
      }
    }
    return { byFieldKey, hasProfile: Boolean(profile) };
  });
}

export async function saveRegistrationCandidates(
  fields: RegistrationField[],
  answers: RegistrationAnswers,
) {
  return forCurrentUser((userId) => {
    saveCandidates(userId, fields, answers);
  });
}

export async function clearRegistrationCandidates() {
  return forCurrentUser(() => {
    storage.remove(STORAGE_KEYS.REGISTRATION_FIELD_CANDIDATES);
  });
}

export async function submitRegistration(
  id: string,
  form: RegistrationForm,
  values: RegistrationAnswers,
  mine: MyRegistration | null,
  rememberReusableFields = false,
) {
  return forCurrentUser(async (userId) => {
    const result = await service.submitRegistration(id, form, values, mine);
    if (rememberReusableFields) saveCandidates(userId, form.fields, result.answers);
    return result;
  });
}

export async function cancelRegistration(id: string, mine: MyRegistration) {
  return forCurrentUser(() => service.cancelRegistration(id, mine));
}
