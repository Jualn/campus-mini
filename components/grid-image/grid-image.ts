// components/grid-image/grid-image.ts

import { wxPreviewImage } from '../../utils/wx-promise';
import defineComponent from '../../utils/defineComponent';

defineComponent()({
  /**
   * 组件的属性列表
   */
  // 根据图片数量动态返回 CSS Grid 类名
  properties: {
    images: {
      type: Array,
      value: [],
    },
  },

  /**
   * 组件的初始数据
   */
  data: {},

  /**
   * 组件的方法列表
   */
  methods: {
    onPreview(e: WechatMiniprogram.TouchEvent) {
      const current = e.currentTarget.dataset.current as string;
      this.triggerEvent('preview', { current });
      const page = getCurrentPages().pop() as WechatMiniprogram.Page.TrivialInstance & {
        notifyPreviewImage?: () => void;
      };
      page.notifyPreviewImage?.(); // 修改信号，通知开始预览图片
      void wxPreviewImage({
        current, // 当前显示图片的http链接
        urls: this.properties.images, // 需要预览的图片http链接列表
      });
    },
  },
});
