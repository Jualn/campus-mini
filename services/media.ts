import { api } from './api';
import type {
  CosUploadCredentialDTO,
  MediaAttachmentBO,
  MediaAttachmentCreateRequest,
  MediaUploadCredentialRequest,
} from '../types/api';

export const getUploadCredential = (
  payload: MediaUploadCredentialRequest,
): Promise<CosUploadCredentialDTO> => api.media.getUploadCredential(payload);

export const saveAttachments = (
  payload: MediaAttachmentCreateRequest,
): Promise<MediaAttachmentBO[]> => api.media.saveAttachments(payload);

export const removeAttachment = (attachmentId: string): Promise<null> =>
  api.media.removeAttachment(attachmentId);
