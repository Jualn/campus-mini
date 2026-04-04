// components/post-card/index.js
/**
 * post-card 组件
 *
 * Properties:
 *   post  Object  帖子数据
 *     - id, nickname, avatar, content, images
 *     - commentCount, likeCount, isLiked, createdAt
 *
 * Events:
 *   tap     → 点击卡片跳详情，{ postId }
 *   like    → 点赞/取消，{ postId, isLiked }
 *   comment → 打开评论，{ postId, commentCount }
 *   more    → 点击 ···，{ postId }
 */

const {
  getAvatarInfo
} = require('../../utils/avatar')

Component({
  properties: {
    post: {
      type: Object,
      value: {},
      observer(newVal) {
        if (!newVal) return
        const {
          char,
          bg
        } = getAvatarInfo(newVal.nickname)
        this.setData({
          _avatarUrl: newVal.avatar || '',
          _avatarChar: char,
          _avatarBg: bg,
        })

        // 确保 images 始终是数组
        if (newVal && !Array.isArray(newVal.images)) {
          this.setData({
            'post.images': []
          })
        }
      }
    },
  },
  data: {
    _avatarUrl: '',
    _avatarChar: '',
    _avatarBg: '',

    showSharePanel: false,
    shareGenerating: false,
    shareTempPath: '',
    canvasWidth: 500,
    canvasHeight: 400,
  },
  methods: {
    noop(){},
    onTapCard() {
      this.triggerEvent('posttap', {
        postId: this.properties.post.id
      })
    },

    onTapAvatar() {
      this.triggerEvent('user', {
        userId: this.properties.post.userId
      })
    },

    onLike() {
      const {
        id,
        isLiked
      } = this.properties.post
      this.triggerEvent('like', {
        postId: id,
        isLiked
      })
    },

    onComment() {
      const {
        id,
        commentCount
      } = this.properties.post
      this.triggerEvent('comment', {
        postId: id,
        commentCount
      })
    },

    onShare() {
      this.setData({
        showSharePanel: true
      })
    },
    onCloseShare() {
      this.setData({
        showSharePanel: false
      })
    },

    // MAIN: generate share image & preview
    async onGenerateShareImage() {
      const post = this.properties.post
      if (!wx.createSelectorQuery) {
        wx.showToast({
          title: '当前版本不支持预览',
          icon: 'none'
        })
        return
      }
      this.setData({
        shareGenerating: true
      })

      try {
        const query = wx.createSelectorQuery().in(this)
        query.select('#shareCanvas')
          .fields({
            node: true,
            size: true
          })
        query.exec(async (res) => {
          const canvasNode = res[0].node
          const ctx = canvasNode.getContext('2d')
          const dpr = wx.getSystemInfoSync().pixelRatio
          const width = this.data.canvasWidth
          const height = this.data.canvasHeight
          canvasNode.width = width * dpr
          canvasNode.height = height * dpr
          ctx.scale(dpr, dpr)

          // background
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, width, height)

          // avatar
          const avatarSize = 88
          if (post.avatar) {
            const avatarImg = canvasNode.createImage()
            await new Promise((resolve, reject) => {
              avatarImg.onload = () => {
                ctx.save();
                ctx.beginPath();
                ctx.arc(60 + avatarSize / 2, 60 + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(avatarImg, 60, 60, avatarSize, avatarSize);
                ctx.restore();
                resolve()
              }
              avatarImg.onerror = reject
              avatarImg.src = post.avatar
            })
          } else {
            ctx.fillStyle = this.data._avatarBg || '#333'
            ctx.beginPath()
            ctx.arc(60 + avatarSize / 2, 60 + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = '#fff'
            ctx.font = 'bold 32px sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(this.data._avatarChar || '友', 60 + avatarSize / 2, 60 + avatarSize / 2)
          }

          // nickname & time
          ctx.fillStyle = '#111'
          ctx.font = 'bold 30px sans-serif'
          ctx.textAlign = 'left'
          ctx.fillText(post.nickname || '用户', 170, 95)
          ctx.fillStyle = '#8a8a8a'
          ctx.font = '24px sans-serif'
          ctx.fillText(post.createdAt || '', 170, 130)

          // content
          ctx.fillStyle = '#2C2C2C'
          ctx.font = '28px sans-serif'
          ctx.textBaseline = 'top'
          const contentMaxWidth = width - 120
          const lines = wrapText(ctx, post.content || '', contentMaxWidth)
          lines.slice(0, 6).forEach((line, i) => {
            ctx.fillText(line, 60, 180 + i * 40)
          })

          // first image preview (if any)
          if (post.images && post.images.length) {
            const img = canvasNode.createImage()
            await new Promise((resolve, reject) => {
              img.onload = () => {
                ctx.drawImage(img, 60, 420, width - 120, 360);
                resolve()
              }
              img.onerror = reject
              img.src = post.images[0]
            })
          }

          // footer
          ctx.fillStyle = '#f5f5f5'
          ctx.fillRect(0, height - 140, width, 140)
          ctx.fillStyle = '#111'
          ctx.font = 'bold 30px sans-serif'
          ctx.fillText('长按识别 · 查看完整内容', 60, height - 90)
          ctx.fillStyle = '#8a8a8a'
          ctx.font = '24px sans-serif'
          ctx.fillText('来自社区分享', 60, height - 50)

          wx.canvasToTempFilePath({
            canvas: canvasNode,
            width,
            height,
            destWidth: width * dpr,
            destHeight: height * dpr,
            success: (r) => {
              this.setData({
                shareTempPath: r.tempFilePath,
                shareGenerating: false
              })
              wx.previewImage({
                urls: [r.tempFilePath]
              })
              this.triggerEvent('shareimage', {
                tempFilePath: r.tempFilePath
              })
            },
            fail: (e) => {
              this.setData({
                shareGenerating: false
              })
              wx.showToast({
                title: '生成失败',
                icon: 'none'
              })
              console.error('canvasToTempFilePath error', e)
            },
          }, this)
        })
      } catch (err) {
        console.error(err)
        this.setData({
          shareGenerating: false
        })
        wx.showToast({
          title: '生成失败',
          icon: 'none'
        })
      }

      function wrapText(ctx, text, maxWidth) {
        const words = text.split('')
        let line = ''
        const lines = []
        words.forEach((ch) => {
          const testLine = line + ch
          const metrics = ctx.measureText(testLine)
          if (metrics.width > maxWidth) {
            lines.push(line)
            line = ch
          } else {
            line = testLine
          }
        })
        if (line) lines.push(line)
        return lines
      }
    },

    // fallback quick share actions
    onQuickCopy() {
      const {
        id
      } = this.properties.post
      wx.setClipboardData({
        data: `https://example.com/post/${id}`
      })
    },
    onQuickReport() {
      wx.showToast({
        title: '举报已提交',
        icon: 'success'
      })
    },
    onQuickDislike() {
      wx.showToast({
        title: '已标记不感兴趣',
        icon: 'none'
      })
    },

    onMoreTap() {
      const {
        id
      } = this.properties.post
      wx.showActionSheet({
        itemList: ['举报', '不感兴趣', '复制链接'],
        success(res) {
          if (res.tapIndex === 0) wx.showToast({
            title: '举报已提交',
            icon: 'success'
          })
          if (res.tapIndex === 1) wx.showToast({
            title: '已标记不感兴趣',
            icon: 'none'
          })
          if (res.tapIndex === 2) wx.setClipboardData({
            data: `https://example.com/post/${id}`
          })
        },
      })
    },
  },
})