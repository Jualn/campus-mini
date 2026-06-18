/**
 * 媒体服务（services/media.ts）
 *
 * 完整上传流程分两步：
 * 1. 选择文件（selectMessageFiles / selectImages）→ 返回 SelectedMediaFile[]，此时不上传
 * 2. 用户确认提交后调用 uploadAndSaveFiles()：
 *    a. 将文件名列表提交后端 → 返回一个 STS 凭证 + 对应的 objectKey 列表
 *    b. 用该凭证批量上传到 COS
 *    c. 将文件 URL 等信息写库
 *
 * 两种文件来源的区别：
 * - chooseMessageFile → 有原始文件名（直接用）
 * - chooseImages       → 只有路径，无文件名（前端构建后提交后端）
 */

import api from './api';
import { MEDIA_TYPES, type MediaType, type TargetType } from '../utils/constants';
import {
  uploadCosFile,
  uploadCosFilesBatch,
  type CosBatchFileItem,
  type CosUploadOptions,
  type CosUploadProgress,
  type CosUploadResult,
} from '../utils/cos';
import { chooseImages, chooseMessageFile } from '../utils/wx-promise';
import type { AttachmentItemRequest } from '../types/api';

// ── 类型定义 ──────────────────────────────────────────────────────────────

export interface SelectedMediaFile {
  filePath: string;
  /** 提交给后端用于构建 objectKey 的文件名 */
  originalName: string;

  fileSize?: number;
}

interface BatchUploadOptions {
  /** 请求投中设置的content-type类型 */
  contentType?: string;
  /** 请求头 */
  headers?: Record<string, string>;
  timeout?: number;
  /** 上传进度回调 */
  onProgress?: (fileIndex: number, progress: CosUploadProgress) => void;
}

// type BatchUploadResult = {
//   uploadResults: CosUploadResult[];
//   attachmentItems: AttachmentItemRequest[];
//   savedAttachments?: MediaAttachmentBO[];
// };

interface Credential {
  bucket: string; // string
  region: string; // string
  objectKeys: string[]; // 对象键列表。
  tmpSecretId: string; // STS 临时凭证字段
  tmpSecretKey: string; // STS 临时凭证字段
  sessionToken: string; // STS 临时凭证字段
  expiredTime: number; // 单位为 epoch seconds
}

// ── 内部工具函数 ───────────────────────────────────────────────────────────

const getFileNameFromPath = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
};

const getExtension = (name: string): string => {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx) : '';
};

const getBaseName = (name: string): string => {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(0, idx) : name;
};

// 工具函数：根据文件名或路径判断类型
const getFileTypeByName = (fileName: string): MediaType => {
  const lower = fileName.toLowerCase();

  // 图片扩展名
  if (/\.(jpg|jpeg|png|gif|bmp|webp)$/.test(lower)) return MEDIA_TYPES.IMAGE.value;

  // PDF
  if (/\.(pdf)$/.test(lower)) return MEDIA_TYPES.PDF.value;

  // Word
  if (/\.(doc|docx)$/.test(lower)) return MEDIA_TYPES.WORD.value;

  // 其他默认 URL
  return MEDIA_TYPES.URL.value;
};

/**
 * chooseImages 不提供原始文件名，基于路径构建唯一文件名提交后端
 * 格式：{baseName}_{timestamp}_{index}{ext}
 */
const buildImageFileName = (filePath: string, index: number): string => {
  const name = getFileNameFromPath(filePath);
  const base = getBaseName(name) || 'image';
  const ext = getExtension(name) || '.jpg';
  return `${base}_${String(Date.now())}_${String(index)}${ext}`;
};

const buildAttachmentItems = (
  results: CosUploadResult[],
  sourceFiles: SelectedMediaFile[],
): AttachmentItemRequest[] =>
  results.map((result, i) => ({
    type: getFileTypeByName(sourceFiles[i].originalName),
    url: result.fileUrl,
    originalName: sourceFiles[i]?.originalName ?? getFileNameFromPath(result.objectKey),
    sortOrder: i,
  }));

