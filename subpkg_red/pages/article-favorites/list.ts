import definePage from '../../../utils/definePage';
import { articleRoute, articleError } from '../../services/article';
import { listFavorites, setFavorite, type FavoriteItem } from '../../services/article-favorite';
import { ARTICLE_CAPABILITIES } from '../../services/article-capabilities';
import { isReadAccessError, isHttpError } from '../../../utils/error';
import { watchCurrentAccount } from '../../../actions/current-user';
import { formatTime, TimeStyle } from '../../../utils/time-util';

type FavoriteView = FavoriteItem & { favoritedDate: string };

definePage({
  data: {
    items: [] as FavoriteView[],
    loading: false,
    error: '',
    hasMore: false,
    pendingId: '',
    enabled: ARTICLE_CAPABILITIES.contentV1,
  },
  _alive: true,
  _generation: 0,
  _operation: 0,
  _visible: false,
  _offIdentity: null as (() => void) | null,
  onLoad() {
    this._offIdentity = watchCurrentAccount(() => {
      ++this._generation;
      ++this._operation;
      this.setData({ items: [], pendingId: '', loading: false, error: '', hasMore: false });
      if (this._visible) void this.load();
    });
  },
  currentOperation(operation: number) {
    return this._alive && operation === this._operation;
  },
  _failedMore: false,
  _cursor: undefined as string | undefined,
  onShow() {
    this._visible = true;
    this._alive = true;
    void this.load();
  },
  onHide() {
    this._visible = false;
    ++this._operation;
    ++this._generation;
    this.setData({ items: [], pendingId: '', loading: false });
  },
  onUnload() {
    this._visible = false;
    this._offIdentity?.();
    ++this._operation;
    this._alive = false;
    ++this._generation;
  },
  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },
  onReachBottom() {
    if (!this.data.error) void this.more();
  },
  async load(more = false) {
    if (!ARTICLE_CAPABILITIES.contentV1 || (more && (this.data.loading || !this.data.hasMore)))
      return;
    const generation = ++this._generation;
    this.setData({ loading: true, error: '' });
    try {
      const page = await listFavorites(more ? this._cursor : undefined);
      if (!this._alive || generation !== this._generation) return;
      this._cursor = page.nextCursor;
      const incoming = page.items.map((item) => ({
        ...item,
        favoritedDate: formatTime(item.favoritedAt, TimeStyle.POST),
        ...(item.article
          ? {
              article: {
                ...item.article,
                publishedDate: formatTime(item.article.publishedAt, TimeStyle.POST),
              },
            }
          : {}),
      }));
      const seen = new Set(this.data.items.map((i) => i.articleId));
      this.setData({
        items: more
          ? [...this.data.items, ...incoming.filter((i) => !seen.has(i.articleId))]
          : incoming,
        hasMore: !!page.nextCursor,
      });
    } catch (e) {
      if (this._alive && generation === this._generation) {
        if (more && isHttpError(e) && e.problemType === '/problems/invalid-cursor') {
          void this.load();
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
  retry() {
    void this.load(this._failedMore);
  },
  refresh() {
    void this.load();
  },
  more() {
    return this.load(true);
  },
  browse() {
    void wx.navigateTo({ url: '/subpkg_red/pages/article-list/list?sceneCode=PARTY_NEWS' });
  },
  open(event: WechatMiniprogram.CustomEvent<{ articleId: string }>) {
    const item = this.data.items.find((i) => i.articleId === event.detail.articleId);
    if (item?.availability === 'AVAILABLE')
      void wx.navigateTo({ url: articleRoute(item.articleId) });
  },
  async remove(event: WechatMiniprogram.TouchEvent) {
    if (!ARTICLE_CAPABILITIES.contentV1 || this.data.pendingId) return;
    const articleId = String(event.currentTarget.dataset.id ?? '');
    if (!this.data.items.some((i) => i.articleId === articleId)) return;
    const operation = ++this._operation;
    this.setData({ pendingId: articleId, error: '' });
    try {
      await setFavorite(articleId, false);
      if (this.currentOperation(operation)) await this.load();
    } catch (e) {
      if (this.currentOperation(operation)) {
        await this.load(); // Recover current relationships; never replay the DELETE automatically.
        if (this.currentOperation(operation))
          this.setData({ error: `${articleError(e)}；已尝试重新读取，请核对当前收藏` });
      }
    } finally {
      if (this.currentOperation(operation)) this.setData({ pendingId: '' });
    }
  },
});
