import defineComponent from '../../../utils/defineComponent';
import { safeLink, type BodyNode } from '../../services/article-body';
defineComponent()({
  properties: { nodes: { type: Array, value: [] } },
  data: { failed: {} },
  pageLifetimes: {
    hide() {
      (this.properties.nodes as BodyNode[])
        .filter((n) => n.type === 'VIDEO')
        .forEach((n) => {
          wx.createVideoContext(`article-video-${n.key.toString()}`, this).pause();
        });
    },
  },
  methods: {
    mediaError(event: WechatMiniprogram.TouchEvent) {
      const key = String(event.currentTarget.dataset.key);
      this.setData({ [`failed.${key}`]: true });
    },
    retryMedia(event: WechatMiniprogram.TouchEvent) {
      const key = String(event.currentTarget.dataset.key);
      this.setData({ [`failed.${key}`]: false });
    },
    preview(event: WechatMiniprogram.TouchEvent) {
      const current = event.currentTarget.dataset.url as string;
      const urls = (this.properties.nodes as BodyNode[])
        .filter((n) => n.type === 'IMAGE')
        .map((n) => n.url);
      if (urls.includes(current)) void wx.previewImage({ current, urls });
    },
    link(event: WechatMiniprogram.TouchEvent) {
      let href: string;
      try {
        href = safeLink(event.currentTarget.dataset.href);
      } catch {
        return;
      }
      wx.showModal({
        title: '正文链接',
        content: '复制链接后可在浏览器中打开',
        confirmText: '复制链接',
        success: (r) => {
          if (r.confirm) void wx.setClipboardData({ data: href });
        },
      });
    },
  },
});
