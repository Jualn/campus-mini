import { RED_CATEGORIES, RED_STRUCTURE } from '../../data/red-menu';
import type { RedCategory, RedCategoryKey } from '../../types/red';
import { wxNavigateBack, wxSwitchTab } from '../../../utils/wx-promise';

interface PageData {
  statusBarHeight: number;
  navTopGap: number;
  navHeight: number;
  categories: RedCategory[];
  currentCategory: RedCategory | null;
  structureItems: typeof RED_STRUCTURE;
  expandedItemId: string;
  showIntroduction: boolean;
}
interface PageCustom {
  openCategory: (e: WechatMiniprogram.TouchEvent) => void;
  toggleTopic: (e: WechatMiniprogram.TouchEvent) => void;
  toggleIntroduction: () => void;
  onBack: () => void;
}
Page<PageData, PageCustom>({
  data: {
    statusBarHeight: 0,
    navTopGap: 8,
    navHeight: 32,
    categories: RED_CATEGORIES,
    currentCategory: null,
    structureItems: RED_STRUCTURE,
    expandedItemId: '',
    showIntroduction: false,
  },
  onLoad() {
    const sys = wx.getWindowInfo();
    const menu = wx.getMenuButtonBoundingClientRect();
    this.setData({
      statusBarHeight: sys.statusBarHeight || 0,
      navTopGap: menu.width ? Math.max(menu.top - (sys.statusBarHeight || 0), 6) : 8,
      navHeight: menu.height || 32,
    });
  },
  onShareAppMessage() {
    return { title: 'E 网同心', path: '/subpkg_red/pages/index/index' };
  },
  openCategory(e) {
    const { key } = e.currentTarget.dataset as { key?: RedCategoryKey };
    const category = RED_CATEGORIES.find((item) => item.key === key);
    if (!category) return;
    this.setData({ currentCategory: category, expandedItemId: '' });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  toggleTopic(e) {
    const { id } = e.currentTarget.dataset as { id?: string };
    if (!id || !this.data.currentCategory?.items.some((item) => item.id === id)) return;
    this.setData({ expandedItemId: this.data.expandedItemId === id ? '' : id });
  },
  toggleIntroduction() {
    this.setData({ showIntroduction: !this.data.showIntroduction });
  },
  onBack() {
    if (this.data.currentCategory) {
      this.setData({ currentCategory: null, expandedItemId: '' });
      wx.pageScrollTo({ scrollTop: 0, duration: 0 });
      return;
    }
    if (getCurrentPages().length > 1) {
      void wxNavigateBack().catch(() => wxSwitchTab({ url: '/pages/index/index' }));
    } else {
      void wxSwitchTab({ url: '/pages/index/index' });
    }
  },
});
