import { api } from './api';
import type { LoginRequest, LoginVO } from '../types/api';

export const login = (payload: LoginRequest): Promise<LoginVO> => api.auth.login(payload);
