import definePage from '../../../utils/definePage';
import { formatTime, parseDate, TimeStyle } from '../../../utils/time-util';
import { getMyPersonBinding, watchPersonBinding } from '../../../services/person-binding';
import { watchCurrentAccount } from '../../../actions/current-user';
import { resolveContentTitle } from '../../../utils/content-presentation';
import {
  listGrowth,
  growthError,
  growthRoute,
  resourceId,
  recordType,
  presentation,
  type RecordType,
  type GrowthRecord,
} from '../../services/growth-record';

type GrowthListItem = GrowthRecord &
  ReturnType<typeof presentation> & {
    postId: string;
    displayTitle: string;
    dateText: string;
    dayText: string;
    monthKey: string;
    monthLabel: string;
    showMonth: boolean;
    mediaText: string;
    mediaIcon: 'preview' | 'file' | 'attachment';
    authorInitial: string;
  };

definePage({
  data: {
    items: [] as GrowthListItem[],
    failedAvatars: {} as Record<string, boolean>,
    loading: false,
    error: '',
    hasMore: false,
    filterIndex: 0,
    filterLabels: ['全部记录', '成长记录', '政治生日'],
    needsBinding: false,
    mine: true,
    scopeKind: 'mine',
    navigationTitle: '我的成长档案',
    scopeLabel: '个人档案',
    scopeTitle: '我的成长档案',
    scopeDescription: '记录学习、实践与主动分享，回看到自己的每一次积累。',
    emptyTitle: '第一条成长记录，从当下开始',
    emptyDescription: '写下一次学习收获、实践经历或政治生日分享，慢慢积累自己的成长足迹。',
  },
  _cursor: undefined as string | undefined,
  _generation: 0,
  _visible: false,
  _valid: true,
  _organizationId: undefined as string | undefined,
  _personId: undefined as string | undefined,
  _failedMore: false,
  _off: null as (() => void) | null,
  _offBinding: null as (() => void) | null,
  onLoad(query: { organizationId?: string; personId?: string; recordType?: string }) {
    try {
      if (query.organizationId) this._organizationId = resourceId(query.organizationId);
      if (query.personId) this._personId = resourceId(query.personId);
      const mine = !this._organizationId && !this._personId;
      const scope = this._organizationId ? 'organization' : this._personId ? 'person' : 'mine';
      const scopeView = {
        mine: {
          scopeLabel: '个人档案',
          navigationTitle: '我的成长档案',
          scopeTitle: '我的成长档案',
          scopeDescription: '记录学习、实践与主动分享，回看到自己的每一次积累。',
          emptyTitle: '第一条成长记录，从当下开始',
          emptyDescription: '写下一次学习收获、实践经历或政治生日分享，慢慢积累自己的成长足迹。',
        },
        organization: {
          scopeLabel: '组织共享',
          navigationTitle: '组织成长档案',
          scopeTitle: '组织成长档案',
          scopeDescription: '沿着时间脉络，阅读当前组织内可以查看的成长分享。',
          emptyTitle: '组织里还没有成长分享',
          emptyDescription: '组织成员发布并可在当前范围阅读的记录，会在这里按时间呈现。',
        },
        person: {
          scopeLabel: '作者档案',
          navigationTitle: '作者成长档案',
          scopeTitle: '作者成长档案',
          scopeDescription: '集中阅读这位作者的成长经历与主动分享。',
          emptyTitle: '这位作者还没有成长记录',
          emptyDescription: '作者发布并可在当前范围阅读的记录，会在这里按时间呈现。',
        },
      }[scope];
      this.setData({
        mine,
        scopeKind: scope,
        ...scopeView,
        filterIndex: recordType(query.recordType) ? (query.recordType === 'GROWTH' ? 1 : 2) : 0,
      });
    } catch (e) {
      this._valid = false;
      this.setData({ error: growthError(e) });
    }
    this._off = watchCurrentAccount(() => {
      this.invalidate();
    });
    this._offBinding = watchPersonBinding(() => {
      this.invalidate();
    });
  },
  invalidate() {
    ++this._generation;
    this._cursor = undefined;
    this.setData({
      items: [],
      failedAvatars: {},
      hasMore: false,
      loading: false,
      needsBinding: false,
      ...(this.data.scopeKind === 'person'
        ? { navigationTitle: '作者成长档案', scopeTitle: '作者成长档案' }
        : {}),
    });
    if (this._visible) void this.load();
  },
  onShow() {
    this._visible = true;
    void this.load();
  },
  onHide() {
    this._visible = false;
    this.invalidate();
  },
  onUnload() {
    this._visible = false;
    ++this._generation;
    this._off?.();
    this._offBinding?.();
  },
  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading && !this.data.error) void this.load(true);
  },
  retry() {
    void this.load(this._failedMore);
  },
  refresh() {
    void this.load();
  },
  more() {
    if (this.data.hasMore && !this.data.loading) void this.load(true);
  },
  selectFilter(e: WechatMiniprogram.TouchEvent) {
    this.applyFilter(Number(e.currentTarget.dataset.index));
  },
  applyFilter(index: number) {
    if (![0, 1, 2].includes(index) || index === this.data.filterIndex) return;
    ++this._generation;
    this._cursor = undefined;
    this.setData({ filterIndex: index, items: [], hasMore: false });
    void this.load();
  },
  emptyAction() {
    if (this.data.filterIndex) this.applyFilter(0);
    else if (this.data.mine && !this.data.needsBinding) this.publish();
  },
  isCurrent(generation: number) {
    return this._visible && generation === this._generation;
  },
  async load(append = false) {
    if (!this._valid || !this._visible || (append && this.data.loading)) return;
    const generation = ++this._generation,
      cursor = append ? this._cursor : undefined;
    this.setData({ loading: true, error: '' });
    try {
      const binding = await getMyPersonBinding();
      if (!this.isCurrent(generation)) return;
      const page = await listGrowth(
        {
          organizationId: this._organizationId,
          personId: this._personId,
          recordType: ([undefined, 'GROWTH', 'POLITICAL_BIRTHDAY'] as (RecordType | undefined)[])[
            this.data.filterIndex
          ],
          cursor,
        },
        this.data.mine,
      );
      if (!this.isCurrent(generation)) return;
      if (page.hasMore && page.nextCursor === cursor) throw new Error('分页已变化，请刷新');
      if (
        this.data.mine &&
        page.items.some((r) => binding.state !== 'BOUND' || r.link.personId !== binding.personId)
      )
        throw new Error('成长档案人员归属不匹配');
      const seen = new Set<string>();
      const items: GrowthListItem[] = [
        ...(append ? this.data.items : []),
        ...page.items.map((r): GrowthListItem => {
          const images = r.media.filter((media) => media.kind === 'IMAGE').length;
          const videos = r.media.length - images;
          return {
            ...r,
            ...presentation(r),
            postId: r.link.postId,
            displayTitle: resolveContentTitle(r.title, r.content),
            dateText: formatTime(r.publishedAt, TimeStyle.FULL),
            dayText: `${parseDate(r.publishedAt).getDate()}日`,
            monthKey: formatTime(r.publishedAt, TimeStyle.YM),
            monthLabel: formatTime(r.publishedAt, TimeStyle.YM),
            showMonth: false,
            mediaText: r.media.length
              ? `${images && videos ? '图片与视频' : videos ? '视频' : '图片'} ${r.media.length} 项`
              : '',
            mediaIcon: videos ? (images ? 'attachment' : 'file') : 'preview',
            authorInitial: r.author.nickname?.trim().slice(0, 1) || '成员',
          };
        }),
      ].filter((r) => {
        if (seen.has(r.link.postId)) return false;
        seen.add(r.link.postId);
        return true;
      });
      items.forEach((item, index) => {
        item.showMonth = index === 0 || item.monthKey !== items[index - 1].monthKey;
      });
      this._cursor = page.nextCursor ?? undefined;
      const authorName = this.data.scopeKind === 'person' ? items[0]?.author.nickname : '';
      this.setData({
        items,
        hasMore: page.hasMore,
        needsBinding: this.data.mine && binding.state === 'UNBOUND',
        ...(authorName
          ? { navigationTitle: `${authorName}的成长档案`, scopeTitle: `${authorName}的成长档案` }
          : {}),
      });
    } catch (e) {
      if (generation === this._generation) {
        this._failedMore = append;
        this.setData({ error: growthError(e) });
      }
    } finally {
      if (generation === this._generation) this.setData({ loading: false });
    }
  },
  open(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (this.data.items.some((r) => r.link.postId === id))
      void wx.navigateTo({ url: growthRoute(id) });
  },
  openOrganization(e: WechatMiniprogram.TouchEvent) {
    const organizationId = e.currentTarget.dataset.organizationId as string;
    if (this.data.items.some((r) => r.link.organizationId === organizationId))
      void wx.navigateTo({
        url: `/subpkg_user/pages/growth-list/list?organizationId=${encodeURIComponent(organizationId)}`,
      });
  },
  openPerson(e: WechatMiniprogram.TouchEvent) {
    const personId = e.currentTarget.dataset.personId as string;
    if (this.data.items.some((r) => r.link.personId === personId))
      void wx.navigateTo({
        url: `/subpkg_user/pages/growth-list/list?personId=${encodeURIComponent(personId)}`,
      });
  },
  onAvatarError(e: WechatMiniprogram.CustomEvent) {
    const url = e.currentTarget.dataset.url as string;
    if (url && !this.data.failedAvatars[url])
      this.setData({ failedAvatars: { ...this.data.failedAvatars, [url]: true } });
  },
  openIdentity() {
    void wx.navigateTo({ url: '/subpkg_user/pages/party-identity/index' });
  },
  publish() {
    const recordType = this.data.filterIndex === 2 ? 'POLITICAL_BIRTHDAY' : 'GROWTH';
    void wx.navigateTo({
      url: `/subpkg_user/pages/growth-edit/edit?recordType=${recordType}`,
    });
  },
});
