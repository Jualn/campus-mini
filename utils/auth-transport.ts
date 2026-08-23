import { AuthError } from './error';
import { refreshAuth, waitForAuthStable } from './auth-session';
import { storage, STORAGE_KEYS } from './storage';

export type AuthMode = 'required' | 'optional' | 'none';

const readToken = (): string => storage.get(STORAGE_KEYS.TOKEN) ?? '';

export async function getAuthToken(mode: AuthMode): Promise<string> {
  if (mode === 'none') return '';

  await waitForAuthStable();

  const token = readToken();
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
