/**
 * 媒体操作（actions/media.ts）
 *
 * 完整上传流程分两步：
 * 1. 选择文件（selectMessageFiles / selectImages）→ 返回 SelectedMediaFile[]，此时不上传
 * 2. 用户确认提交后调用 uploadFilesToCos()：
 *    a. 将文件名列表提交后端 → 返回一个 STS 凭证 + 对应的 objectKey 列表
 *    b. 用该凭证批量上传到 COS
 *    c. 返回 objectKey/URL，由业务提交接口统一写库
 *
 * 两种文件来源的区别：
 * - chooseMessageFile → 有原始文件名（直接用）
 * - chooseImages       → 只有路径，无文件名（前端构建后提交后端）
 */

import * as mediaService from '../services/media';
import { MEDIA_TYPES, type MediaType, type TargetType } from '../utils/constants';
import {
  uploadCosFile,
  uploadCosFilesBatch,
  type CosBatchFileItem,
  type CosUploadOptions,
  type CosUploadProgress,
  type CosUploadResult,
} from '../utils/cos';
import { chooseImages, chooseMessageFile, wxCompressImage } from '../utils/wx-promise';
import type { AttachmentItemRequest } from '../types/api';

// ── 类型定义 ──────────────────────────────────────────────────────────────

export interface SelectedMediaFile {
  filePath: string;
  /** 提交给后端用于构建 objectKey 的文件名 */
  originalName: string;

  fileSize?: number;
  mimeType?: string;
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

const IMAGE_COMPRESS_THRESHOLD = 1024 * 1024;
const MAX_IMAGE_UPLOAD_SIZE = 10 * 1024 * 1024;
const MAX_DOCUMENT_UPLOAD_SIZE = 20 * 1024 * 1024;
const IMAGE_COMPRESS_QUALITY = 82;

const canCompressImage = (fileName: string): boolean => /\.(jpe?g|png|webp)$/i.test(fileName);

const getLocalFileSize = (filePath: string): Promise<number> =>
  new Promise((resolve, reject) => {
    wx.getFileSystemManager().getFileInfo({
      filePath,
      success: (result) => {
        resolve(result.size);
      },
      fail: (error) => {
        reject(new Error(`读取文件大小失败: ${error.errMsg}`));
      },
    });
  });

const getContentTypeByName = (fileName: string): string => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  throw new Error(`不支持上传该文件类型: ${fileName}`);
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

  throw new Error(`不支持上传该文件类型: ${fileName}`);
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
    objectKey: result.objectKey,
    url: result.fileUrl,
    originalName: sourceFiles[i]?.originalName ?? getFileNameFromPath(result.objectKey),
    sortOrder: i,
  }));

// ── 内部核心流程 ───────────────────────────────────────────────────────────

const uploadFiles = async (
  targetType: TargetType,
  sourceFiles: SelectedMediaFile[],
  options: BatchUploadOptions = {},
): Promise<AttachmentItemRequest[]> => {
  // 一次请求：后端返回一个 STS 凭证 + 按 fileNames 顺序的 objectKey 列表
  const batchCredential = await mediaService.getUploadCredential({
    targetType,
    fileNames: sourceFiles.map((f) => f.originalName),
  });

  if (batchCredential.objectKeys.length !== sourceFiles.length) {
    throw new Error('后端返回的 objectKey 数量与文件数量不一致');
  }

  // 将后端返回结构直接映射为 cos.ts 的批量上传参数，无需拆包重组
  const files: CosBatchFileItem[] = batchCredential.objectKeys.map((objectKey, i) => ({
    objectKey: objectKey,
    filePath: sourceFiles[i].filePath,
    contentType: options.contentType ?? sourceFiles[i].mimeType,
    headers: options.headers,
    onProgress: options.onProgress
      ? (progress) => {
          options.onProgress?.(i, progress);
        }
      : undefined,
  }));

  const uploadResults = await uploadCosFilesBatch(batchCredential, files);

  const attachmentItems = buildAttachmentItems(uploadResults, sourceFiles);

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
  return files.map((file) => {
    const mimeType = getContentTypeByName(file.name);
    if (typeof file.size === 'number' && file.size > MAX_DOCUMENT_UPLOAD_SIZE) {
      throw new Error(`文件不能超过 20MB: ${file.name}`);
    }
    return {
      filePath: file.path,
      originalName: file.name,
      fileSize: file.size,
      mimeType,
    };
  });
};

/**
 * 第一步：选择图片
 * chooseImages 只返回路径，无文件名，前端基于路径构建文件名后提交后端
 */
export const selectImages = async (count = 1): Promise<SelectedMediaFile[]> => {
  const images = await chooseImages(count);
  return Promise.all(
    images.map(async (image, i) => {
      const originalName = buildImageFileName(image.path, i);
      let uploadPath = image.path;
      let uploadSize = image.size;

      if (image.size > IMAGE_COMPRESS_THRESHOLD && canCompressImage(originalName)) {
        try {
          const compressed = await wxCompressImage({
            src: image.path,
            quality: IMAGE_COMPRESS_QUALITY,
          });
          const compressedSize = await getLocalFileSize(compressed.tempFilePath);
          if (compressedSize < image.size) {
            uploadPath = compressed.tempFilePath;
            uploadSize = compressedSize;
          }
        } catch {
          // 压缩能力不可用时保留原图，仍由下面的最终大小限制兜底。
        }
      }

      if (uploadSize > MAX_IMAGE_UPLOAD_SIZE) {
        throw new Error(`图片压缩后仍超过 10MB: ${originalName}`);
      }

      return {
        filePath: uploadPath,
        originalName,
        fileSize: uploadSize,
        mimeType: getContentTypeByName(originalName),
      };
    }),
  );
};

/**
 * 第二步：批量上传（用户确认提交后调用）。
 * 内部流程：获取 STS 凭证 → 后端登记 PENDING objectKey → 批量上传 COS →
 * 返回 attachmentItems，由业务保存事务完成绑定；超时未绑定对象由后端定时清理。
 */
export const uploadFilesToCos = (
  targetType: TargetType,
  sourceFiles: SelectedMediaFile[],
  options?: BatchUploadOptions,
): Promise<AttachmentItemRequest[]> => uploadFiles(targetType, sourceFiles, options);

/**
 * 一站式单文件上传：获取凭证 + 上传到 COS
 * 适用于头像等单文件、不需要写附件记录的场景
 */
export const uploadMediaFileToCos = async (
  credentialRequest: { targetType: TargetType; fileNames: string[] },
  filePath: string,
  options: Omit<CosUploadOptions, 'credential' | 'filePath'> = {},
): Promise<CosUploadResult> => {
  const credential = await mediaService.getUploadCredential(credentialRequest);
  return uploadCosFile({ ...options, credential, filePath });
};
