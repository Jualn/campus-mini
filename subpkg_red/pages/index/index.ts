import { DEFAULT_RED_CATEGORY, RED_CATEGORIES, RED_STRUCTURE } from '../../data/red-menu';
import type { RedCategory, RedCategoryKey, RedTopicItem } from '../../types/red';
import { showInfoToast } from '../../../utils/notify';

interface PageData {
  activeCategoryKey: RedCategoryKey;
  categories: RedCategory[];
  currentCategory: RedCategory;
  structureItems: typeof RED_STRUCTURE;
  selectedItem: RedTopicItem | null;
}

interface PageCustom {
  switchCategory: (e: WechatMiniprogram.TouchEvent) => void;
  onTopicTap: (e: WechatMiniprogram.TouchEvent) => void;
}

Page<PageData, PageCustom>({
  data: {
    activeCategoryKey: DEFAULT_RED_CATEGORY.key,
    categories: RED_CATEGORIES,
    currentCategory: DEFAULT_RED_CATEGORY,
    structureItems: RED_STRUCTURE,
    selectedItem: null,
  },

  onShareAppMessage() {
    return {
      title: '先锋 e 站',
      path: '/subpkg_red/pages/index/index',
    };
  },

  switchCategory(e) {
    const { key } = e.currentTarget.dataset as { key?: RedCategoryKey };
    if (!key || key === this.data.activeCategoryKey) return;

    const nextCategory = RED_CATEGORIES.find((category) => category.key === key);
    if (!nextCategory) return;

    this.setData({
      activeCategoryKey: nextCategory.key,
      currentCategory: nextCategory,
      selectedItem: null,
    });
  },

  onTopicTap(e) {
    const { id } = e.currentTarget.dataset as { id?: string };
    if (!id) return;

    const selectedItem = this.data.currentCategory.items.find((item) => item.id === id) ?? null;

    this.setData({
      selectedItem,
    });

    if (selectedItem) {
      showInfoToast(selectedItem.title, { duration: 1200 });
    }
  },
});
