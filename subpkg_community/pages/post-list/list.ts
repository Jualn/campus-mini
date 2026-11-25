import { POST_CAPABILITIES } from '../../../config/post-capabilities';
import { getPostCategories, getPostTopics } from '../../../services/post-dictionary';
import * as postAction from '../../../actions/post';
import type { PostCategory, PostTopic } from '../../../types/post-contract';
import type { PostCardItem } from '../../../types/business';
import { getErrorMessage } from '../../../utils/notify';
import { eventBus, EVENTS } from '../../../utils/event-bus';
import type { FilterGroup } from '../../../components/filter-bar/index';

interface QaFilterState {
  answerState: string;
  categoryId: string;
  topicId: string;
  categories: PostCategory[];
  categoryCursor: string;
  categoriesLoading: boolean;
  categoriesError: string;
  topics: PostTopic[];
  topicCursor: string;
  topicLoading: boolean;
  topicError: string;
}

const QA_ANSWER_STATES = [
  { id: 'ALL', label: '全部' },
  { id: 'UNANSWERED', label: '待回答' },
  { id: 'ANSWERED', label: '已回答' },
];

function buildQaFilters(state: QaFilterState): FilterGroup[] {
  const categoryOptions = [
    { id: '', label: '全部分类' },
    ...state.categories.map((item) => ({ id: item.id, label: item.name })),
  ];
  const topicOptions = [
    { id: '', label: '全部话题' },
    ...state.topics.map((item) => ({ id: item.id, label: `# ${item.name}` })),
  ];
  let categoryIndex = categoryOptions.findIndex((item) => item.id === state.categoryId);
  if (state.categoryId && categoryIndex < 0) {
    categoryOptions.push({ id: state.categoryId, label: '当前分类' });
    categoryIndex = categoryOptions.length - 1;
  }
  let topicIndex = topicOptions.findIndex((item) => item.id === state.topicId);
  if (state.topicId && topicIndex < 0) {
    topicOptions.push({ id: state.topicId, label: '# 当前话题' });
    topicIndex = topicOptions.length - 1;
  }
  return [
    {
      key: 'state',
      label: '回答状态',
      title: '回答状态',
      options: QA_ANSWER_STATES,
      selectedIndex: Math.max(0, QA_ANSWER_STATES.findIndex((item) => item.id === state.answerState)),
    },
    {
      key: 'category',
      label: '分类',
      title: '问题分类',
      options: categoryOptions,
      selectedIndex: categoryIndex,
      loading: state.categoriesLoading,
      error: state.categoriesError,
      hasMore: !!state.categoryCursor,
    },
    {
      key: 'topic',
      label: '话题',
      title: '相关话题',
      options: topicOptions,
      selectedIndex: topicIndex,
      loading: state.topicLoading,
      error: state.topicError,
      hasMore: !!state.topicCursor,
    },
  ];
}

function pageCopy(postType: string) {
  if (postType === 'NORMAL') {
    return {
      pageTitle: '校园社区',
      pageDescription: '分享校园生活、交流经验，与同学校友保持真实友善的连接。',
      heroMark: '校',
      listTitle: '社区动态',
    };
  }
  if (postType === 'MENTOR_QA') {
    return {
      pageTitle: '校友导师在线答疑',
    };
  }
  return {
    pageTitle: '社区内容',
    pageDescription: '当前内容类型暂未开放，请从已有社区入口继续访问。',
    heroMark: '社',
    listTitle: '内容列表',
  };
}

