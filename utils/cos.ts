/**
 * COS 上传工具（utils/cos.ts）
 *
 * 支持两种上传模式：
 * - 单文件：uploadCosFile()，STS SDK PUT 或预签名 URL PUT 直传
 * - 批量：uploadCosFilesBatch()，一个共享 STS 凭证，逐文件 PUT
 *
 * 上层使用：见 services/media.ts
 */

import type { CosUploadCredentialDTO } from '../types/api';

declare const require: (id: string) => unknown;

const COS_MODULE = require('../miniprogram_npm/cos-wx-sdk-v5/index.js') as new (
  options: CosClientInitOptions,
) => CosClient;

// ── SDK 内部类型 ───────────────────────────────────────────────────────────

interface CosClient {
  putObject: (
    options: Record<string, unknown>,
    callback: (err: unknown, data?: unknown) => void,
  ) => void;
}

interface CosClientInitOptions {
  getAuthorization: (
    options: CosAuthRequestOptions,
    callback: (authorization: CosAuthorizationResult) => void,
  ) => void;
  CorrectClockSkew?: boolean;
  Timeout?: number;
}

interface CosAuthRequestOptions {
  Bucket: string;
  Region: string;
  Method: string;
  Key: string;
  Pathname: string;
  Query: Record<string, unknown>;
  Headers: Record<string, string>;
  Scope: unknown[];
  SystemClockOffset: number;
  ForceSignHost: boolean;
}

interface CosAuthorizationResult {
  TmpSecretId?: string;
  TmpSecretKey?: string;
  SecurityToken?: string;
  ExpiredTime?: number;
}

interface CosProgressInfo {
  loaded: number;
  total: number;
  percent: number;
  index?: number;
  fileIndex?: number;
}

interface SdkUploadResult {
  ETag?: string;
  RequestId?: string;
}

// ── 公开类型 ───────────────────────────────────────────────────────────────

export interface CosUploadProgress {
  loaded: number;
  total: number;
  progress: number;
}

/** 单文件上传凭证（STS 或预签名 URL，由后端决定） */
export interface CosUploadOptions {
  credential: CosUploadCredentialDTO;
  filePath: string;
  contentType?: string;
  headers?: Record<string, string>;
  timeout?: number;
  /** @deprecated 所有上传均使用单次 PUT，保留此字段兼容专用材料调用。 */
  singlePut?: boolean;
  onProgress?: (progress: CosUploadProgress) => void;
}

/**
 * 批量上传凭证：一个共享 STS 凭证，对应 N 个文件。
 * 这直接反映后端批量接口的返回结构。
 */
export interface CosStsCredential {
  tmpSecretId: string;
  tmpSecretKey: string;
  sessionToken: string;
  expiredTime?: number;
  expireAt?: string;
  bucket: string;
  region: string;
  customDomain?: string;
}

/** 批量上传中单个文件的描述 */
export interface CosBatchFileItem {
  filePath: string;
  objectKey: string;
  contentType?: string;
  headers?: Record<string, string>;
  timeout?: number;
  onProgress?: (progress: CosUploadProgress) => void;
}

export interface CosUploadResult {
  objectKey: string;
  fileUrl: string;
  etag?: string;
  requestId?: string;
  raw?: unknown;
}

// ── 内部工具函数 ───────────────────────────────────────────────────────────

const TAG = 'CosUtil';
// file-foundation-v1-r2: callers cannot remove or override this signed header.
const uploadHeaders = (
  contentType?: string,
  headers: Record<string, string> = {},
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() !== 'x-cos-forbid-overwrite') result[name] = headers[name];
  }
  return {
    ...(contentType ? { 'Content-Type': contentType } : {}),
    ...result,
    'x-cos-forbid-overwrite': 'true',
  };
};

// Keep raw SDK errors (which can contain request headers/URLs) out of UI/logs.
const uploadFailure = (error: unknown): Error => {
  const status =
    typeof error === 'object' && error !== null && 'statusCode' in error
      ? error.statusCode
      : undefined;
  return new Error(
    status === 409 || status === 412
      ? '文件已存在，无法确认本次上传结果，请重新上传后再保存'
      : '文件上传未完成，请重试上传后再保存',
  );
};

