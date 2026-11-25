import { parseResponseInteger } from '../utils/response-integer';
import { record, id, string, mediaUrl } from './article';
import { safeLink } from './article-body';
export interface ArticleFile {
  attachmentId: string;
  name: string;
  url: string;
  sizeBytes: number;
  fileType: 'pdf' | 'doc' | 'docx';
}
export function mapFiles(value: unknown): ArticleFile[] | undefined {
  if (value === undefined) return undefined; // Old Provider is not evidence of an empty file set.
  if (!Array.isArray(value) || value.length > 9) throw new Error('文件列表不正确');
  return value.map((entry) => {
    const r = record(entry);
    const fileType =
      r.kind === 'PDF' && r.contentType === 'application/pdf'
        ? 'pdf'
        : r.kind === 'WORD' && r.contentType === 'application/msword'
          ? 'doc'
          : r.kind === 'WORD' &&
              r.contentType ===
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            ? 'docx'
            : undefined;
    const sizeBytes = parseResponseInteger(r.sizeBytes);
    if (!fileType || !sizeBytes || sizeBytes > 10485760) throw new Error('文件类型或大小不正确');
    return {
      attachmentId: id(r.attachmentId),
      name: string(r.name),
      url: mediaUrl(r.url),
      sizeBytes,
      fileType,
    };
  });
}
export function mapSource(value: unknown): { name: string; url?: string } | null {
  if (value === undefined) return null;
  const r = record(value),
    name = string(r.name);
  if (!name.trim() || Array.from(name).length > 120) throw new Error('文章来源不正确');
  return { name, ...(r.url === undefined ? {} : { url: safeLink(r.url) }) };
}