Page({
  _generation: 0,
  _active: true,
  _failedReset: true,
  _fetchedAt: 0,
  _changeVersion: 0,
  _loadedVersion: 0,
  _onPostChange: null as (() => void) | null,
  data: {
    postType: 'MENTOR_QA',
    pageTitle: '校友导师在线答疑',
    pageDescription: '',
    heroMark: '',
    listTitle: '',
    categoryId: '',
    topicId: '',
    qaFilters: [] as FilterGroup[],
    answerState: 'ALL',
    topics: [] as PostTopic[],
    topicCursor: '',
    topicLoading: false,
    topicError: '',
    categories: [] as PostCategory[],
    categoryCursor: '',
    categoriesLoading: false,
    categoriesError: '',
    posts: [] as PostCardItem[],
    cursor: '',
    hasMore: true,
    loading: false,
    error: '',
    failedReset: true,
    enabled: false,
  },
  onLoad(query: { postType?: string; topicId?: string }) {
    this._active = true;
    this._onPostChange = () => {
      ++this._changeVersion;
    };
    eventBus.on(EVENTS.POST_CREATED, this._onPostChange);
    eventBus.on(EVENTS.POST_UPDATED, this._onPostChange);
    eventBus.on(EVENTS.POST_DELETED, this._onPostChange);
    const postType = query.postType ?? 'MENTOR_QA';
    const enabled =
      POST_CAPABILITIES.organization &&
      (postType === 'NORMAL' ||
        (postType === 'MENTOR_QA' && POST_CAPABILITIES.mentorQa && POST_CAPABILITIES.communityV1));
    const copy = pageCopy(postType);
    this.setData({ postType, topicId: query.topicId ?? '', enabled, ...copy });
    this._syncQaFilters();
    void wx.setNavigationBarTitle({ title: copy.pageTitle });
    if (!enabled) return;
    if (postType === 'MENTOR_QA') {
      void this.loadCategories();
      void this.loadTopics();
    }
    void this.load(true);
  },
  onShow() {
    if (
      this.data.enabled &&
      !this.data.loading &&
      (this._changeVersion !== this._loadedVersion ||
        (this._fetchedAt && Date.now() - this._fetchedAt >= 60000))
    )
      void this.load(true);
  },
  onUnload() {
    this._active = false;
    this._generation += 1;
    if (this._onPostChange) {
      eventBus.off(EVENTS.POST_CREATED, this._onPostChange);
      eventBus.off(EVENTS.POST_UPDATED, this._onPostChange);
      eventBus.off(EVENTS.POST_DELETED, this._onPostChange);
    }
  },
  onPullDownRefresh() {
    void this.load(true).finally(() => wx.stopPullDownRefresh());
  },
  onReachBottom() {
    if (this.data.hasMore && !this.data.error) void this.load(false);
  },
  _syncQaFilters() {
    this.setData({ qaFilters: buildQaFilters(this.data) });
  },
  async loadCategories() {
    if (this.data.categoriesLoading) return;
    this.setData({ categoriesLoading: true, categoriesError: '' });
    this._syncQaFilters();
    try {
      const page = await getPostCategories('MENTOR_QA', this.data.categoryCursor || undefined);
      if (!this._active) return;
      this.setData({
        categories: [
          ...this.data.categories,
          ...page.items.filter((x) => x.status === 'ACTIVE' && x.postTypes.includes('MENTOR_QA')),
        ],
        categoryCursor: page.nextCursor ?? '',
      });
      this._syncQaFilters();
    } catch (error) {
      if (this._active) {
        this.setData({ categoriesError: getErrorMessage(error, '分类加载失败，请重试') });
        this._syncQaFilters();
      }
    } finally {
      if (this._active) {
        this.setData({ categoriesLoading: false });
        this._syncQaFilters();
      }
    }
  },
  onAnswerStateChange(e: WechatMiniprogram.CustomEvent<{ value: number }>) {
    const state = QA_ANSWER_STATES[e.detail.value]?.id;
    if (!state || state === this.data.answerState) return;
    this.setData({ answerState: state, posts: [], cursor: '', hasMore: true });
    this._syncQaFilters();
    void this.load(true);
  },
  async loadTopics() {
    if (this.data.topicLoading) return;
    this.setData({ topicLoading: true, topicError: '' });
    this._syncQaFilters();
    try {
      const page = await getPostTopics(this.data.topicCursor || undefined);
      if (!this._active) return;
      this.setData({
          topics: [...this.data.topics, ...page.items.filter((x) => x.status === 'ACTIVE')],
          topicCursor: page.nextCursor ?? '',
        });
      this._syncQaFilters();
    } catch {
      if (this._active) {
        this.setData({ topicError: '话题加载失败，请重试' });
        this._syncQaFilters();
      }
    } finally {
      if (this._active) {
        this.setData({ topicLoading: false });
        this._syncQaFilters();
      }
    }
  },
  onTopic(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const topicId = e.detail.id;
    if (
      (topicId && !this.data.topics.some((item) => item.id === topicId)) ||
      topicId === this.data.topicId
    )
      return;
    this.setData({ topicId, posts: [], cursor: '', hasMore: true });
    this._syncQaFilters();
    void this.load(true);
  },
  onCategory(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const categoryId = e.detail.id;
    if (
      (categoryId && !this.data.categories.some((item) => item.id === categoryId)) ||
      categoryId === this.data.categoryId
    )
      return;
    this.setData({ categoryId, posts: [], cursor: '', hasMore: true });
    this._syncQaFilters();
    void this.load(true);
  },
  async load(reset: boolean) {
    if (!this.data.enabled || (!reset && (this.data.loading || !this.data.hasMore))) return;
    const generation = reset ? ++this._generation : this._generation;
    const changeVersion = this._changeVersion;
    this.setData({ loading: true, error: '', failedReset: reset });
    try {
      const page = await postAction.fetchPostList({
        postType: this.data.postType === 'NORMAL' ? 'NORMAL' : 'MENTOR_QA',
        categoryId: this.data.categoryId || undefined,
        topicId: this.data.topicId || undefined,
        cursor: reset ? undefined : this.data.cursor || undefined,
        ...(this.data.postType === 'MENTOR_QA'
          ? { answerState: this.data.answerState as 'ALL' | 'UNANSWERED' | 'ANSWERED' }
          : {}),
        pageSize: 20,
      });
      if (!this._active || generation !== this._generation) return;
      if (page.hasMore && (!page.cursor || (!reset && page.cursor === this.data.cursor)))
        throw new Error('服务未返回筛选分页 cursor');
      const ids = new Set(this.data.posts.map((x) => x.id));
      this.setData({
        posts: reset ? page.list : [...this.data.posts, ...page.list.filter((x) => !ids.has(x.id))],
        cursor: page.cursor ?? '',
        hasMore: page.hasMore,
      });
      this._fetchedAt = Date.now();
      this._loadedVersion = changeVersion;
    } catch (error) {
      if (!this._active || generation !== this._generation) return;
      this._failedReset = reset;
      this.setData({ error: getErrorMessage(error, '内容加载失败，请重试') });
    } finally {
      if (this._active && generation === this._generation) this.setData({ loading: false });
    }
  },
  more() {
    void this.load(false);
  },
  refresh() {
    void this.load(true);
  },
  retry() {
    void this.load(this._failedReset);
  },
  open(e: WechatMiniprogram.CustomEvent<{ postId?: string }>) {
    const id = e.detail.postId ?? String(e.currentTarget.dataset.id ?? '');
    if (id)
      void wx.navigateTo({
        url: `/subpkg_community/pages/detail/detail?postId=${encodeURIComponent(id)}`,
      });
  },
  publish() {
    if (!this.data.enabled) return;
    void wx.navigateTo({
      url: `/subpkg_community/pages/post-edit/post-edit?postType=${this.data.postType}`,
    });
  },
});