const getFileNameFromPath = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
};

const encodeObjectKey = (objectKey: string): string =>
  objectKey
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');

const normalizeExpireTime = (
  credential: Pick<CosStsCredential, 'expiredTime' | 'expireAt'>,
): number | undefined => {
  if (typeof credential.expiredTime === 'number' && credential.expiredTime > 0) {
    return credential.expiredTime;
  }
  if (credential.expireAt) {
    const parsed = Date.parse(credential.expireAt.replace(' ', 'T'));
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  }
  return undefined;
};

const isStsCredential = (
  credential: CosUploadCredentialDTO,
): credential is CosStsCredential & CosUploadCredentialDTO =>
  Boolean(
    credential.tmpSecretId &&
    credential.tmpSecretKey &&
    credential.sessionToken &&
    normalizeExpireTime(credential),
  );

const readFileAsArrayBuffer = (filePath: string): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success: (res: WechatMiniprogram.ReadFileSuccessCallbackResult) => {
        resolve(res.data as ArrayBuffer);
      },
      fail: (err: WechatMiniprogram.GeneralCallbackResult) => {
        reject(new Error(`读取文件失败: ${filePath}, ${err.errMsg}`));
      },
    });
  });

const normalizeProgress = (progress: CosProgressInfo): CosUploadProgress => ({
  loaded: progress.loaded,
  total: progress.total,
  progress: progress.percent,
});

// ── 公开工具函数 ───────────────────────────────────────────────────────────

/**
 * 构建 COS 文件访问 URL
 * 优先级：fileUrl（后端直接提供）> customDomain > 官方默认域名
 */
export const buildCosFileUrl = (credential: CosUploadCredentialDTO): string => {
  if (credential.fileUrl) return credential.fileUrl;

  const { bucket, region, objectKeys, customDomain } = credential;
  if (!bucket || !region) return '';

  return buildCosObjectUrl(bucket, region, objectKeys[0], customDomain);
};

/** 直接从存储信息构建访问 URL */
export const buildCosObjectUrl = (
  bucket: string,
  region: string,
  objectKey: string,
  customDomain?: string,
): string => {
  const configuredDomain = customDomain?.replace(/\/$/, '');
  const baseUrl = configuredDomain
    ? /^https?:\/\//i.test(configuredDomain)
      ? configuredDomain
      : `https://${configuredDomain}`
    : `https://${bucket}.cos.${region}.myqcloud.com`;
  return `${baseUrl}/${encodeObjectKey(objectKey)}`;
};

/** 创建 COS SDK 客户端（STS 模式） */
export const createCosClient = (credential: CosStsCredential, timeout?: number): CosClient =>
  new COS_MODULE({
    getAuthorization: (_options, callback) => {
      callback({
        TmpSecretId: credential.tmpSecretId,
        TmpSecretKey: credential.tmpSecretKey,
        SecurityToken: credential.sessionToken,
        ExpiredTime: normalizeExpireTime(credential),
      });
    },
    CorrectClockSkew: true,
    Timeout: timeout ?? 0,
  });

/** 生成默认的 COS 对象键，格式：prefix/filename */
export const createDefaultObjectKey = (
  prefix: string,
  filePath: string,
  fallbackName?: string,
): string => {
  const cleanPrefix = prefix.trim().replace(/^\/+|\/+$/g, '');
  const fileName = fallbackName ?? getFileNameFromPath(filePath);
  return [cleanPrefix, fileName].filter(Boolean).join('/');
};

// ── 单文件上传 ─────────────────────────────────────────────────────────────