// ── 内部核心流程 ───────────────────────────────────────────────────────────

const uploadAndSave = async (
  targetType: TargetType,
  sourceFiles: SelectedMediaFile[],
  options: BatchUploadOptions = {},
): Promise<AttachmentItemRequest[]> => {
  // 一次请求：后端返回一个 STS 凭证 + 按 fileNames 顺序的 objectKey 列表
  const batchCredentialRaw = await api.media.getUploadCredential({
    targetType,
    fileNames: sourceFiles.map((f) => f.originalName),
  });

  const batchCredential: Credential = batchCredentialRaw;

  if (batchCredential.objectKeys.length !== sourceFiles.length) {
    throw new Error('后端返回的 objectKey 数量与文件数量不一致');
  }

  // 将后端返回结构直接映射为 cos.ts 的批量上传参数，无需拆包重组
  const files: CosBatchFileItem[] = batchCredential.objectKeys.map((objectKey, i) => ({
    objectKey: objectKey,
    filePath: sourceFiles[i].filePath,
    contentType: options.contentType,
    headers: options.headers,
    onProgress: options.onProgress
      ? (progress) => {
          options.onProgress?.(i, progress);
        }
      : undefined,
  }));

  const uploadResults = await uploadCosFilesBatch(batchCredential, files);

  const attachmentItems = buildAttachmentItems(uploadResults, sourceFiles);

  // const savedAttachments = await api.media
  //   .saveAttachments({ targetType, attachmentItems })
  //   .catch((err) => {
  //     logger.error(TAG, "保存附件信息失败", err);
  //     throw err;
  //   });

  return attachmentItems;
};

// ── 公开 API ──────────────────────────────────────────────────────────────

/**
 * 第一步：选择聊天文件
 * chooseMessageFile 返回 { path, name }，name 即原始文件名，直接提交后端
 */
export const selectMessageFiles = async (
  options: Parameters<typeof chooseMessageFile>[0] = {},
): Promise<SelectedMediaFile[]> => {
  const files = await chooseMessageFile(options);
  return files.map((file) => ({
    filePath: file.path,
    originalName: file.name,
    fileSize: file.size,
  }));
};

/**
 * 第一步：选择图片
 * chooseImages 只返回路径，无文件名，前端基于路径构建文件名后提交后端
 */
export const selectImages = async (count = 1): Promise<SelectedMediaFile[]> => {
  const filePaths = await chooseImages(count);
  return filePaths.map((filePath, i) => ({
    filePath,
    originalName: buildImageFileName(filePath, i),
  }));
};

/**
 * 第二步：批量上传并保存（用户确认提交后调用）
 * 内部流程：获取 STS 凭证 → 批量上传 COS → 返回attachmentItems
 */
export const uploadAndSaveFiles = (
  targetType: TargetType,
  sourceFiles: SelectedMediaFile[],
  options?: BatchUploadOptions,
): Promise<AttachmentItemRequest[]> => uploadAndSave(targetType, sourceFiles, options);

/**
 * 一站式单文件上传：获取凭证 + 上传到 COS
 * 适用于头像等单文件、不需要写附件记录的场景
 */
export const uploadMediaFileToCos = async (
  credentialRequest: { targetType: TargetType; fileNames: string[] },
  filePath: string,
  options: Omit<CosUploadOptions, 'credential' | 'filePath'> = {},
): Promise<CosUploadResult> => {
  const credential = await api.media.getUploadCredential(credentialRequest);
  return uploadCosFile({ ...options, credential, filePath });
};

/** 删除已上传的附件（后端同步删除 COS 文件及数据库记录） */
export const removeAttachment = async (attachmentId: string): Promise<void> => {
  if (!attachmentId) return Promise.reject(new Error('attachmentId 不能为空'));
  await api.media.removeAttachment(attachmentId);
};

export default {
  selectMessageFiles,
  selectImages,
  uploadAndSaveFiles,
  uploadMediaFileToCos,
  removeAttachment,
};
