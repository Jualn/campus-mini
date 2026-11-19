import { watchCurrentAccount } from '../../../actions/current-user';
import { isReadAccessError } from '../../../utils/error';
import {
  OFFICIAL_CATEGORIES,
  listOfficialContents,
  type OfficialSummary,
} from '../../services/official-content';

interface Data {
  categories: string[];
  categoryIndex: number;
  items: OfficialSummary[];
  loading: boolean;
  error: string;
  hasMore: boolean;
}
interface Custom {
  _offAccount: (() => void) | null;
  _generation: number;
  _cursor?: string;
  _alive: boolean;
  _failedMore: boolean;
  load: (more?: boolean) => Promise<void>;
  changeCategory: (event: WechatMiniprogram.PickerChange) => void;
  retry: () => void;
  more: () => void;
}
Page<Data, Custom>({
  data: {
    categories: OFFICIAL_CATEGORIES.map((item) => item.label),
    categoryIndex: 0,
    items: [],
    loading: false,
    error: '',
    hasMore: false,
  },
  _generation: 0,
  _alive: true,
  _offAccount: null,
  _failedMore: false,
  onLoad(options) {
    this._alive = true;
    this._offAccount = watchCurrentAccount(() => {
      ++this._generation;
      this._cursor = undefined;
      this.setData({
        items: [],
        hasMore: false,
        loading: false,
        error: '登录身份已变化，请重新查询',
      });
    });
    const index = OFFICIAL_CATEGORIES.findIndex((item) => item.value === options.category);
    if (index >= 0) this.setData({ categoryIndex: index });
    void this.load();
  },
  onUnload() {
    this._offAccount?.();
    this._alive = false;
    ++this._generation;
  },
  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },
  onReachBottom() {
    if (!this.data.error) this.more();
  },
  async load(more = false) {
    if (more && (this.data.loading || !this.data.hasMore)) return;
    const generation = ++this._generation;
    const category = OFFICIAL_CATEGORIES[this.data.categoryIndex].value;
    this.setData({ loading: true, error: '' });
    try {
      const page = await listOfficialContents(category, more ? this._cursor : undefined);
      if (!this._alive || generation !== this._generation) return;
      this._cursor = page.nextCursor;
      this.setData({
        items: more ? [...this.data.items, ...page.items] : page.items,
        hasMore: page.hasMore,
      });
    } catch (error) {
      if (this._alive && generation === this._generation) {
        if (isReadAccessError(error)) this.setData({ items: [], hasMore: false });
        this._failedMore = more;
        this.setData({ error: error instanceof Error ? error.message : '加载失败，请重试' });
      }
    } finally {
      if (this._alive && generation === this._generation) this.setData({ loading: false });
    }
  },
  changeCategory(event) {
    const index = Number(event.detail.value);
    if (!Number.isInteger(index) || index < 0 || index >= OFFICIAL_CATEGORIES.length) return;
    if (index === this.data.categoryIndex) return;
    this._cursor = undefined;
    this.setData({ categoryIndex: index, items: [], hasMore: false });
    void this.load();
  },
  retry() {
    void this.load(this._failedMore);
  },
  more() {
    void this.load(true);
  },
});
