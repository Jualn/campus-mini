import config from '../../config/index';
import { http } from '../../utils/request';
import { getAuthToken } from '../../utils/auth-transport';
import { uploadCosFile } from '../../utils/cos';
import { uploadPrivateVideo } from './private-video-upload';
import { readMedia, type GrowthMedia, type GrowthLink } from './growth-record';
import type { PrivateFileCredentials } from './learning-task';
export interface GrowthFile {
  path: string;
  name: string;
  size: number;
  kind: 'IMAGE' | 'VIDEO';
  contentType: string;
}
export interface UploadAttempt {
  allocation?: {
    uploadId: string;
    expiresAt: string;
    registrationExpiresAt: string;
    credentials: Omit<PrivateFileCredentials, 'uploadId'>;
  };
  uploaded: boolean;
  media?: GrowthMedia;
}
const options = { auth: 'required' as const, sensitive: true, retryAuth: false };
export function selectedGrowthFile(
  path: string,
  name: string,
  size: number,
  kind: 'IMAGE' | 'VIDEO',
): GrowthFile {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const contentType = (
    {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      mp4: 'video/mp4',
    } as Record<string, string>
  )[ext];
  if (
    !contentType ||
    (kind === 'VIDEO' ? contentType !== 'video/mp4' : !contentType.startsWith('image/')) ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > (kind === 'IMAGE' ? 10485760 : 209715200)
  )
    throw new Error('请选择 10MiB 内图片或 200MiB 内 MP4 视频');
  return { path, name, size, kind, contentType };
}
export async function uploadGrowthFile(
  context: Pick<GrowthLink, 'organizationId' | 'recordType'> & { postId?: string },
  file: GrowthFile,
  attempt: UploadAttempt,
  current: () => void,
  progress: (percent: number) => void,
) {
  current();
  if (attempt.media) {
    if (!attempt.media.unboundExpiresAt || Date.parse(attempt.media.unboundExpiresAt) <= Date.now())
      throw new Error('媒体候选已过期，请移除并重新选择');
    return attempt.media;
  }
  attempt.allocation ??= await http.post(
    '/v1/growth-media/uploads',
    {
      ...context,
      files: [
        {
          kind: file.kind,
          originalName: file.name,
          contentType: file.contentType,
          sizeBytes: file.size,
        },
      ],
    },
    options,
  );
  current();
  const a = attempt.allocation,
    c = a.credentials;
  if (
    !a.uploadId ||
    !Array.isArray(c.objectKeys) ||
    c.objectKeys.length !== 1 ||
    !c.objectKeys[0] ||
    !c.bucket ||
    !c.region ||
    !c.tmpSecretId ||
    !c.tmpSecretKey ||
    !c.sessionToken ||
    !Number.isFinite(Date.parse(a.registrationExpiresAt)) ||
    Date.parse(a.registrationExpiresAt) <= Date.now() ||
    (!attempt.uploaded &&
      (!Number.isFinite(c.expiredTime) ||
        c.expiredTime * 1000 <= Date.now() ||
        !Number.isFinite(Date.parse(a.expiresAt)) ||
        Date.parse(a.expiresAt) <= Date.now()))
  )
    throw new Error('成长上传凭证无效或已过期，请重新选择');
  if (!attempt.uploaded) {
    try {
      if (file.kind === 'VIDEO') await uploadPrivateVideo(c, file, current, progress);
      else
        await uploadCosFile({
          credential: { ...c, customDomain: c.customDomain ?? undefined },
          filePath: file.path,
          contentType: file.contentType,
          onProgress: (p) => {
            progress(Math.floor(p.progress * 100));
          },
        });
      attempt.uploaded = true;
    } catch (e) {
      attempt.allocation = undefined;
      throw e;
    }
  }
  current();
  const media = readMedia(
    await http.post('/v1/growth-media', { uploadId: a.uploadId, fileIndex: 0 }, options),
  );
  current();
  if (
    media.kind !== file.kind ||
    media.contentType !== file.contentType ||
    media.sizeBytes !== file.size ||
    !media.unboundExpiresAt ||
    !Number.isFinite(Date.parse(media.unboundExpiresAt))
  )
    throw new Error('登记媒体与所选文件不匹配');
  attempt.media = media;
  return media;
}
// URL is an opaque same-origin API address; credentials never travel to COS or a signed URL.
export function controlledMediaUrl(value: string) {
  const base = config.baseURL.replace(/\/$/, '');
  const origin = /^(https?:\/\/[^/]+)/.exec(base)?.[1];
  if (
    !origin ||
    typeof value !== 'string' ||
    !value.startsWith(origin + '/') ||
    /[?#\\\s]/.test(value) ||
    /\/\.\.?(?:\/|$)|%2e|%2f|%5c/i.test(value)
  )
    throw new Error('媒体地址不受支持');
  const path = value.slice(origin.length);
  if (!/^\/v1\/media\/files\/[^/]+\/content$/.test(path))
    throw new Error('媒体必须使用受控字节接口');
  return value;
}
export function removeLocalMedia(filePath: string) {
  wx.getFileSystemManager().unlink({
    filePath,
    fail: () => {
      /* Temporary file may already be reclaimed. */
    },
  });
}
export async function downloadGrowthMedia(
  media: GrowthMedia,
  current: () => void,
  ownTask: (task: WechatMiniprogram.DownloadTask | null) => void,
): Promise<string> {
  const url = controlledMediaUrl(media.contentUrl);
  const token = await getAuthToken('required');
  current();
  const redirectState = { detected: false };
  const result = await new Promise<WechatMiniprogram.DownloadFileSuccessCallbackResult>(
    (resolve, reject) => {
      const task = wx.downloadFile({
        url,
        header: { Authorization: `Bearer ${token}` },
        success: resolve,
        fail: () => {
          reject(new Error('媒体读取失败，请重新打开'));
        },
      });
      ownTask(task);
      task.onHeadersReceived((res) => {
        if (Object.keys(res.header).some((k) => k.toLowerCase() === 'location')) {
          redirectState.detected = true;
          task.abort();
        }
      });
    },
  ).finally(() => {
    ownTask(null);
  });
  try {
    current();
    if (redirectState.detected || result.statusCode !== 200)
      throw new Error('媒体不存在或当前不可访问');
    return result.tempFilePath;
  } catch (e) {
    removeLocalMedia(result.tempFilePath);
    throw e;
  }
}
