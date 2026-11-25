import { watchCurrentAccount } from '../../../actions/current-user';
import definePage from '../../../utils/definePage';
import {
  listArticles,
  listCategories,
  articleRoute,
  articleError,
  type Article,
  type Category,
  type Statistics,
  type SceneCode,
  isSceneCode,
} from '../../services/article';
import { ARTICLE_CAPABILITIES } from '../../services/article-capabilities';
import { isReadAccessError, isHttpError } from '../../../utils/error';
import { formatTime, TimeStyle } from '../../../utils/time-util';
import { articleScenes } from '../article-presentation';

function getDefaultSceneCode(): SceneCode {
  return 'PARTY_NEWS';
}

definePage({
  data: {
    items: [] as (Article & { liked?: boolean; publishedDate?: string })[],
    categories: [] as Category[],
    sectionOptions: [] as { id: string; name: string }[],
    sectionIndex: 0,
    categoryId: '',
    loading: false,
    error: '',
    categoryError: '',
    hasMore: false,
    sceneCode: getDefaultSceneCode(),
    scene: articleScenes.PARTY_NEWS,
    q: '',
    draftQuery: '',
    scenePending: false,
    sceneEmpty: false,
  },
  _offAccount: null as (() => void) | null,
  _alive: true,
  _generation: 0,
  _cursor: undefined as string | undefined,
  _categoryGeneration: 0,
  _failedMore: false,
  onLoad(options: { categoryId?: string; sceneCode?: string }) {
    this._alive = true;
    this._offAccount = watchCurrentAccount(() => {
      ++this._generation;
      this._cursor = undefined;
      this.setData({ items: [], hasMore: false, loading: false });
    });
    if (options.sceneCode !== undefined && !isSceneCode(options.sceneCode)) {
      this.setData({ error: '内容场景地址无效', scenePending: true });
      return;
    }
    const sceneCode = isSceneCode(options.sceneCode) ? options.sceneCode : getDefaultSceneCode();
    this.setData({
      scene: articleScenes[sceneCode],
      categoryId: options.categoryId ?? '',
      sceneCode,
      scenePending: !ARTICLE_CAPABILITIES.contentV1,
    });
    if (this.data.scenePending) return;
    void this.reload();
  },
  onUnload() {
    this._offAccount?.();
    this._alive = false;
    ++this._generation;
    ++this._categoryGeneration;
  },
  onPullDownRefresh() {
    void this.reload().finally(() => wx.stopPullDownRefresh());
  },
  onReachBottom() {
    if (!this.data.error) void this.more();
  },
  async reload() {
    if (this.data.scenePending) return;
    if (!this.data.categoryId) {
      await Promise.all([this.loadCategories(), this.load()]);
      return;
    }
    // Resolve a linked category before requesting its exact or aggregate scope.
    this.setData({ loading: true, error: '' });
    const generation = ++this._generation;
    const scopeChanged = await this.loadCategories();
    if (this._alive && (generation === this._generation || scopeChanged)) await this.load();
  },
  async loadCategories(): Promise<boolean> {
    if (this.data.scenePending) return false;
    const generation = ++this._categoryGeneration;
    try {
      const categories = await listCategories();
      if (this._alive && generation === this._categoryGeneration) {
        const roots = categories.filter(
          (c) =>
            !c.parentId &&
            c.enabled &&
            c.sceneCodes?.some((scene) => scene === this.data.sceneCode),
        );
        const visible = roots.flatMap((parent) => [
          parent,
          ...categories.filter((c) => c.enabled && c.parentId === parent.id),
        ]);
        const lostCategory =
          !!this.data.categoryId && !visible.some((c) => c.id === this.data.categoryId);
        const scopeResolved =
          !!this.data.categoryId &&
          !this.data.categories.some((c) => c.id === this.data.categoryId);
        const categoryId = lostCategory ? '' : this.data.categoryId;
        const sectionOptions = [
          { id: '', name: '全部' },
          ...visible.filter((category) => category.parentId).map(({ id, name }) => ({ id, name })),
        ];
        this.setData({
          categories: visible,
          sectionOptions,
          sectionIndex: Math.max(
            0,
            sectionOptions.findIndex((section) => section.id === categoryId),
          ),
          categoryError: '',
          sceneEmpty: !roots.length,
          ...(lostCategory ? { categoryId, items: [], hasMore: false } : {}),
        });
        return lostCategory || scopeResolved;
      }
    } catch (e) {
      if (this._alive && generation === this._categoryGeneration)
        this.setData({ categoryError: articleError(e) });
    }
    return false;
  },
  async load(more = false) {
    if (this.data.scenePending) return;
    if (more && (this.data.loading || !this.data.hasMore)) return;
    const generation = ++this._generation;
    this.setData({ loading: true, error: '' });
    try {
      const category = this.data.categories.find((item) => item.id === this.data.categoryId);
      const page = await listArticles(
        this.data.categoryId || undefined,
        more ? this._cursor : undefined,
        ARTICLE_CAPABILITIES.contentV1
          ? {
              sceneCode: this.data.sceneCode,
              ...(this.data.q ? { q: this.data.q } : {}),
              ...(category ? { includeChildren: !category.parentId } : {}),
            }
          : {},
      );
      if (!this._alive || generation !== this._generation) return;
      this._cursor = page.nextCursor;
      const incoming = page.items.map((a) => ({
        ...a,
        publishedDate: formatTime(a.publishedAt, TimeStyle.POST),
      }));
      const seen = new Set(this.data.items.map((a) => a.id));
      this.setData({
        items: more ? [...this.data.items, ...incoming.filter((a) => !seen.has(a.id))] : incoming,
        hasMore: !!page.nextCursor,
      });
    } catch (e) {
      if (this._alive && generation === this._generation) {
        if (more && isHttpError(e) && e.problemType === '/problems/invalid-cursor') {
          this._cursor = undefined;
          void this.reload();
          return;
        }
        if (isReadAccessError(e)) this.setData({ items: [], hasMore: false });
        this._failedMore = more;
        this.setData({ error: articleError(e) });
      }
    } finally {
      if (this._alive && generation === this._generation) this.setData({ loading: false });
    }
  },
  changeCategory(event: WechatMiniprogram.TouchEvent) {
    this.selectCategory(String(event.currentTarget.dataset.id ?? ''));
  },
  pickCategory(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.sectionOptions.length) return;
    this.selectCategory(this.data.sectionOptions[index].id);
  },
  selectCategory(categoryId: string) {
    if (categoryId === this.data.categoryId) return;
    this._cursor = undefined;
    this.setData({
      categoryId,
      sectionIndex: Math.max(
        0,
        this.data.sectionOptions.findIndex((section) => section.id === categoryId),
      ),
      items: [],
      hasMore: false,
    });
    void this.load();
  },
  queryInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ draftQuery: event.detail.value });
  },
  search() {
    if (!ARTICLE_CAPABILITIES.contentV1) return;
    const q = this.data.draftQuery.trim();
    if (q !== this.data.q) {
      this._cursor = undefined;
      this.setData({ q, items: [], hasMore: false });
    }
    void this.load();
  },
  clearSearch() {
    this.setData({ draftQuery: '' });
    if (this.data.q) this.search();
  },
  retry() {
    void this.load(this._failedMore);
  },
  retryCategories() {
    void this.reload();
  },
  more() {
    return this.load(true);
  },
  open(event: WechatMiniprogram.CustomEvent<{ articleId: string }>) {
    const articleId = event.detail.articleId;
    void wx.navigateTo({
      url: articleRoute(articleId),
      events: {
        articleChanged: (patch: {
          id: string;
          statistics?: Statistics;
          liked?: boolean;
          unavailable?: boolean;
        }) => {
          if (!this._alive || patch.id !== articleId) return;
          this.setData({
            items: patch.unavailable
              ? this.data.items.filter((a) => a.id !== patch.id)
              : this.data.items.map((a) =>
                  a.id === patch.id && patch.statistics
                    ? {
                        ...a,
                        statistics: patch.statistics,
                        ...(patch.liked === undefined ? {} : { liked: patch.liked }),
                      }
                    : a,
                ),
          });
        },
      },
    });
  },
});
