import { AuthError } from './error';
import { refreshAuth, waitForAuthStable } from './auth-session';
import { storage, STORAGE_KEYS } from './storage';

export type AuthMode = 'required' | 'optional' | 'none';

const readToken = (): string => storage.get(STORAGE_KEYS.TOKEN) ?? '';

export async function getAuthToken(mode: AuthMode, allowRecovery = true): Promise<string> {
  if (mode === 'none') return '';

  const snapshot = readToken();

  await waitForAuthStable();

  const token = readToken();
  // Subject-bound workflows must re-scan after any authentication recovery/change.
  if (!allowRecovery && (!token || token !== snapshot)) {
    throw new AuthError('Authentication changed before the operation');
  }
  if (token || mode === 'optional') return token;

  return recoverAuthToken();
}

/** 重新认证完成后返回当前 token；旧请求的 token 仅作为并发保护快照。 */
export async function recoverAuthToken(failedToken?: string): Promise<string> {
  const refreshed = await refreshAuth(failedToken);
  const token = readToken();

  if (!refreshed || !token) {
    throw new AuthError('Auth refresh did not produce a token');
  }

  return token;
}
