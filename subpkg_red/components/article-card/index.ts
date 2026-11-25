import defineComponent from '../../../utils/defineComponent';
defineComponent()({
  properties: {
    article: { type: Object, value: null },
    layout: { type: String, value: 'favorite' },
    showCategory: { type: Boolean, value: true },
  },
  data: { coverFailed: false },
  observers: {
    'article.id, article.cover.url': function () {
      this.setData({ coverFailed: false });
    },
  },
  methods: {
    open() {
      this.triggerEvent('open', {
        articleId: (this.properties.article as { id: string } | null)?.id,
      });
    },
    coverError() {
      this.setData({ coverFailed: true });
    },
  },
});
