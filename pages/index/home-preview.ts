import { ENV } from '../../config/index';
import type { HomeSummary } from './home-data';

export type HomePreviewState = '' | 'empty' | 'partial' | 'error';

const PREVIEW_STATES: readonly Exclude<HomePreviewState, ''>[] = ['empty', 'partial', 'error'];

/** Launch-query state simulation is available only in the WeChat develop build. */
export function resolveHomePreview(value: unknown): HomePreviewState {
  if (ENV !== 'develop' || typeof value !== 'string') return '';
  return (PREVIEW_STATES as readonly string[]).includes(value)
    ? (value as Exclude<HomePreviewState, ''>)
    : '';
}

export function readHomePreview(state: Exclude<HomePreviewState, ''>): Promise<HomeSummary> {
  if (state === 'error') return Promise.reject(new Error('开发态失败状态模拟'));

  return Promise.resolve({
    evaluatedAt: new Date().toISOString(),
    banners: { status: 'EMPTY', items: [] },
    latestArticles: { status: 'EMPTY', items: [] },
    upcomingActivities:
      state === 'partial' ? { status: 'UNAVAILABLE' } : { status: 'EMPTY', items: [] },
  });
}
