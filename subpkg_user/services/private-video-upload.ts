import { createCosClient } from '../../utils/cos';
import type { PrivateFileCredentials } from './learning-task';

type MultipartMethod = (
  options: Record<string, unknown>,
  callback: (error: unknown, data?: { UploadId?: string; ETag?: string }) => void,
) => void;

// Keep video buffers bounded. Explicit SDK primitives avoid PostObject and automatic
// multipart resume/overwrite policy. Provider still owns exact-object STS restrictions.
export async function uploadPrivateVideo(
  credentials: Omit<PrivateFileCredentials, 'uploadId'>,
  file: { path: string; size: number },
  current: () => void,
  progress: (percent: number) => void,
) {
  const client = createCosClient({
    ...credentials,
    customDomain: credentials.customDomain ?? undefined,
  }) as unknown as Record<
    'multipartInit' | 'multipartUpload' | 'multipartComplete',
    MultipartMethod
  >;
  const invoke = (method: keyof typeof client, options: Record<string, unknown>) =>
    new Promise<{ UploadId?: string; ETag?: string }>((resolve, reject) => {
      current();
      client[method](
        {
          Bucket: credentials.bucket,
          Region: credentials.region,
          Key: credentials.objectKeys[0],
          ...options,
          Headers: method === 'multipartInit'
          ? {
              'Content-Type': 'video/mp4',
              'x-cos-acl': 'private',
              'x-cos-forbid-overwrite': 'true',
            }
          : method === 'multipartComplete'
            ? {
                'x-cos-forbid-overwrite': 'true',
              }
            : {},
        },
        (error, data) => {
          if (error) reject(new Error('视频上传未完成，请重试上传'));
          else resolve(data ?? {});
        },
      );
    });
  const { UploadId } = await invoke('multipartInit', {});
  if (!UploadId) throw new Error('视频上传凭证无效');
  const parts: { PartNumber: number; ETag: string }[] = [];
  const chunkSize = 5 * 1024 * 1024;
  for (let position = 0; position < file.size; position += chunkSize) {
    current();
    const length = Math.min(chunkSize, file.size - position);
    const body = await new Promise<ArrayBuffer>((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath: file.path,
        position,
        length,
        success: (result) => {
          resolve(result.data as ArrayBuffer);
        },
        fail: () => {
          reject(new Error('读取视频失败，请重新选择'));
        },
      });
    });
    if (body.byteLength !== length) throw new Error('视频文件已变化，请重新选择');
    const part = await invoke('multipartUpload', {
      UploadId,
      PartNumber: parts.length + 1,
      Body: body,
      ContentLength: length,
    });
    if (!part.ETag) throw new Error('视频分片上传未确认');
    parts.push({ PartNumber: parts.length + 1, ETag: part.ETag });
    progress(Math.floor(((position + length) / file.size) * 100));
  }
  await invoke('multipartComplete', { UploadId, Parts: parts });
}
