// Consumer projection: growth-record-v1-r1 (canonical definitions remain in Contracts).
import { http, httpWithMeta } from '../../utils/request';
import { assertStrongEtag } from '../../utils/post-policy';
import { isHttpError } from '../../utils/error';
import { getErrorMessage } from '../../utils/notify';
import type { PostCategory, PostTopic } from '../../types/post-contract';
export type RecordType = 'GROWTH' | 'POLITICAL_BIRTHDAY';
export type Safety = 'CHECKING' | 'PASSED' | 'REVIEW_REQUIRED' | 'REJECTED' | 'CHECK_FAILED';
export type GrowthAction = 'EDIT' | 'DELETE' | 'COMMENT' | 'LIKE' | 'FAVORITE' | 'REPORT' | 'SHARE';
export interface GrowthMedia {
  mediaId: string;
  kind: 'IMAGE' | 'VIDEO';
  originalName: string;
  contentType: string;
  sizeBytes: number;
  safety: Safety;
  contentUrl: string;
  unboundExpiresAt?: string;
}
export interface GrowthLink {
  postId: string;
  personId: string;
  organizationId: string;
  recordType: RecordType;
}
export interface GrowthRecord {
  link: GrowthLink;
  author: { id: string; nickname?: string; avatarUrl?: string };
  title: string | null;
  content: string;
  media: GrowthMedia[];
  publishedAt: string;
  category: PostCategory | null;
  topics: PostTopic[];
  lifecycle: {
    acceptedAt: string;
    submissionVersion: string;
    effectiveVersion: string | null;
    visibility: 'ORGANIZATION' | 'TEMPORARY_ORGANIZATION' | 'PRIVATE';
    safety: Safety;
    authorDeleted: boolean;
    adminHidden: boolean;
    temporaryVisibleUntil?: string;
  };
  availableActions: GrowthAction[];
  likeCount: number;
  commentCount: number;
  viewCount: number;
  shareCount: number;
}
export interface GrowthEditable extends GrowthLink {
  title: string | null;
  content: string;
  mediaIds: string[];
  categoryId: string | null;
  topicIds: string[];
}
export interface GrowthWrite {
  title?: string | null;
  content: string;
  mediaIds: string[];
}
export interface GrowthCreate extends GrowthWrite {
  organizationId: string;
  recordType: RecordType;
}
export interface PublishContext {
  personId?: string;
  evaluatedAt: string;
  organizations: { organizationId: string; name: string; allowedRecordTypes: RecordType[] }[];
}
export interface GrowthPage {
  items: GrowthRecord[];
  hasMore: boolean;
  nextCursor: string | null;
}
const options = { auth: 'required' as const, sensitive: true, retryAuth: false };
export function resourceId(v: unknown): string {
  if (typeof v !== 'string' || !v.trim() || v.length > 128 || /[\r\n]/.test(v))
    throw new Error('成长记录标识无效');
  return v;
}
export const recordType = (v: unknown): v is RecordType =>
  v === 'GROWTH' || v === 'POLITICAL_BIRTHDAY';
export function readRecordType(value: unknown): RecordType {
  if (!recordType(value)) throw new Error('未知成长类型');
  return value;
}
const id = (v: string) => encodeURIComponent(resourceId(v));
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('成长服务响应无效');
  return v as Record<string, unknown>;
};
const safety = (v: unknown) =>
  ['CHECKING', 'PASSED', 'REVIEW_REQUIRED', 'REJECTED', 'CHECK_FAILED'].includes(String(v));
