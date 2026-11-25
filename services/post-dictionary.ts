import { http } from '../utils/request';
import { POST_CAPABILITIES } from '../config/post-capabilities';
import type { DictionaryPage, PostCategory, PostTopic, PostType } from '../types/post-contract';

export function getPostCategories(postType: PostType, cursor?: string) {
  if (!POST_CAPABILITIES.organization) return Promise.reject(new Error('分类服务尚未开放'));
  return http.get<DictionaryPage<PostCategory>>('/v1/post-categories', {
    postType,
    status: 'ACTIVE',
    pageSize: 50,
    cursor,
  });
}
export function getPostTopics(cursor?: string) {
  if (!POST_CAPABILITIES.organization) return Promise.reject(new Error('话题服务尚未开放'));
  return http.get<DictionaryPage<PostTopic>>('/v1/topics', {
    status: 'ACTIVE',
    pageSize: 50,
    cursor,
  });
}
