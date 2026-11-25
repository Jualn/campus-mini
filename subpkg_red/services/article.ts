import { parseResponseInteger } from '../utils/response-integer';
// Hand-maintained consumer projection of Contracts article/interaction schemas.
// Keep canonical string targets separate from the legacy Post numeric protocol.
import { http } from '../../utils/request';
import { isHttpError } from '../../utils/error';
export interface Category {
  id: string;
  name: string;
  enabled: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  parentId?: string;
  sceneCodes?: SceneCode[];
}
export const SCENE_CODES = [
  'PARTY_NEWS',
  'RED_BOOK_CORNER',
  'RED_CLOUD_CLASSROOM',
  'COMPETITION_RESOURCES',
  'E_SAFETY',
  'LEARNING_MATERIALS',
] as const;
export type SceneCode = (typeof SCENE_CODES)[number];
export const isSceneCode = (value: unknown): value is SceneCode =>
  typeof value === 'string' && (SCENE_CODES as readonly string[]).includes(value);
export interface Statistics {
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
}
export interface Media {
  attachmentId: string;
  kind: 'IMAGE' | 'VIDEO';
  name: string;
  url: string;
  playback?: {
    contentType: 'video/mp4';
    width?: number;
    height?: number;
    durationSeconds?: number;
  };
}
export type ArticlePublisher =
  | { publisherOrgId: string; publisherNameSnapshot: string; publisher?: never }
  | {
      publisher: { id: string; displayName: string };
      publisherOrgId?: never;
      publisherNameSnapshot?: never;
    };