export function readMedia(value: unknown): GrowthMedia {
  const r = object(value);
  resourceId(r.mediaId);
  if (
    !['IMAGE', 'VIDEO'].includes(String(r.kind)) ||
    typeof r.originalName !== 'string' ||
    typeof r.contentUrl !== 'string' ||
    !safety(r.safety) ||
    typeof r.sizeBytes !== 'number' ||
    !Number.isSafeInteger(r.sizeBytes) ||
    r.sizeBytes < 1 ||
    r.sizeBytes > (r.kind === 'VIDEO' ? 209715200 : 10485760) ||
    !(r.kind === 'VIDEO'
      ? r.contentType === 'video/mp4'
      : ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(String(r.contentType)))
  )
    throw new Error('成长媒体响应无效');
  return r as unknown as GrowthMedia;
}
function readLink(r: Record<string, unknown>) {
  resourceId(r.postId);
  resourceId(r.personId);
  resourceId(r.organizationId);
  readRecordType(r.recordType);
}
export function readRecord(value: unknown): GrowthRecord {
  const r = object(value),
    link = object(r.link),
    lifecycle = object(r.lifecycle);
  readLink(link);
  resourceId(object(r.author).id);
  if (
    !(r.title === null || typeof r.title === 'string') ||
    typeof r.content !== 'string' ||
    typeof r.publishedAt !== 'string' ||
    !Number.isFinite(Date.parse(r.publishedAt)) ||
    !Array.isArray(r.media) ||
    r.media.length > 9 ||
    !Array.isArray(r.availableActions) ||
    r.availableActions.some(
      (a) =>
        !['EDIT', 'DELETE', 'COMMENT', 'LIKE', 'FAVORITE', 'REPORT', 'SHARE'].includes(String(a)),
    ) ||
    !['ORGANIZATION', 'TEMPORARY_ORGANIZATION', 'PRIVATE'].includes(String(lifecycle.visibility)) ||
    !safety(lifecycle.safety) ||
    typeof lifecycle.adminHidden !== 'boolean' ||
    lifecycle.authorDeleted !== false ||
    (lifecycle.adminHidden && lifecycle.visibility !== 'PRIVATE') ||
    (lifecycle.visibility === 'TEMPORARY_ORGANIZATION' &&
      (typeof lifecycle.temporaryVisibleUntil !== 'string' ||
        !Number.isFinite(Date.parse(lifecycle.temporaryVisibleUntil)))) ||
    ['likeCount', 'commentCount', 'viewCount', 'shareCount'].some(
      (k) => typeof r[k] !== 'number' || !Number.isSafeInteger(r[k]) || r[k] < 0,
    )
  )
    throw new Error('成长记录响应无效');
  r.media.forEach(readMedia);
  return r as unknown as GrowthRecord;
}
export function readEditable(value: unknown): GrowthEditable {
  const r = object(value);
  readLink(r);
  if (
    !(r.title === null || typeof r.title === 'string') ||
    typeof r.content !== 'string' ||
    !Array.isArray(r.mediaIds) ||
    r.mediaIds.length > 9 ||
    !Array.isArray(r.topicIds)
  )
    throw new Error('成长编辑响应无效');
  r.mediaIds.forEach(resourceId);
  return r as unknown as GrowthEditable;
}
export const growthRoute = (postId: string) =>
  `/subpkg_user/pages/growth-detail/detail?postId=${id(postId)}`;
