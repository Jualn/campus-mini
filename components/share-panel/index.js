// share-popup.js
Component({
  /**
   * ─── 外部属性 ───────────────────────────────────────────────────
   * shareTitle      String    分享标题（发给好友时用）
   * sharePath       String    分享路径（发给好友时用）
   * shareImagePath  String    canvas 生成的临时图片路径，空则不展示预览区
   */
  properties: {
    shareTitle: {
      type: String,
      value: '分享',
    },
    sharePath: {
      type: String,
      value: '',
    },
    shareImagePath: {
      type: String,
      value: '',
    },
  },

  data: {
    imageLoaded: false,

    sheetTranslateY: 0, // 面板当前位移（px）
    sheetTransition: 'none', // 控制是否有过渡动画
    maskOpacity: 0,
    maskTransition: 'none',
  },

  lifetimes: {
    attached() {
      const info = wx.getWindowInfo()
      this._panelHeight = info.windowHeight * 0.8

      this.setData({
        sheetTranslateY: this._panelHeight,
        sheetTransition: 'none',
        maskOpacity: 0,
        maskTransition: 'none',
      })

      setTimeout(() => {
        this.setData({
          sheetTranslateY: 0,
          sheetTransition: 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
          maskOpacity: 1,
          maskTransition: 'opacity 0.38s ease',
        })
      }, 30)
    },
  },

  methods: {
    noop() {},

    /* ── 关闭 ── */
    onClose() {
      const panelHeight = this._panelHeight || 600
      this.setData({
        sheetTranslateY: panelHeight,
        sheetTransition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
        maskOpacity: 0,
        maskTransition: 'opacity 0.28s ease',
      })

      setTimeout(() => {
        this.triggerEvent('close')
      }, 340)
    },

    /* ── 图片加载回调 ── */
    onImageLoad() {
      this.setData({
        imageLoaded: true
      });
    },
    onImageError(e) {
      console.warn('[share-popup] 预览图加载失败', e);
      this.setData({
        imageLoaded: true
      }); // 也隐藏骨架屏
    },

    /* ── 查看大图 ── */
    onPreviewImage() {
      const {
        shareImagePath
      } = this.properties;
      if (!shareImagePath) return;
      wx.previewImage({
        urls: [shareImagePath],
        current: shareImagePath,
      });
    },

    /* ── 保存图片到相册 ── */
    onSaveImage() {
      const {
        shareImagePath
      } = this.properties;
      if (!shareImagePath) return;

      const doSave = () => {
        wx.saveImageToPhotosAlbum({
          filePath: shareImagePath,
          success: () => {
            wx.showToast({
              title: '已保存到相册',
              icon: 'success'
            });
          },
          fail: (err) => {
            console.error('[share-popup] 保存失败', err);
            wx.showToast({
              title: '保存失败，请重试',
              icon: 'error'
            });
          },
        });
      };

      // 先检查授权
      wx.getSetting({
        success(res) {
          if (res.authSetting['scope.writePhotosAlbum']) {
            doSave();
          } else {
            wx.authorize({
              scope: 'scope.writePhotosAlbum',
              success() {
                doSave();
              },
              fail() {
                // 用户拒绝过，引导去设置页
                wx.showModal({
                  title: '需要相册权限',
                  content: '请在设置中开启相册权限，以保存图片',
                  confirmText: '去设置',
                  success(modal) {
                    if (modal.confirm) wx.openSetting();
                  },
                });
              },
            });
          }
        },
      });
    },

    /* ── 复制链接 ── */
    onCopyLink() {
      const {
        sharePath
      } = this.properties;
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      const route = currentPage ? currentPage.route : '';
      const fullPath = sharePath || `/${route}`;

      wx.setClipboardData({
        data: fullPath,
        success: () => {
          wx.showToast({
            title: '链接已复制',
            icon: 'success'
          });
          this.triggerEvent('share', {
            type: 'copyLink',
            path: fullPath
          });
        },
      });
    },

    // ===================== Handle 条手势关闭 =====================
    onHandleTouchStart(e) {
      this._dragStartY = e.touches[0].clientY
      // 拖动开始，关闭过渡动画（让面板跟手）
      this.setData({
        sheetTransition: 'none',
        maskTransition: 'none'
      })
    },

    onHandleTouchMove(e) {
      const deltaY = e.touches[0].clientY - this._dragStartY
      // 只允许向下拖（向上不让压缩面板）
      if (deltaY <= 0) return
      // ✅ 超过阈值后阻力减小（乘以系数），感觉更轻盈
      // const resistance = deltaY > 120 ? 1.0 : 0.6
      // this.setData({sheetTranslateY: deltaY * resistance})

      const panelHeight = this._panelHeight || 600
      // 视觉上稍微有点阻力感，但不要压太多
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
        this.onClose()
      } else {
        this.setData({
          sheetTranslateY: 0,
          sheetTransition: 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
          maskOpacity: 1,
          maskTransition: 'opacity 0.35s ease',
        })
      }
    },

  },
});