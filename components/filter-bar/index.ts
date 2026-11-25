export interface FilterOption {
  id: string;
  label: string;
}

export interface FilterGroup {
  key: string;
  label: string;
  title: string;
  options: FilterOption[];
  selectedIndex: number;
  loading?: boolean;
  error?: string;
  hasMore?: boolean;
}

Component({
  options: { styleIsolation: 'isolated' },
  properties: {
    filters: { type: Array, value: [] as FilterGroup[] },
    tone: { type: String, value: 'blue' },
  },
  data: {
    openKey: '',
    panelTitle: '',
    panelOptions: [] as FilterOption[],
    selectedIndex: 0,
    panelLoading: false,
    panelError: '',
    panelHasMore: false,
  },
  observers: {
    filters() {
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
      const key = String(e.currentTarget.dataset.key ?? '');
      if (!this.properties.filters.some((group) => group.key === key)) return;
      if (key === this.data.openKey) this.close();
      else {
        void wx.hideKeyboard();
        this.showPanel(key);
      }
    },
    showPanel(key: string) {
      const group = this.properties.filters.find((item) => item.key === key);
      if (!group) {
        this.close();
        return;
      }
      const selectedIndex = Math.max(
        0,
        Math.min(group.selectedIndex, Math.max(0, group.options.length - 1)),
      );
      this.setData({
        openKey: key,
        panelOptions: group.options,
        selectedIndex,
        panelTitle: group.title,
        panelLoading: !!group.loading,
        panelError: group.error ?? '',
        panelHasMore: !!group.hasMore,
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
      if (changed) this.triggerEvent(key + 'change', { key, value: index, id: option.id });
    },
    onMore() {
      if (!this.data.openKey || this.data.panelLoading) return;
      this.triggerEvent(this.data.openKey + 'more', { key: this.data.openKey });
    },
    close() {
      this.setData({ openKey: '' });
    },
    noop() {
      /* 阻止展开面板时的背景触摸滚动。 */
    },
  },
});
