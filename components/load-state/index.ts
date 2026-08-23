Component({
  options: {
    styleIsolation: 'isolated',
  },

  properties: {
    mode: {
      type: String,
      value: 'error',
    },
    title: {
      type: String,
      value: '',
    },
    description: {
      type: String,
      value: '',
    },
    actionText: {
      type: String,
      value: '',
    },
    compact: {
      type: Boolean,
      value: false,
    },
    /** page：整页；section：局部区域；inline：列表底部。 */
    variant: {
      type: String,
      value: 'page',
    },
    /** 是否按剩余视口高度居中整页状态。 */
    fillViewport: {
      type: Boolean,
      value: false,
    },
    /** 顶部内容、导航或 TabBar 已占用的高度，单位 rpx。 */
    viewportOffset: {
      type: Number,
      value: 0,
    },
  },

  methods: {
    onAction() {
      this.triggerEvent('action');
    },
  },
});
