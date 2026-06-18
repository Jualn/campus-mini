/**
 * COS 上传工具（utils/cos.ts）
 *
 * 支持两种上传模式：
 * - 单文件：uploadCosFile()，自动选择 STS SDK 或预签名 URL 直传
 * - 批量：uploadCosFilesBatch()，一个共享 STS 凭证 + N 个文件描述
 *
 * 上层使用：见 services/media.ts
 */

import type { CosUploadCredentialDTO } from '../types/api';
import createLogger from './logger';

declare const require: (id: string) => unknown;

const COS_MODULE = require('../miniprogram_npm/cos-wx-sdk-v5/index.js') as new (
  options: CosClientInitOptions,
) => CosClient;

// ── SDK 内部类型 ───────────────────────────────────────────────────────────

interface CosClient {
  uploadFile: (
    options: Record<string, unknown>,
    callback: (err: unknown, data?: unknown) => void,
  ) => void;
  uploadFiles?: (
    options: {
      files: Record<string, unknown>[];
      SliceSize?: number;
      onProgress?: (info: CosProgressInfo) => void;
    },
    callback: (err: unknown, data?: CosBatchResult) => void,
  ) => void;
}

interface CosClientInitOptions {
  getAuthorization: (
    options: CosAuthRequestOptions,
    callback: (authorization: CosAuthorizationResult) => void,
  ) => void;
  CorrectClockSkew?: boolean;
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

interface CosBatchResult {
  files?: {
    ETag?: string;
    etag?: string;
    RequestId?: string;
    requestId?: string;
    /** SDK uploadFiles 单文件失败时，error 有值，顶层 err 仍为 null */
    error?: unknown;
  }[];
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
const log = createLogger('CosUtil');

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

const isStsCredential = (credential: CosUploadCredentialDTO): boolean =>
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
  const domain = customDomain
    ? customDomain.replace(/\/$/, '')
    : `${bucket}.cos.${region}.myqcloud.com`;
  return `https://${domain}/${encodeObjectKey(objectKey)}`;
};

/** 创建 COS SDK 客户端（STS 模式） */
export const createCosClient = (credential: CosStsCredential): CosClient =>
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

const uploadWithSts = (options: CosUploadOptions): Promise<CosUploadResult> => {
  const { credential, filePath, contentType, headers, onProgress } = options;
  const client = createCosClient(credential);

  return new Promise((resolve, reject) => {
    client.uploadFile(
      {
        Bucket: credential.bucket,
        Region: credential.region,
        Key: credential.objectKeys[0],
        FilePath: filePath,
        Headers: {
          ...(contentType ? { 'Content-Type': contentType } : {}),
          ...headers,
        },
        onProgress: (p: CosUploadProgress) => onProgress?.(p),
      },
      (err, data) => {
        if (err) {
          reject(
            new Error(
              TAG + `上传失败: ${err instanceof Error ? err.message : JSON.stringify(err)}`,
            ),
          );
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
  const body = await readFileAsArrayBuffer(filePath);

  return new Promise((resolve, reject) => {
    wx.request({
      url: credential.uploadUrl,
      method: 'PUT',
      data: body,
      timeout,
      header: {
        'Content-Type': contentType ?? 'application/octet-stream',
        ...headers,
      },
      success: (res: WechatMiniprogram.RequestSuccessCallbackResult) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const error = new Error(
            `COS 预签名上传失败，HTTP ${res.statusCode.toString()}` +
              (res.data ? `, ${JSON.stringify(res.data)}` : ''),
          );
          reject(error);
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
      fail: (err: WechatMiniprogram.GeneralCallbackResult) => {
        reject(new Error(TAG + `预签名上传失败: ${err.errMsg}`));
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
 * 批量上传入口（STS 模式）
 *
 * 接受一个共享 STS 凭证 + N 个文件描述，直接对应后端批量凭证接口的返回结构。
 * 内部优先使用 SDK 的 uploadFiles 队列（支持并发控制），
 * SDK 版本不支持时退化为并行的单文件上传。
 */
export const uploadCosFilesBatch = (
  credential: CosStsCredential,
  files: CosBatchFileItem[],
): Promise<CosUploadResult[]> => {
  if (files.length === 0) return Promise.resolve([]);

  const client = createCosClient(credential);

  /** 将单个文件的上传结果标准化 */
  const toResult = (
    file: CosBatchFileItem,
    data: SdkUploadResult | undefined,
  ): CosUploadResult => ({
    objectKey: file.objectKey,
    fileUrl: buildCosObjectUrl(
      credential.bucket,
      credential.region,
      file.objectKey,
      credential.customDomain,
    ),
    etag: data?.ETag,
    requestId: data?.RequestId,
    raw: data,
  });

  return new Promise((resolve, reject) => {
    // 退化路径：SDK 不支持 uploadFiles，并行单文件上传
    if (typeof client.uploadFiles !== 'function') {
      Promise.all(
        files.map(
          (f) =>
            new Promise<CosUploadResult>((res, rej) => {
              client.uploadFile(
                {
                  Bucket: credential.bucket,
                  Region: credential.region,
                  Key: f.objectKey,
                  FilePath: f.filePath,
                  Headers: {
                    ...(f.contentType ? { 'Content-Type': f.contentType } : {}),
                    ...f.headers,
                  },
                  onProgress: (p: CosUploadProgress) => f.onProgress?.(p),
                },
                (err, data) => {
                  if (err) {
                    rej(
                      new Error(
                        TAG +
                          `上传失败: ${err instanceof Error ? err.message : JSON.stringify(err)}`,
                      ),
                    );
                    return;
                  }
                  res(toResult(f, data as SdkUploadResult | undefined));
                },
              );
            }),
        ),
      ).then(resolve, reject);
      return;
    }

    // 主路径：SDK uploadFiles 队列上传
    client.uploadFiles(
      {
        files: files.map((f) => ({
          Bucket: credential.bucket,
          Region: credential.region,
          Key: f.objectKey,
          FilePath: f.filePath,
          Headers: {
            ...(f.contentType ? { 'Content-Type': f.contentType } : {}),
            ...f.headers,
          },
        })),
        SliceSize: 1024 * 1024 * 10, // 设置大于10MB采用分块上传，按需调整，最小支持1MB
        onProgress: (info: CosProgressInfo) => {
          const idx = info.index ?? info.fileIndex;
          if (typeof idx === 'number') {
            files[idx]?.onProgress?.({
              loaded: info.loaded,
              total: info.total,
              progress: info.percent,
            });
          }
        },
      },
      (err, data) => {
        if (err) {
          reject(
            new Error(
              TAG + `批量上传失败: ${err instanceof Error ? err.message : JSON.stringify(err)}`,
            ),
          );
          return;
        }
        // uploadFiles 单文件失败不触发顶层 err，错误藏在 data.files[i].error 里
        const fileResults = data?.files ?? [];
        const failures = fileResults
          .map((f, i) =>
            f.error ? { index: i, objectKey: files[i]?.objectKey, error: f.error } : null,
          )
          .filter(Boolean);

        if (failures.length > 0) {
          log.error('uploadCosFilesBatch', '批量上传部分文件失败', failures);
          reject(
            new Error(
              TAG +
                `批量上传部分文件失败: ${failures[0]?.error instanceof Error ? failures[0].error.message : JSON.stringify(failures[0]?.error)}`,
            ),
          );
          return;
        }

        resolve(
          fileResults.map((f, i) =>
            toResult(files[i], {
              ETag: f.ETag ?? f.etag,
              RequestId: f.RequestId ?? f.requestId,
            }),
          ),
        );
      },
    );
  });
};

export default {
  buildCosFileUrl,
  buildCosObjectUrl,
  createCosClient,
  createDefaultObjectKey,
  uploadCosFile,
  uploadCosFilesBatch,
};
