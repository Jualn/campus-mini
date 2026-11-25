import { http } from '../../utils/request';
import { id, record, boolean, string, mapArticle, mapPage, type Article } from './article';

const url = (articleId: string) => `/v1/articles/${encodeURIComponent(id(articleId))}/favorite`;
function state(value: unknown, articleId: string) {
  const r = record(value);
  if (id(r.articleId) !== articleId) throw new Error('收藏目标不匹配');
  return boolean(r.favorited);
}
export async function getFavorite(articleId: string) {
  return state(await http.get(url(articleId), undefined, { sensitive: true }), articleId);
}
export async function setFavorite(articleId: string, favorited: boolean) {
  const options = { sensitive: true, retryAuth: false };
  return state(
    await (favorited
      ? http.put(url(articleId), undefined, options)
      : http.del(url(articleId), undefined, options)),
    articleId,
  );
}
export interface FavoriteItem {
  articleId: string;
  favoritedAt: string;
  availability: 'AVAILABLE' | 'UNAVAILABLE';
  article?: Article;
}
export function mapFavorite(value: unknown): FavoriteItem {
  const r = record(value),
    articleId = id(r.articleId),
    favoritedAt = string(r.favoritedAt);
  if (r.availability === 'UNAVAILABLE')
    return { articleId, favoritedAt, availability: 'UNAVAILABLE' };
  if (r.availability !== 'AVAILABLE') throw new Error('收藏可用状态不正确');
  const article = mapArticle(r.article);
  if (article.id !== articleId) throw new Error('收藏目标不匹配');
  return { articleId, favoritedAt, availability: 'AVAILABLE', article };
}
export async function listFavorites(cursor?: string) {
  return mapPage(
    await http.get('/v1/users/me/article-favorites', { cursor, pageSize: 20 }, { sensitive: true }),
    mapFavorite,
  );
}
