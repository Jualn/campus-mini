import definePage from '../../../utils/definePage';
import {
  articleError,
  articleRoute,
  getArticle,
  getLike,
  setLike,
  reportView,
  reportShare,
  listCategories,
  type Article,
} from '../../services/article';
import { mapReadingArticle, type BodyNode } from '../../services/article-body';
import { formatTime, TimeStyle } from '../../../utils/time-util';
import { isAuthError, isHttpError } from '../../../utils/error';
import { ARTICLE_CAPABILITIES } from '../../services/article-capabilities';
import { getFavorite, setFavorite } from '../../services/article-favorite';
import { mapFiles, mapSource, type ArticleFile } from '../../services/article-files';
import { watchCurrentAccount } from '../../../actions/current-user';
import { articleScenes, defaultArticlePresentation } from '../article-presentation';
definePage({
  data: {
    scene: defaultArticlePresentation,
    article: null as Article | null,
    publishedDate: '',
    nodes: [] as BodyNode[],
    hasMoreBody: false,
    loading: false,
    error: '',
    liked: false,
    likeReady: false,
    likePending: false,
    interactionError: '',
    focusCommentId: '',
    contentV1: ARTICLE_CAPABILITIES.contentV1,
    files: [] as ArticleFile[],
    source: null as ReturnType<typeof mapSource>,
    favorited: false,
    favoriteReady: false,
    favoritePending: false,
    favoriteError: '',
  },
  _id: '',
  _alive: true,
  _generation: 0,
  _nodes: [] as BodyNode[],
  _rendered: 0,
  _viewReported: false,
  _sharePending: false,
  _countGeneration: 0,
  _likeGeneration: 0,
  _favoriteGeneration: 0,
  _visible: false,
  _offIdentity: null as (() => void) | null,
  onLoad(options: { articleId?: string; commentId?: string }) {
    this._alive = true;
    this._id =
      typeof options.articleId === 'string' &&
      options.articleId.length > 0 &&
      options.articleId.length <= 128
        ? options.articleId
        : '';
    this.setData({ focusCommentId: options.commentId ?? '' });
    this._offIdentity = watchCurrentAccount(() => {
      ++this._generation;
      this.setData({
        scene: defaultArticlePresentation,
        article: null,
        nodes: [],
        files: [],
        source: null,
        favoriteReady: false,
        favorited: false,
        favoritePending: false,
      });
      if (this._visible) void this.load();
    });
  },
  onShow() {
    this._visible = true;
    void this.load();
  },
  onHide() {
    this._visible = false;
    ++this._generation;
    ++this._countGeneration;
  },
  onUnload() {
    this._visible = false;
    this._offIdentity?.();
    this._alive = false;
    ++this._generation;
    ++this._countGeneration;
  },
  emit() {
    if (this.data.article)
      this.getOpenerEventChannel().emit?.('articleChanged', {
        id: this._id,
        statistics: this.data.article.statistics,
        ...(this.data.likeReady ? { liked: this.data.liked } : {}),
      });
  },
  unavailable() {
    ++this._generation;
    ++this._countGeneration;
    this._nodes = [];
    this._rendered = 0;
    this.setData({
      article: null,
      nodes: [],
      loading: false,
      error: '文章不存在或已下架',
      likeReady: false,
      hasMoreBody: false,
      files: [],
      source: null,
      favoriteReady: false,
    });
    void wx.hideShareMenu();
    this.getOpenerEventChannel().emit?.('articleChanged', { id: this._id, unavailable: true });
  },
  feedback(e: unknown) {
    if (!this._alive) return;
    if (isHttpError(e) && e.statusCode === 404) {
      this.unavailable();
      return;
    }
    this.setData({ interactionError: articleError(e) });
  },
  async loadParentPresentation(parentId: string, generation: number) {
    try {
      const categories = await listCategories();
      if (!this._alive || generation !== this._generation) return;
      const scene = categories.find((category) => category.id === parentId)?.sceneCodes?.[0];
      this.setData({ scene: scene ? articleScenes[scene] : defaultArticlePresentation });
    } catch {
      // The directory only supplies presentation. The published article is independently readable.
    }
  },
  async load() {
    if (!this._id) {
      this.setData({ error: '文章地址无效' });
      return;
    }
    const generation = ++this._generation;
    ++this._countGeneration;
    const rendered = this._rendered;
    this.setData({
      loading: true,
      error: '',
      likeReady: false,
      likePending: false,
      interactionError: '',

      favoriteReady: false,
      favoritePending: false,
      favoriteError: '',
    });
    void wx.hideShareMenu();
    try {
      const raw = await getArticle(this._id);
      const reading = mapReadingArticle(raw);
      const extras = raw as Record<string, unknown>;
      const files = ARTICLE_CAPABILITIES.contentV1 ? mapFiles(extras.attachments) : undefined;
      const source = ARTICLE_CAPABILITIES.contentV1 ? mapSource(extras.source) : null;
      if (!this._alive || generation !== this._generation) return;
      if (reading.article.id !== this._id) throw new Error('文章响应目标不正确');
      this._nodes = reading.nodes;
      this._rendered = Math.min(Math.max(20, rendered), reading.nodes.length);
      const category = reading.article.category;
      const sceneCode = category.sceneCodes?.[0];
      const scene = sceneCode
        ? articleScenes[sceneCode]
        : this.data.article?.category.parentId &&
            this.data.article.category.parentId === category.parentId
          ? this.data.scene
          : defaultArticlePresentation;
      this.setData({
        scene,
        article: reading.article,
        files: files ?? [],
        source,
        publishedDate: formatTime(reading.article.publishedAt, TimeStyle.POST),
        nodes: this._nodes.slice(0, this._rendered),
        hasMoreBody: this._rendered < this._nodes.length,
      });
      if (category.parentId && ARTICLE_CAPABILITIES.contentV1)
        void this.loadParentPresentation(category.parentId, generation);
      void wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
      this.emit();
      void this.loadLike(generation);
      if (ARTICLE_CAPABILITIES.contentV1) void this.loadFavorite(generation);
      if (!this._viewReported) {
        // Explicit POST, one attempt per page instance; never replay an unknown outcome.
        this._viewReported = true;
        void reportView(this._id)
          .then((stats) => {
            if (this._alive && generation === this._generation && this.data.article) {
              this.setData({ 'article.statistics.viewCount': stats.viewCount });
              this.emit();
            }
          })
          .catch((e: unknown) => {
            if (generation === this._generation) this.feedback(e);
          });
      }
    } catch (e) {
      if (this._alive && generation === this._generation) {
        if (isHttpError(e) && e.statusCode === 404) this.unavailable();
        else {
          if (isAuthError(e) || (isHttpError(e) && [401, 403].includes(e.statusCode)))
            this.setData({ article: null, nodes: [], files: [], source: null });
          this.setData({ error: articleError(e) });
        }
      }
    } finally {
      if (this._alive && generation === this._generation) this.setData({ loading: false });
    }
  },
  moreBody() {
    const next = Math.min(this._rendered + 20, this._nodes.length),
      patch: Record<string, unknown> = { hasMoreBody: next < this._nodes.length };
    for (let i = this._rendered; i < next; ++i) patch[`nodes[${i.toString()}]`] = this._nodes[i];
    this._rendered = next;
    this.setData(patch);
  },
  copySource() {
    const url = this.data.source?.url;
    if (!url) return;
    wx.showModal({
      title: '文章来源',
      content: '复制原文链接？',
      success: (r) => {
        if (r.confirm) void wx.setClipboardData({ data: url });
      },
    });
  },
  async loadFavorite(generation: number) {
    if (!ARTICLE_CAPABILITIES.contentV1) return;
    const favoriteGeneration = ++this._favoriteGeneration;
    try {
      const favorited = await getFavorite(this._id);
      if (
        this._alive &&
        generation === this._generation &&
        favoriteGeneration === this._favoriteGeneration
      )
        this.setData({ favorited, favoriteReady: true, favoriteError: '' });
    } catch (e) {
      if (
        this._alive &&
        generation === this._generation &&
        favoriteGeneration === this._favoriteGeneration
      )
        this.setData({ favoriteReady: false, favoriteError: articleError(e) });
    }
  },
  retryFavorite() {
    if (!this.data.favoritePending) void this.loadFavorite(this._generation);
  },
  async favorite() {
    if (
      !ARTICLE_CAPABILITIES.contentV1 ||
      !this.data.favoriteReady ||
      this.data.favoritePending ||
      !this.data.article
    )
      return;
    const generation = this._generation;
    ++this._favoriteGeneration;
    this.setData({ favoritePending: true, favoriteReady: false, favoriteError: '' });
    try {
      const favorited = await setFavorite(this._id, !this.data.favorited);
      if (this._alive && generation === this._generation)
        this.setData({ favorited, favoriteReady: true });
    } catch (e) {
      if (this._alive && generation === this._generation) {
        this.setData({
          favoriteError: `${articleError(e)}；请重新读取收藏状态`,
          favoriteReady: false,
        });
        if (isHttpError(e) && e.statusCode === 404) this.unavailable();
      }
    } finally {
      if (this._alive && generation === this._generation) this.setData({ favoritePending: false });
    }
  },
  onReachBottom() {
    if (this.data.hasMoreBody) this.moreBody();
  },
  async loadLike(generation: number) {
    const likeGeneration = ++this._likeGeneration;
    try {
      const state = await getLike('ARTICLE', this._id);
      if (
        this._alive &&
        generation === this._generation &&
        likeGeneration === this._likeGeneration &&
        this.data.article
      ) {
        this.setData({
          liked: state.liked,
          likeReady: true,
          interactionError: '',
          'article.statistics.likeCount': state.likeCount,
        });
        this.emit();
      }
    } catch (e) {
      if (generation === this._generation && likeGeneration === this._likeGeneration)
        this.feedback(e);
    }
  },
  retryLike() {
    void this.loadLike(this._generation);
  },
  async like() {
    if (!this.data.article || !this.data.likeReady || this.data.likePending) return;
    const generation = this._generation;
    ++this._likeGeneration;
    this.setData({ likePending: true, interactionError: '' });
    try {
      const state = await setLike('ARTICLE', this._id, !this.data.liked);
      if (this._alive && generation === this._generation) {
        this.setData({ liked: state.liked, 'article.statistics.likeCount': state.likeCount });
        this.emit();
      }
    } catch (e) {
      if (generation === this._generation) {
        this.setData({ likeReady: false });
        this.feedback(e);
      }
    } finally {
      if (this._alive && generation === this._generation) this.setData({ likePending: false });
    }
  },
  openComments() {
    wx.createSelectorQuery()
      .select('#reader-navigation')
      .boundingClientRect((rect) => {
        const nav = rect as WechatMiniprogram.BoundingClientRectResult | null;
        void wx.pageScrollTo({
          selector: '#discussion-section',
          offsetTop: -(nav?.height ?? 0),
          duration: 250,
        });
      })
      .exec();
  },
  countChange(event: WechatMiniprogram.CustomEvent<{ delta: number }>) {
    if (!this.data.article) return;
    ++this._countGeneration;
    this.setData({
      'article.statistics.commentCount': Math.max(
        0,
        this.data.article.statistics.commentCount + event.detail.delta,
      ),
    });
    this.emit();
  },
  async reconcileComments() {
    const generation = ++this._countGeneration,
      pageGeneration = this._generation;
    try {
      const { article } = mapReadingArticle(await getArticle(this._id));
      if (
        this._alive &&
        generation === this._countGeneration &&
        pageGeneration === this._generation &&
        this.data.article
      ) {
        this.setData({
          'article.statistics.commentCount': article.statistics.commentCount,
          'article.commentsEnabled': article.commentsEnabled,
        });
        this.emit();
      }
    } catch (e) {
      if (pageGeneration === this._generation && generation === this._countGeneration)
        this.feedback(e);
    }
  },
  commentsDisabled() {
    if (this.data.article) this.setData({ 'article.commentsEnabled': false });
  },
  async share(platform: 'WECHAT_FRIEND' | 'WECHAT_MOMENTS') {
    if (!this.data.article || this._sharePending) return;
    this._sharePending = true;
    const generation = this._generation;
    try {
      const stats = await reportShare(this._id, platform);
      if (this._alive && generation === this._generation) {
        this.setData({ 'article.statistics.shareCount': stats.shareCount });
        this.emit();
      }
    } catch (e) {
      if (generation === this._generation) this.feedback(e);
    } finally {
      this._sharePending = false;
    }
  },
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    const a = this.data.article;
    if (!a)
      return {
        title: '党建资讯',
        path: '/subpkg_red/pages/article-list/list?sceneCode=PARTY_NEWS',
      };
    void this.share('WECHAT_FRIEND');
    return {
      title: a.title,
      path: articleRoute(this._id),
      ...(a.cover ? { imageUrl: a.cover.url } : {}),
    };
  },
  onShareTimeline(): WechatMiniprogram.Page.ICustomTimelineContent {
    const a = this.data.article;
    if (a) void this.share('WECHAT_MOMENTS');
    return {
      title: a?.title ?? '党建资讯',
      query: `articleId=${encodeURIComponent(this._id)}`,
      ...(a?.cover ? { imageUrl: a.cover.url } : {}),
    };
  },
});
