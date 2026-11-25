import { http } from '../../utils/request';
import type { HomeActivitySource, HomeArticleSource, HomeBannerSource } from './home-model';

export type HomeModule<T> =
  | { status: 'READY'; items: T[] }
  | { status: 'EMPTY'; items: [] }
  | { status: 'UNAVAILABLE'; items?: never };

export interface HomeSummary {
  evaluatedAt: string;
  banners: HomeModule<HomeBannerSource>;
  latestArticles: HomeModule<HomeArticleSource>;
  upcomingActivities: HomeModule<HomeActivitySource>;
}

export function readHomeSummary(): Promise<HomeSummary> {
  return http.get<HomeSummary>('/v1/home/summary', undefined, {
    auth: 'required',
    sensitive: true,
  });
}
