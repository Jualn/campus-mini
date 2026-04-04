// components/post-edit-panel/index.js

Component({
  options: {
    multipleSlots: true
  },

  properties: {
    show: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    content: '',
    images: [],
    canSubmit: false,

    sheetTranslateY: 0,
    sheetTransition: 'none',
    maskOpacity: 0,
    maskTransition: 'none',

    focused: false,
  },

  lifetimes: {
    // 每次 show=true 时父页面 wx:if 重新挂载组件，attached 必然触发
    attached() {
      const sys = wx.getWindowInfo()
      this._panelHeight = sys.windowHeight * 0.9

      // 初始状态：面板在屏幕下方，遮罩透明
      this.setData({
        sheetTranslateY: this._panelHeight,
        sheetTransition: 'none',
        maskOpacity: 0,
        maskTransition: 'none',
      })

      // 下一帧触发入场动画（确保初始 setData 已渲染）
      setTimeout(() => {
        this.setData({
          sheetTranslateY: 0,
          sheetTransition: 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
          maskOpacity: 1,
          maskTransition: 'opacity 0.38s ease',
          focused: true,
        })
      }, 30)
    },

    detached() {
      this.setData({
        content: '',
        images: [],
        canSubmit: false,
        focused: false,
      })
    },
  },

  methods: {
    noop() {},
    // ── 出场动画，结束后通知父页面关掉 wx:if ──────────
    _dismiss() {
      const panelHeight = this._panelHeight || 600
      this.setData({
        sheetTranslateY: panelHeight,
        sheetTransition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
        maskOpacity: 0,
        maskTransition: 'opacity 0.28s ease',
        focused: false,
      })
      // 动画结束后触发 close，父页面把 show 设 false，wx:if 卸载组件
      setTimeout(() => {
        this.triggerEvent('close')
      }, 340)
    },

    // ── 拖拽：handle 条 + nav ──────────────────────────
    onHandleTouchStart(e) {
      this._dragStartY = e.touches[0].clientY
      this.setData({
        sheetTransition: 'none',
        maskTransition: 'none'
      })
    },

    onHandleTouchMove(e) {
      const deltaY = e.touches[0].clientY - this._dragStartY
      if (deltaY <= 0) return
      const panelHeight = this._panelHeight || 600
      const visual = deltaY * 0.88
      const maskOpacity = Math.max(0, 1 - visual / panelHeight)
      this.setData({
        sheetTranslateY: visual,
        maskOpacity
      })
    },

    onHandleTouchEnd(e) {
      const deltaY = e.changedTouches[0].clientY - this._dragStartY
      if (deltaY > 80) {
        this._dismiss()
      } else {
        this.setData({
          sheetTranslateY: 0,
          sheetTransition: 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
          maskOpacity: 1,
          maskTransition: 'opacity 0.35s ease',
        })
      }
    },

    // ── 关闭（取消 / 遮罩点击）───────────────────────
    onClose() {
      if (this.data.content || this.data.images.length) {
        wx.showModal({
          title: '放弃编辑？',
          content: '内容尚未发布，确认放弃？',
          confirmText: '放弃',
          confirmColor: '#FF3B30',
          cancelText: '继续编辑',
          success: (res) => {
            if (res.confirm) this._dismiss()
          },
        })
      } else {
        this._dismiss()
      }
    },

    // ── 正文 ──────────────────────────────────────────
    onContentInput(e) {
      const content = e.detail.value
      this.setData({
        content,
        canSubmit: content.trim().length > 0
      })
    },

    // ── 图片 ──────────────────────────────────────────
    onAddImage() {
      const remain = 9 - this.data.images.length
      if (remain <= 0) return
      wx.chooseMedia({
        count: remain,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const newImgs = res.tempFiles.map(f => f.tempFilePath)
          this.setData({
            images: [...this.data.images, ...newImgs]
          })
        },
      })
    },

    onRemoveImage(e) {
      const images = this.data.images.filter((_, i) => i !== e.currentTarget.dataset.index)
      this.setData({
        images
      })
    },

    // ── 发布 ──────────────────────────────────────────
    onSubmit() {
      if (!this.data.canSubmit) return
      const {
        content,
        images
      } = this.data
      wx.showLoading({
        title: '发布中...'
      })
      setTimeout(() => {
        wx.hideLoading()
        wx.showToast({
          title: '发布成功',
          icon: 'success'
        })
        this.triggerEvent('submit', {
          content,
          images
        })
        this._dismiss()
      }, 600)
    },
  },
})