// components/profile-feed-skeleton/index.ts
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // me：自己主页；user：他人主页
    type: {
      type: String,
      value: 'me',
    },

    statusBarHeight: {
      type: Number,
      value: 0,
    },

    // 下方帖子骨架数量
    postCount: {
      type: Number,
      value: 3,
    },

    // 是否展示下方帖子骨架
    showPosts: {
      type: Boolean,
      value: true,
    },

    // 透传给 post-card-skeleton
    mediaMode: {
      type: String,
      value: 'auto',
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
    onBack() {
      this.triggerEvent('back');
    },
  },
});
