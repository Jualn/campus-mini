// components/grid-image/grid-image.js
Component({

  /**
   * 组件的属性列表
   */
  // 根据图片数量动态返回 CSS Grid 类名
  properties: {
    images: {
      type: Array,
      value: []
    }
  },

  /**
   * 组件的初始数据
   */
  data: {

  },

  /**
   * 组件的方法列表
   */
  methods: {
    onPreview(e) {
      const current = e.currentTarget.dataset.current;
      const page = getCurrentPages().pop();
      page.notifyPreviewImage();  // 修改信号，通知开始预览图片
      wx.previewImage({
        current: current, // 当前显示图片的http链接
        urls: this.data.images // 需要预览的图片http链接列表
      });
    }

  }
})