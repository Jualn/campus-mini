// subpkg_community/utils/search-history.ts

import { storage, STORAGE_KEYS } from '../../utils/storage';

const MAX_SEARCH_HISTORY = 8;

/**
 * 获取搜索历史。
 *
 * 用于搜索入口页展示最近搜索。
 */
export function getSearchHistory(): string[] {
  const history = storage.get(STORAGE_KEYS.SEARCH_HISTORY);
  return Array.isArray(history) ? history.slice(0, MAX_SEARCH_HISTORY) : [];
}

/**
 * 添加搜索历史。
 *
 * 规则：
 * - 空关键词不保存
 * - 自动去重
 * - 最新关键词排在最前
 * - 最多保留 8 条
 */
export function addSearchHistory(keyword: string): string[] {
  const kw = (keyword || '').trim();
  if (!kw) return getSearchHistory();

  const oldHistory = getSearchHistory();

  const nextHistory = [kw, ...oldHistory.filter((item) => item !== kw)].slice(
    0,
    MAX_SEARCH_HISTORY,
  );

  storage.set(STORAGE_KEYS.SEARCH_HISTORY, nextHistory);

  return nextHistory;
}

/**
 * 清空搜索历史。
 */
export function clearSearchHistory() {
  storage.remove(STORAGE_KEYS.SEARCH_HISTORY);
}