const uploadWithSts = async (options: CosUploadOptions): Promise<CosUploadResult> => {
  const { credential, filePath, contentType, headers, onProgress } = options;
  if (!isStsCredential(credential)) {
    return Promise.reject(new Error(TAG + '上传需要有效的 STS 凭证'));
  }
  const client = createCosClient(credential, options.timeout);
  const body = await readFileAsArrayBuffer(filePath);

  return new Promise((resolve, reject) => {
    // Do not enter the SDK's default PostObject/automatic multipart paths.
    client.putObject(
      {
        Bucket: credential.bucket,
        Region: credential.region,
        Key: credential.objectKeys[0],
        Body: body,
        ContentLength: body.byteLength,
        Headers: uploadHeaders(contentType, headers),
        onProgress: (p: CosProgressInfo) => onProgress?.(normalizeProgress(p)),
      },
      (err, data) => {
        if (err) {
          reject(uploadFailure(err));
          return;
        }
        const r = data as SdkUploadResult | undefined;
        resolve({
          objectKey: credential.objectKeys[0],
          fileUrl: buildCosFileUrl(credential),
          etag: r?.ETag,
          requestId: r?.RequestId,
          raw: data,
        });
      },
    );
  });
};

const uploadWithPreSignedUrl = async (options: CosUploadOptions): Promise<CosUploadResult> => {
  const { credential, filePath, contentType, headers, timeout } = options;
  if (!credential.uploadUrl) {
    return Promise.reject(new Error(TAG + '缺少预签名上传 URL'));
  }
  const uploadUrl = credential.uploadUrl;
  const body = await readFileAsArrayBuffer(filePath);

  return new Promise((resolve, reject) => {
    wx.request({
      url: uploadUrl,
      method: 'PUT',
      data: body,
      timeout,
      header: uploadHeaders(contentType ?? 'application/octet-stream', headers),
      success: (res: WechatMiniprogram.RequestSuccessCallbackResult) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(uploadFailure(res));
          return;
        }
        resolve({
          objectKey: credential.objectKeys[0],
          fileUrl: buildCosFileUrl(credential),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          requestId: res.header['x-cos-request-id'] ?? res.header['x-cos-requestid'],
          raw: res.data,
        });
      },
      fail: () => {
        reject(uploadFailure(undefined));
      },
    });
  });
};

/**
 * 单文件上传入口
 * 根据凭证类型自动选择策略：STS → SDK 上传；uploadUrl → wx.request 直传
 */
export const uploadCosFile = (options: CosUploadOptions): Promise<CosUploadResult> => {
  const { credential } = options;
  if (isStsCredential(credential)) return uploadWithSts(options);
  if (credential.uploadUrl) return uploadWithPreSignedUrl(options);

  throw new Error(
    TAG + `凭证无效，缺少 STS 密钥或 uploadUrl（objectKey: ${credential.objectKeys[0]}）`,
  );
};

// ── 批量上传 ───────────────────────────────────────────────────────────────

/**
 * Batch uploads use sequential single PUTs. This avoids SDK PostObject/multipart
 * defaults and keeps at most one file buffer in memory (ordinary files <= 20MB).
 * Any error, including an overwrite conflict after a lost response, rejects the
 * batch. URLs alone never prove readiness; only business save confirms retention.
 */
export const uploadCosFilesBatch = async (
  credential: CosUploadCredentialDTO,
  files: CosBatchFileItem[],
): Promise<CosUploadResult[]> => {
  if (files.length === 0) return [];
  if (!isStsCredential(credential)) {
    throw new Error(TAG + '批量上传需要有效的 STS 凭证');
  }
  if (
    new Set(credential.objectKeys).size !== credential.objectKeys.length ||
    new Set(files.map((file) => file.objectKey)).size !== files.length ||
    files.some((file) => !file.objectKey || !credential.objectKeys.includes(file.objectKey))
  ) {
    throw new Error(TAG + '上传对象必须唯一且来自本次分配的 objectKeys');
  }
  const results: CosUploadResult[] = [];
  for (const file of files) {
    results.push(
      await uploadCosFile({
        credential: { ...credential, objectKeys: [file.objectKey], fileUrl: undefined },
        filePath: file.filePath,
        contentType: file.contentType,
        headers: file.headers,
        timeout: file.timeout,
        onProgress: file.onProgress,
      }),
    );
  }
  return results;
};
