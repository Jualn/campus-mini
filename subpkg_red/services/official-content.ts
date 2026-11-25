import { http as request } from '../../utils/request';

export const OFFICIAL_CATEGORIES = [
  { value: '', label: '全部分类' },
  { value: 'NEWS', label: '党建资讯' },
  { value: 'BRANCH', label: '支部动态' },
  { value: 'NOTICE', label: '通知及宣传' },
  { value: 'E_TOGETHER', label: 'e 网同心' },
  { value: 'INFO_RED', label: '信息红' },
  { value: 'E_SAFETY', label: 'E·安全' },
  { value: 'EXEMPLARY', label: '优秀党员与先进事迹' },
  { value: 'ACHIEVEMENT', label: '党建成果' },
] as const;
export interface OfficialMedia {
  attachmentId: string;
  kind: 'IMAGE' | 'VIDEO';
  name: string;
  url: string;
}
export interface OfficialSummary {
  id: string;
  title: string;
  summary: string;
  publisher: string;
  category: string;
  categoryLabel: string;
  publishStatus: 'PUBLISHED';
  publishedAt?: string;
  publishedDate: string;
}
export interface OfficialDetail extends OfficialSummary {
  body: string;
  images: OfficialMedia[];
  video?: OfficialMedia;
}
export interface OfficialPage {
  items: OfficialSummary[];
  hasMore: boolean;
  nextCursor?: string;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('内容响应格式不正确');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('内容字段格式不正确');
  return value;
}
export function mapSummary(value: unknown): OfficialSummary {
  const row = object(value);
  const category = OFFICIAL_CATEGORIES.find((item) => item.value && item.value === row.category);
  if (!category || row.publishStatus !== 'PUBLISHED') throw new Error('内容当前不可见');
  const publishedAt = row.publishedAt === undefined ? undefined : text(row.publishedAt);
  return {
    id: text(row.id),
    title: text(row.title),
    summary: text(row.summary),
    publisher: text(row.publisher),
    category: category.value,
    categoryLabel: category.label,
    publishStatus: 'PUBLISHED',
    publishedAt,
    publishedDate: publishedAt ? publishedAt.slice(0, 10) : '',
  };
}
function media(value: unknown, kind: OfficialMedia['kind']): OfficialMedia {
  const row = object(value);
  if (row.kind !== kind || !/^https?:\/\//i.test(text(row.url)))
    throw new Error('媒体地址或类型不正确');
  return { attachmentId: text(row.attachmentId), kind, name: text(row.name), url: text(row.url) };
}
export function mapDetail(value: unknown): OfficialDetail {
  const row = object(value);
  if (!Array.isArray(row.images)) throw new Error('图片响应格式不正确');
  return {
    ...mapSummary(value),
    body: text(row.body),
    images: row.images.map((item) => media(item, 'IMAGE')),
    ...(row.video === undefined ? {} : { video: media(row.video, 'VIDEO') }),
  };
}
export function mapPage(value: unknown): OfficialPage {
  const row = object(value);
  if (
    !Array.isArray(row.items) ||
    typeof row.hasMore !== 'boolean' ||
    (row.hasMore && typeof row.nextCursor !== 'string')
  )
    throw new Error('内容分页响应格式不正确');
  return {
    items: row.items.map(mapSummary),
    hasMore: row.hasMore,
    ...(row.nextCursor === undefined ? {} : { nextCursor: text(row.nextCursor) }),
  };
}
export async function listOfficialContents(
  category: string,
  cursor?: string,
): Promise<OfficialPage> {
  return mapPage(
    await request.get(
      '/v1/official-contents',
      { category: category || undefined, cursor, pageSize: 20 },
      { sensitive: true },
    ),
  );
}
export async function getOfficialContent(id: string): Promise<OfficialDetail> {
  return mapDetail(
    await request.get(`/v1/official-contents/${encodeURIComponent(id)}`, undefined, {
      sensitive: true,
    }),
  );
}
