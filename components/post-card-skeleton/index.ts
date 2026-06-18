// components/post-card-skeleton/index.ts
interface PostSkeletonItem {
  index: number;
  showMedia: boolean;
}

Component({
  /**
   * 组件的属性列表
   */
  properties: {
    count: {
      type: Number,
      value: 2,
    },

    /**
     * mediaMode:
     * auto：第一条展示媒体骨架，其余不展示
     * always：每条都展示媒体骨架
     * none：都不展示媒体骨架
     */
    mediaMode: {
      type: String,
      value: 'auto',
    },

    /**
     * 是否显示第三行文本骨架
     */
    showThirdLine: {
      type: Boolean,
      value: false,
    },
  },

  /**
   * 组件的初始数据
   */
  data: {
    skeletonList: [] as PostSkeletonItem[],
  },

  lifetimes: {
    attached() {
      this._updateSkeletonList();
    },
  },

  observers: {
    'count, mediaMode'() {
      this._updateSkeletonList();
    },
  },

  /**
   * 组件的方法列表
   */
  methods: {
    _updateSkeletonList() {
      const count = Math.max(1, this.data.count || 1);
      const mediaMode = this.data.mediaMode;

      this.setData({
        skeletonList: Array.from({ length: count }, (_, index) => ({
          index,
          showMedia: mediaMode === 'always' || (mediaMode === 'auto' && index === 0),
        })),
      });
    },
  },
});
