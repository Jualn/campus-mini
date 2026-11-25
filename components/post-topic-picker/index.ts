import { getPostTopics } from '../../services/post-dictionary';
import type { PostTopic } from '../../types/post-contract';
import { showInfoToast } from '../../utils/notify';

Component({
  properties: { selected: { type: Array, value: [] as PostTopic[] } },
  data: {
    items: [] as PostTopic[],
    selectedIds: {},
    cursor: '',
    loading: false,
    error: '',
  },
  observers: {
    selected(topics: PostTopic[]) {
      this.setData({ selectedIds: Object.fromEntries(topics.map((x) => [x.id, true])) });
    },
  },
  lifetimes: {
    attached() {
      void this.load();
    },
  },
  methods: {
    async load() {
      if (this.data.loading) return;
      this.setData({ loading: true, error: '' });
      try {
        const page = await getPostTopics(this.data.cursor || undefined);
        this.setData({
          items: [...this.data.items, ...page.items.filter((x) => x.status === 'ACTIVE')],
          cursor: page.nextCursor ?? '',
        });
      } catch {
        this.setData({ error: '话题加载失败，点击重试' });
      } finally {
        this.setData({ loading: false });
      }
    },
    toggle(e: WechatMiniprogram.TouchEvent) {
      const item = this.data.items.find((x) => x.id === e.currentTarget.dataset.id);
      if (!item) return;
      const selected = this.properties.selected;
      const exists = selected.some((x) => x.id === item.id);
      if (!exists && selected.length >= 3) {
        showInfoToast('最多选择三个话题');
        return;
      }
      this.triggerEvent('change', {
        topics: exists ? selected.filter((x) => x.id !== item.id) : [...selected, item],
      });
    },
  },
});
