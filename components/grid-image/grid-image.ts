// components/grid-image/grid-image.ts

import { wxPreviewImage } from '../../utils/wx-promise';
import defineComponent from '../../utils/defineComponent';

interface GridImagePrivate {
  _imageSignature: string;
}

defineComponent<GridImagePrivate>()({
  properties: {
    images: {
      type: Array,
      value: [] as string[],
      observer(images: string[]) {
        const signature = images.join('\n');
        if (signature === this._imageSignature) return;
        this._imageSignature = signature;
        this.setData({ failedImages: {} });
      },
    },
  },

  data: {
    failedImages: {} as Record<string, boolean>,
  },

  lifetimes: {
    created() {
      this._imageSignature = '';
    },
  },

  methods: {
    onImageError(e: WechatMiniprogram.TouchEvent) {
      const current = String(e.currentTarget.dataset.current ?? '');
      if (!current || this.data.failedImages[current]) return;
      this.setData({ failedImages: { ...this.data.failedImages, [current]: true } });
    },

    onPreview(e: WechatMiniprogram.TouchEvent) {
      const current = e.currentTarget.dataset.current as string;
      this.triggerEvent('preview', { current });
      const page = getCurrentPages().pop() as WechatMiniprogram.Page.TrivialInstance & {
        notifyPreviewImage?: () => void;
      };
      page.notifyPreviewImage?.();
      void wxPreviewImage({
        current,
        urls: this.properties.images,
      });
    },
  },
});
