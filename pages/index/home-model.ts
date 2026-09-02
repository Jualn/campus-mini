import type { PostCardItem } from '../../types/business';

export interface HomeLayout {
  fabBottomDock: number;
  fabMenuBottom: number;
}

export function calculateHomeLayout({
  screenHeight,
  safeAreaBottom,
  windowWidth,
}: {
  screenHeight: number;
  safeAreaBottom: number;
  windowWidth: number;
}): HomeLayout {
  const safeBottom = screenHeight - safeAreaBottom;
  const rpxRatio = windowWidth / 750;
  const tabBarHeight = Math.round(120 * rpxRatio);
  const tabBarBottom = safeBottom + 16;
  const fabBottomDock = tabBarBottom + tabBarHeight + 16;

  return {
    fabBottomDock,
    fabMenuBottom: fabBottomDock + 50 + 16,
  };
}

export function appendUniquePosts(
  current: PostCardItem[],
  incoming: PostCardItem[],
): PostCardItem[] {
  const existingIds = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !existingIds.has(item.id))];
}

export function generatePostTitle(content: string, maxLength = 10): string {
  if (!content) return '无标题';

  const text = content
    .trim()
    .replace(/\r?\n/g, ' ')
    .replace(/<[^>]+>/g, '');
  if (!text) return '无标题';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