export type Article = ArticlePublisher & {
  id: string;
  title: string;
  summary: string;
  cover?: Media;
  category: Category;
  // Resolved read-only UI label, not an additional wire field or organization lookup.
  publisherDisplayName: string;
  publishedAt: string;
  commentsEnabled: boolean;
  statistics: Statistics;
};
export interface LikeState {
  liked: boolean;
  likeCount: number;
}
export interface Comment {
  id: string;
  targetType: 'ARTICLE';
  targetId: string;
  content: string;
  author: {
    userId: string;
    nickname: string;
    avatarUrl: string | null;
    isPlatformOperator: boolean;
  };
  createdAt: string;
  parentId?: string;
  replyToCommentId?: string;
  likeCount: number;
  liked: boolean;
  replyCount: number;
}
export interface CursorPage<T> {
  items: T[];
  nextCursor?: string;
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('资讯响应格式不正确');
  return value as Record<string, unknown>;
}
export function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('资讯字段格式不正确');
  return value;
}
export function id(value: unknown): string {
  const result = string(value);
  if (!result || result.length > 128) throw new Error('资讯标识无效');
  return result;
}
export function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('资讯状态格式不正确');
  return value;
}
export function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('资讯统计格式不正确');
  return value;
}
// The deployed Provider serializes Java long interaction counters as decimal strings.
function interactionCount(value: unknown): number {
  return count(parseResponseInteger(value));
}
export function mapStatistics(value: unknown): Statistics {
  const r = record(value);
  return {
    viewCount: interactionCount(r.viewCount),
    likeCount: interactionCount(r.likeCount),
    commentCount: interactionCount(r.commentCount),
    shareCount: interactionCount(r.shareCount),
  };
}
export function mapCategory(value: unknown): Category {
  const r = record(value);
  if (
    r.sceneCodes !== undefined &&
    (!Array.isArray(r.sceneCodes) ||
      r.sceneCodes.some((s) => !isSceneCode(s)) ||
      new Set(r.sceneCodes).size !== r.sceneCodes.length ||
      (r.parentId !== undefined && r.sceneCodes.length > 0))
  )
    throw new Error('场景映射格式不正确');
  return {
    id: id(r.id),
    name: string(r.name),
    enabled: boolean(r.enabled),
    displayOrder: count(r.displayOrder),
    createdAt: string(r.createdAt),
    updatedAt: string(r.updatedAt),
    ...(r.parentId === undefined ? {} : { parentId: id(r.parentId) }),
    ...(r.sceneCodes === undefined ? {} : { sceneCodes: r.sceneCodes as SceneCode[] }),
  };
}
export function mediaUrl(value: unknown): string {
  const url = string(value);
  if (!/^https?:\/\/[^\s/]+(?:\/|$)/i.test(url) || /[<>"\\]/.test(url))
    throw new Error('媒体地址不可用');
  return url;
}
export function mapMedia(value: unknown, kind?: Media['kind']): Media {
  const r = record(value);
  if ((r.kind !== 'IMAGE' && r.kind !== 'VIDEO') || (kind && r.kind !== kind))
    throw new Error('媒体类型不匹配');
  const result: Media = {
    attachmentId: id(r.attachmentId),
    kind: r.kind,
    name: string(r.name),
    url: mediaUrl(r.url),
  };
  if (r.kind === 'VIDEO') {
    const p = record(r.playback);
    const hasMetadata = ['width', 'height', 'durationSeconds'].some((key) => key in p);
    if (
      p.contentType !== 'video/mp4' ||
      (hasMetadata &&
        (!count(p.width) ||
          !count(p.height) ||
          typeof p.durationSeconds !== 'number' ||
          !Number.isFinite(p.durationSeconds) ||
          p.durationSeconds <= 0))
    )
      throw new Error('视频播放信息不正确');
    result.playback = {
      contentType: 'video/mp4',
      ...(hasMetadata
        ? {
            width: p.width as number,
            height: p.height as number,
            durationSeconds: p.durationSeconds as number,
          }
        : {}),
    };
  }
  return result;
}
function publisherName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || Array.from(value).length > 120)
    throw new Error('文章发布署名不可用，请稍后重试');
  return value;
}
function mapPublisher(
  r: Record<string, unknown>,
): ArticlePublisher & { publisherDisplayName: string } {
  // Presence of the new organization ID selects organization mode. An incomplete
  // organization response must not silently acquire a legacy label or default org.
  if (r.publisherOrgId !== undefined) {
    const publisherOrgId = id(r.publisherOrgId);
    const publisherNameSnapshot = publisherName(r.publisherNameSnapshot);
    return { publisherOrgId, publisherNameSnapshot, publisherDisplayName: publisherNameSnapshot };
  }
  const p = record(r.publisher);
  const publisher = { id: id(p.id), displayName: publisherName(p.displayName) };
  // Legacy publisher.organizationId and a snapshot without its organization ID
  // provide no reliable organization binding; preserve only the legacy label.
  return { publisher, publisherDisplayName: publisher.displayName };
}
export function mapArticle(value: unknown): Article {
  const r = record(value);
  return {
    id: id(r.id),
    title: string(r.title),
    summary: string(r.summary),
    category: mapCategory(r.category),
    ...mapPublisher(r),
    publishedAt: string(r.publishedAt),
    commentsEnabled: boolean(r.commentsEnabled),
    statistics: mapStatistics(r.statistics),
    ...(r.cover === undefined ? {} : { cover: mapMedia(r.cover, 'IMAGE') }),
  };
}
export function mapPage<T>(value: unknown, mapper: (row: unknown) => T): CursorPage<T> {
  const r = record(value);
  if (!Array.isArray(r.items) || r.items.length > 50) throw new Error('分页响应不正确');
  const nextCursor = r.nextCursor === undefined ? undefined : string(r.nextCursor);
  if (nextCursor !== undefined && (!nextCursor || nextCursor.length > 1024))
    throw new Error('分页游标不正确');
  return { items: r.items.map(mapper), ...(nextCursor === undefined ? {} : { nextCursor }) };
}
export function mapLike(value: unknown): LikeState {
  const r = record(value);
  return { liked: boolean(r.liked), likeCount: interactionCount(r.likeCount) };
}
export function mapComment(value: unknown, articleId: string): Comment {
  const r = record(value),
    a = record(r.author);
  if (r.targetType !== 'ARTICLE' || r.targetId !== articleId) throw new Error('评论目标不匹配');
  return {
    id: id(r.id),
    targetType: 'ARTICLE',
    targetId: articleId,
    content: string(r.content),
    author: {
      userId: id(a.userId),
      nickname: string(a.nickname),
      avatarUrl: a.avatarUrl === null ? null : string(a.avatarUrl),
      isPlatformOperator: boolean(a.isPlatformOperator),
    },
    createdAt: string(r.createdAt),
    likeCount: interactionCount(r.likeCount),
    liked: boolean(r.liked),
    replyCount: interactionCount(r.replyCount),
    ...(r.parentId === undefined ? {} : { parentId: id(r.parentId) }),
    ...(r.replyToCommentId === undefined ? {} : { replyToCommentId: id(r.replyToCommentId) }),
  };
}
const readOptions = { sensitive: true };
const writeOptions = { sensitive: true, retryAuth: false };
const target = (type: 'ARTICLE' | 'COMMENT', targetId: string) =>
  `/v1/interaction-targets/${type}/${encodeURIComponent(id(targetId))}`;