export async function publishingContext(): Promise<PublishContext> {
  const r = object(await http.get('/v1/users/me/growth-publishing-context', undefined, options));
  if (typeof r.evaluatedAt !== 'string' || !Array.isArray(r.organizations))
    throw new Error('发布选项不可确认');
  if (r.personId !== undefined) resourceId(r.personId);
  r.organizations.forEach((v) => {
    const o = object(v);
    resourceId(o.organizationId);
    if (
      typeof o.name !== 'string' ||
      !Array.isArray(o.allowedRecordTypes) ||
      !o.allowedRecordTypes.every(recordType)
    )
      throw new Error('发布选项不可确认');
  });
  if (!r.personId && r.organizations.length) throw new Error('发布人员不可确认');
  return r as unknown as PublishContext;
}
export async function listGrowth(
  query: {
    organizationId?: string;
    personId?: string;
    recordType?: RecordType;
    cursor?: string;
  } = {},
  mine = true,
): Promise<GrowthPage> {
  if (!mine && !query.organizationId && !query.personId) throw new Error('请选择组织或人员范围');
  const r = object(
    await http.get(
      mine ? '/v1/users/me/growth-records' : '/v1/growth-records',
      { ...query, pageSize: 20 },
      options,
    ),
  );
  if (
    !Array.isArray(r.items) ||
    typeof r.hasMore !== 'boolean' ||
    (r.hasMore
      ? typeof r.nextCursor !== 'string' || !r.nextCursor || r.nextCursor.length > 2048
      : r.nextCursor !== null)
  )
    throw new Error('成长分页响应无效');
  const items = r.items.map(readRecord);
  if (
    items.some(
      (item) =>
        (query.organizationId !== undefined && item.link.organizationId !== query.organizationId) ||
        (query.personId !== undefined && item.link.personId !== query.personId) ||
        (query.recordType !== undefined && item.link.recordType !== query.recordType),
    )
  )
    throw new Error('成长列表筛选不匹配');
  return { items, hasMore: r.hasMore, nextCursor: r.nextCursor as string | null };
}
export async function getGrowth(postId: string) {
  const r = readRecord(await http.get(`/v1/growth-records/${id(postId)}`, undefined, options));
  if (r.link.postId !== postId) throw new Error('成长目标不匹配');
  return r;
}
export async function editableGrowth(postId: string) {
  const r = await httpWithMeta.get(`/v1/post/${id(postId)}`, { view: 'edit' }, options);
  const post = readEditable(r.data);
  if (post.postId !== postId) throw new Error('成长编辑目标不匹配');
  return { post, etag: assertStrongEtag(r.headers.etag) };
}
export async function createGrowth(payload: GrowthCreate, key: string) {
  return readRecord(
    await http.post('/v1/growth-records', payload, {
      ...options,
      headers: { 'Idempotency-Key': key },
    }),
  );
}
export async function editGrowth(postId: string, payload: GrowthWrite, etag: string) {
  const r = await httpWithMeta.post(`/v1/post/${id(postId)}:edit`, payload, {
    ...options,
    headers: { 'If-Match': assertStrongEtag(etag) },
  });
  const post = readEditable(r.data);
  if (post.postId !== postId) throw new Error('成长编辑目标不匹配');
  return { post, etag: assertStrongEtag(r.headers.etag) };
}
export const deleteGrowth = (postId: string) =>
  http.del(`/v1/post/${id(postId)}`, undefined, options);
export function growthError(e: unknown) {
  if (isHttpError(e)) {
    if (e.statusCode === 403) return '当前没有这项操作的权限，请刷新后重试';
    if (e.statusCode === 404) return '记录不存在或当前不可访问';
    if (e.statusCode === 412) return '内容已变化，请保留草稿并重新读取后再编辑';
    if (e.statusCode === 503) return '身份或媒体检查服务暂不可用，请稍后重试';
  }
  return getErrorMessage(e);
}
export function presentation(r: GrowthRecord) {
  return {
    typeLabel: r.link.recordType === 'GROWTH' ? '成长记录' : '政治生日',
    statusLabel: r.lifecycle.adminHidden
      ? '已隐藏 · 仅本人历史可读'
      : r.lifecycle.visibility === 'PRIVATE'
        ? '仅本人可读'
        : r.lifecycle.visibility === 'TEMPORARY_ORGANIZATION'
          ? '组织内临时可见'
          : '组织内可见',
    safetyLabel: {
      CHECKING: '检查中',
      PASSED: '检查通过',
      REVIEW_REQUIRED: '待核实',
      REJECTED: '检查未通过',
      CHECK_FAILED: '检查失败',
    }[r.lifecycle.safety],
  };
}

export async function toggleGrowthLike(postId: string) {
  const payload = { targetType: 'POST', targetId: resourceId(postId) };
  const state = object(await http.get('/v1/interact/liked', payload, options));
  if (typeof state.liked !== 'boolean') throw new Error('点赞状态不可确认');
  return state.liked
    ? http.del('/v1/interact/like', payload, options)
    : http.post('/v1/interact/like', payload, options);
}

export async function getGrowthLikeState(postId: string): Promise<boolean> {
  const state = object(
    await http.get(
      '/v1/interact/liked',
      { targetType: 'POST', targetId: resourceId(postId) },
      options,
    ),
  );
  if (typeof state.liked !== 'boolean') throw new Error('点赞状态暂不可确认，请刷新重试');
  return state.liked;
}
