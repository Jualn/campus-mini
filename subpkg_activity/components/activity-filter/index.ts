interface FilterOption {
  id: string;
  label: string;
}
type FilterKey = 'status' | 'category' | 'scope';

Component({
  options: { styleIsolation: 'isolated' },
  properties: {
    statuses: { type: Array, value: [] as FilterOption[] },
    categories: { type: Array, value: [] as FilterOption[] },
    scopes: { type: Array, value: [] as FilterOption[] },
    activeStatus: { type: String, value: 'ACTIVE' },
    categoryIndex: { type: Number, value: 0 },
    scopeIndex: { type: Number, value: 0 },
  },
  data: {
    openKey: '' as FilterKey | '',
    statusIndex: 0,
    panelTitle: '',
    panelOptions: [] as FilterOption[],
    selectedIndex: 0,
  },
  observers: {
    'statuses, activeStatus'(statuses: FilterOption[], status: string) {
      this.setData({
        statusIndex: Math.max(
          0,
          statuses.findIndex((item) => item.id === status),
        ),
      });
    },
    'statuses, categories, scopes, activeStatus, categoryIndex, scopeIndex'() {
      if (this.data.openKey) this.showPanel(this.data.openKey);
    },
  },
  pageLifetimes: {
    hide() {
      this.close();
    },
  },
  methods: {
    onToggle(e: WechatMiniprogram.TouchEvent) {
      const key: unknown = e.currentTarget.dataset.key;
      if (key !== 'status' && key !== 'category' && key !== 'scope') return;
      if (key === this.data.openKey) this.close();
      else {
        void wx.hideKeyboard();
        this.showPanel(key);
      }
    },
    showPanel(key: FilterKey) {
      const panelOptions =
        key === 'status'
          ? this.properties.statuses
          : key === 'category'
            ? this.properties.categories
            : this.properties.scopes;
      const selectedIndex =
        key === 'status'
          ? Math.max(
              0,
              this.properties.statuses.findIndex(
                (item) => item.id === this.properties.activeStatus,
              ),
            )
          : key === 'category'
            ? this.properties.categoryIndex
            : this.properties.scopeIndex;
      this.setData({
        openKey: key,
        panelOptions,
        selectedIndex,
        panelTitle: key === 'status' ? '活动状态' : key === 'category' ? '活动分类' : '参与学科部',
      });
    },
    onSelect(e: WechatMiniprogram.TouchEvent) {
      const index = Number(e.currentTarget.dataset.index);
      if (!Number.isInteger(index) || index < 0 || index >= this.data.panelOptions.length) return;
      const key = this.data.openKey;
      if (!key) return;
      const option = this.data.panelOptions[index];
      const changed = index !== this.data.selectedIndex;
      this.close();
      if (changed)
        this.triggerEvent(key + 'change', { value: key === 'status' ? option.id : index });
    },
    close() {
      this.setData({ openKey: '' });
    },
    noop() {
      /* 阻止展开面板时的背景触摸滚动。 */
    },
  },
});