export const articleRoute = (articleId: string) =>
  `/subpkg_red/pages/article-detail/detail?articleId=${encodeURIComponent(id(articleId))}`;
export async function listArticles(
  categoryId?: string,
  cursor?: string,
  filters: { sceneCode?: SceneCode; q?: string; includeChildren?: boolean } = {},
) {
  return mapPage(
    await http.get('/v1/articles', { categoryId, cursor, pageSize: 20, ...filters }, readOptions),
    mapArticle,
  );
}
export async function listCategories(): Promise<Category[]> {
  const r = record(await http.get('/v1/article-categories', undefined, readOptions));
  if (!Array.isArray(r.items) || r.items.length > 100) throw new Error('分类响应不正确');
  return r.items.map(mapCategory).filter((c) => c.enabled);
}
export const getArticle = (articleId: string): Promise<unknown> =>
  http.get(`/v1/articles/${encodeURIComponent(id(articleId))}`, undefined, readOptions);
export async function getLike(type: 'ARTICLE' | 'COMMENT', targetId: string) {
  return mapLike(await http.get(`${target(type, targetId)}/like`, undefined, readOptions));
}
export async function setLike(type: 'ARTICLE' | 'COMMENT', targetId: string, liked: boolean) {
  const url = `${target(type, targetId)}/like`;
  return mapLike(
    await (liked ? http.put(url, undefined, writeOptions) : http.del(url, undefined, writeOptions)),
  );
}
export async function listComments(articleId: string, parentId?: string, cursor?: string) {
  return mapPage(
    await http.get(
      `${target('ARTICLE', articleId)}/comments`,
      { parentId, cursor, pageSize: 20 },
      readOptions,
    ),
    (r) => mapComment(r, articleId),
  );
}
export async function createComment(
  articleId: string,
  content: string,
  parentId?: string,
  replyToCommentId?: string,
) {
  return mapComment(
    await http.post(
      `${target('ARTICLE', articleId)}/comments`,
      { content, parentId, replyToCommentId },
      writeOptions,
    ),
    articleId,
  );
}
export const deleteComment = (articleId: string, commentId: string) =>
  http.del(
    `${target('ARTICLE', articleId)}/comments/${encodeURIComponent(id(commentId))}`,
    undefined,
    writeOptions,
  );
export async function reportView(articleId: string) {
  return mapStatistics(
    await http.post(`${target('ARTICLE', articleId)}/views`, undefined, writeOptions),
  );
}
export async function reportShare(articleId: string, platform: 'WECHAT_FRIEND' | 'WECHAT_MOMENTS') {
  return mapStatistics(
    await http.post(`${target('ARTICLE', articleId)}/shares`, { platform }, writeOptions),
  );
}
export function articleError(error: unknown): string {
  if (isHttpError(error)) {
    if (error.statusCode === 404) return '文章不存在或已下架';
    if (error.problemType === '/problems/comments-disabled') return '评论已关闭';
    if (error.problemType === '/problems/invalid-cursor') return '列表已变化，请刷新后重试';
    return error.userMessage;
  }
  const e = error as { userMessage?: string; message?: string } | null;
  return e?.userMessage ?? e?.message ?? '加载失败，请重试';
}
