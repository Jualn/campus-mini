import { api } from './api';
import type { CosUploadCredentialDTO, MediaUploadCredentialRequest } from '../types/api';

export const getUploadCredential = (
  payload: MediaUploadCredentialRequest,
): Promise<CosUploadCredentialDTO> => api.media.getUploadCredential(payload);
