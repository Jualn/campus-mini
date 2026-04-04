// components/in-app-banner/index.js
Component({
  properties: {
    top: {
      type: Number,
      value: 80
    },
  },

  data: {
    visible: false,
    icon: '',
    title: '',
    content: '',
    targetType: '',
    targetId: '',
  },

  lifetimes: {
    attached() {
      // 注册到 app，让 app 可以触发横幅
      const app = getApp()
      app.setBannerHandler((msg) => this._show(msg))
    },
    detached() {
      const app = getApp()
      app.clearBannerHandler()
      if (this._timer) clearTimeout(this._timer)
    },
  },

  methods: {
    _show(msg) {
      this.setData({
        visible: true,
        icon: msg.icon || '🔔',
        title: msg.title || '',
        content: msg.content || '',
        targetType: msg.targetType || '',
        targetId: msg.targetId || '',
      })
      if (this._timer) clearTimeout(this._timer)
      this._timer = setTimeout(() => {
        this.setData({
          visible: false
        })
      }, 4000)
    },

    onTap() {
      if (this._timer) clearTimeout(this._timer)
      this.setData({
        visible: false
      })
      const {
        targetType,
        targetId
      } = this.data
      if (!targetType || targetType === 'none') return
      const routes = {
        activity: `/subpkg_activity/pages/detail/index?id=${targetId}`,
        exam: `/subpkg_exam/pages/detail/index?examId=${targetId}`,
        post: `/subpkg_community/pages/detail/index?id=${targetId}`,
      }
      const url = routes[targetType]
      if (url) wx.navigateTo({
        url
      })
    },

    onClose() {
      if (this._timer) clearTimeout(this._timer)
      this.setData({
        visible: false
      })
    },
  },
})