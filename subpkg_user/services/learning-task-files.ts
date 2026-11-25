import { uploadPrivateVideo } from './private-video-upload';
import { uploadCosFile } from '../../utils/cos';
import {
  createLearningTaskFileUploadCredentials,
  registerLearningTaskFile,
  type PrivateFileCredentials,
  type PrivateFileDeclaration,
} from './learning-task';
import type { SelectedFile } from './learning-task-state';

const key = () => `ltf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
export interface FileUploadAttempt {
  credentialKey: string;
  registerKey: string;
  credentials?: PrivateFileCredentials;
  uploaded: boolean;
}
export const newFileUploadAttempt = (): FileUploadAttempt => ({
  credentialKey: key(),
  registerKey: key(),
  uploaded: false,
});
const contentTypes: Record<string, PrivateFileDeclaration['contentType'] | undefined> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export async function uploadLearningFile(
  assignmentId: string,
  file: SelectedFile,
  attempt: FileUploadAttempt,
  current: () => void,
  progress: (percent: number) => void,
) {
  current();
  const contentType = contentTypes[file.name.split('.').pop()?.toLowerCase() ?? ''];
  if (!contentType) throw new Error('不支持的文件格式');
  attempt.credentials ??= await createLearningTaskFileUploadCredentials(
    assignmentId,
    [{ fileName: file.name, kind: file.kind, contentType, sizeBytes: file.size }],
    attempt.credentialKey,
  );
  current();
  const c = attempt.credentials;
  if (
    !c.uploadId ||
    !Array.isArray(c.objectKeys) ||
    c.objectKeys.length !== 1 ||
    !c.objectKeys[0] ||
    !c.bucket ||
    !c.region ||
    !c.tmpSecretId ||
    !c.tmpSecretKey ||
    !c.sessionToken ||
    (!attempt.uploaded && (!Number.isFinite(c.expiredTime) || c.expiredTime * 1000 <= Date.now()))
  )
    throw new Error('私有上传凭证无效或已过期，请重新选择文件');

  if (!attempt.uploaded) {
    try {
      if (file.kind === 'VIDEO') await uploadPrivateVideo(c, file, current, progress);
      else
        await uploadCosFile({
          credential: { ...c, customDomain: c.customDomain ?? undefined },
          filePath: file.path,
          contentType,
          onProgress: (p) => {
            progress(Math.floor(p.progress * 100));
          },
        });
      attempt.uploaded = true;
    } catch (error) {
      // A lost PUT response cannot prove immutable bytes were accepted. Next explicit
      // retry allocates a new object; never overwrite or register an uncertain object.
      attempt.credentials = undefined;
      attempt.credentialKey = key();
      attempt.registerKey = key();
      throw error;
    }
  }
  current();
 
  const registered = await registerLearningTaskFile(
    assignmentId,
    c.uploadId,
    0,
    attempt.registerKey,
  );
  current();
  if (
    registered.kind !== file.kind ||
    registered.sizeBytes !== file.size ||
    registered.contentType !== contentType
  )
    throw new Error('登记文件与所选文件不匹配');
  return registered;
}
