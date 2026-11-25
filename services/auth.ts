import { api } from './api';
import type { LoginRequest, LoginVO } from '../types/api';

export const login = (payload: LoginRequest): Promise<LoginVO> => api.auth.login(payload);

/** Current ordinary token only; logout never refreshes or retries credentials. */
export const logout = (token: string) => api.auth.logout(token);
