import type { SceneCode } from '../services/article';

interface ArticlePresentation {
  title: string;
  layout: 'news' | 'feature' | 'resource';
  accent: string;
  surface: string;
  brandNavigation?: boolean;
}

const partyPalette = {
  accent: 'var(--color-brand-red-deep)',
  surface: 'var(--color-brand-red-light)',
  brandNavigation: true,
};

const primaryPalette = {
  accent: 'var(--color-primary)',
  surface: 'var(--color-primary-tint)',
};

export const articleScenes: Record<SceneCode, ArticlePresentation> = {
  PARTY_NEWS: { title: '党建资讯', layout: 'news', ...partyPalette },
  RED_BOOK_CORNER: { title: '红色书角', layout: 'feature', ...partyPalette },
  RED_CLOUD_CLASSROOM: { title: '红色云课堂', layout: 'feature', ...partyPalette },
  COMPETITION_RESOURCES: { title: '竞赛资源库', layout: 'resource', ...primaryPalette },
  E_SAFETY: { title: 'E·安全', layout: 'news', ...primaryPalette },
  LEARNING_MATERIALS: { title: '学习资料', layout: 'resource', ...primaryPalette },
};

export const defaultArticlePresentation: ArticlePresentation = {
  title: '文章详情',
  layout: 'news',
  accent: '',
  surface: '',
};
