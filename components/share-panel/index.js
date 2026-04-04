// components/share-panel/index.js

/** 工具：按宽度自动换行，支持最大行数与省略号 */
function wrapLines(ctx, text, maxWidth, maxLines = Infinity) {
  const lines = []
  let line = ''
  for (const char of text) {
    const test = line + char
    const {
      width
    } = ctx.measureText(test)
    if (width > maxWidth && line) {
      lines.push(line)
      line = char
      if (lines.length === maxLines) {
        lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1) + '…'
        return lines
      }
    } else line = test
  }
  if (line) lines.push(line)
  return lines
}

/** 载入图片为 Image 对象 */
function loadImage(canvas, src) {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** 画圆形头像 */
async function drawAvatar(ctx, canvas, url, x, y, size) {
  const img = await loadImage(canvas, url)
  ctx.save()
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  ctx.clip()
  ctx.drawImage(img, x, y, size, size)
  ctx.restore()
}

/** 多图九宫格，返回占用高度 */
async function drawImagesGrid(ctx, canvas, urls, x, startY, cellSize, gap) {
  const max = Math.min(urls.length, 9)
  const col = 3
  let row = Math.ceil(max / col)
  const promises = urls.slice(0, max).map((u, i) => loadImage(canvas, u).then(img => ({
    img,
    i
  })))
  const loaded = await Promise.allSettled(promises)
  loaded.forEach(res => {
    if (res.status !== 'fulfilled') return
    const {
      img,
      i
    } = res.value
    const cx = i % col
    const cy = Math.floor(i / col)
    const dx = x + cx * (cellSize + gap)
    const dy = startY + cy * (cellSize + gap)
    ctx.drawImage(img, dx, dy, cellSize, cellSize)
    if (i === max - 1 && urls.length > 9) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(dx, dy, cellSize, cellSize)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 18px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`+${urls.length - 9}`, dx + cellSize / 2, dy + cellSize / 2)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }
  })
  return row * cellSize + (row - 1) * gap
}

/** 主绘制函数：返回动态高度 */
function drawRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
  ctx.fill()
}

async function drawPostCard(ctx, canvas, post, opts) {
  const { width, padding, avatarSize, maxTextWidth, textLineHeight, maxTextLines } = opts
  let y = padding

  // 卡片背景（占位，稍后用 destination-over 重新填充）
  ctx.fillStyle = '#fff'
  drawRoundRect(ctx, padding / 2, padding / 2, width - padding, 16, 16)

  // 头像 + 昵称 + 时间
  if (post.avatar) await drawAvatar(ctx, canvas, post.avatar, padding, y, avatarSize)
  ctx.fillStyle = '#111'
  ctx.font = '600 16px sans-serif'
  ctx.fillText(post.nickname || '匿名用户', padding + avatarSize + 12, y + 18)
  ctx.fillStyle = '#999'
  ctx.font = '12px sans-serif'
  ctx.fillText(post.createTime || '', padding + avatarSize + 12, y + 38)
  y += avatarSize + 18

  // 正文
  ctx.fillStyle = '#222'
  ctx.font = '15px sans-serif'
  const content = (post.content || '').trim()
  const lines = wrapLines(ctx, content, maxTextWidth, maxTextLines)
  lines.forEach(line => { ctx.fillText(line, padding, y); y += textLineHeight })
  y += 8

  // 多图
  if (post.images?.length) {
    const gridSize = 104, gap = 6
    const gridH = await drawImagesGrid(ctx, canvas, post.images, padding, y, gridSize, gap)
    y += gridH + 12
  }

  // 点赞评论
  ctx.fillStyle = '#666'
  ctx.font = '14px sans-serif'
  ctx.fillText(`❤️ ${post.likeCount || 0}`, padding, y + 16)
  ctx.fillText(`💬 ${post.commentCount || 0}`, padding + 90, y + 16)
  y += 32

  // 品牌
  ctx.fillStyle = '#bbb'
  ctx.font = '12px sans-serif'
  ctx.fillText('🎓 校园圈 - 属于我们的社区', padding, y + 14)
  y += 28

  // 用 destination-over 回填背景为正确高度
  ctx.save()
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = '#fff'
  drawRoundRect(ctx, padding / 2, padding / 2, width - padding, y, 16)
  ctx.restore()

  return y + padding / 2
}

// ──────────────────────────���───────────────────────────────
Component({
  properties: {
    post: {
      type: Object,
      value: {}
    },
  },
  data: {
    previewContent: '',
    canvasW: 375,
    canvasH: 600,
    longImagePath: '',
    shareImagePath: '',
  },
  observers: {
    post(val) {
      if (!val?.id) return
      const content = val.content?.trim() || ''
      this.setData({
        previewContent: content.length > 100 ? content.slice(0, 100) + '...' : content,
      })
      this._drawCanvas(val)
    },
  },
  methods: {
    async _drawCanvas(post) {
      const dpr = wx.getWindowInfo().pixelRatio
      const W = 360 // 视觉宽度
      const PADDING = 18

      const query = this.createSelectorQuery().in(this)
      query.select('#share-canvas').fields({
        node: true,
        size: true
      })
      query.exec(async (res) => {
        const canvas = res[0]?.node
        if (!canvas) return console.error('找不到Canvas节点')

        // 预估高度，先铺满再缩
        canvas.width = W * dpr
        canvas.height = 2200 * dpr
        const ctx = canvas.getContext('2d')
        ctx.scale(dpr, dpr)

        const totalH = await drawPostCard(ctx, canvas, post, {
          width: W,
          padding: PADDING,
          avatarSize: 42,
          maxTextWidth: W - PADDING * 2,
          textLineHeight: 22,
          maxTextLines: 16, // 超长文本做限制，避免过高
        })

        // 重置高度并重画，得到清晰图
        canvas.height = totalH * dpr
        this.setData({
          canvasH: totalH
        }, async () => {
          ctx.scale(dpr, dpr)
          ctx.fillStyle = '#f4f5f7'
          ctx.fillRect(0, 0, W + PADDING, totalH + PADDING)
          await drawPostCard(ctx, canvas, post, {
            width: W,
            padding: PADDING,
            avatarSize: 42,
            maxTextWidth: W - PADDING * 2,
            textLineHeight: 22,
            maxTextLines: 16,
          })

          // 导出长图
          wx.canvasToTempFilePath({
            canvas,
            destWidth: W * dpr,
            destHeight: totalH * dpr,
            fileType: 'jpg',
            quality: 0.9,
            success: async ({
              tempFilePath
            }) => {
              this.longImagePath = tempFilePath
              // 生成 5:4 封���（分享用，体积更小）
              try {
                const sharePath = await this._cropToRatio(canvas, tempFilePath, 500, 400)
                this.shareImagePath = sharePath
              } catch (e) {
                console.error('裁剪分享图失败', e)
              }
            },
          }, this)
        })
      })
    },

    /** 将长图裁剪/缩放为给定比例，用于分享卡片 */
    _cropToRatio(canvas, srcPath, targetW, targetH) {
      const dpr = wx.getWindowInfo().pixelRatio
      return new Promise((resolve, reject) => {
        canvas.width = targetW * dpr
        canvas.height = targetH * dpr
        const ctx = canvas.getContext('2d')
        ctx.scale(dpr, dpr)
        const img = canvas.createImage()
        img.onload = () => {
          const scale = Math.max(targetW / img.width, targetH / img.height)
          const drawW = img.width * scale
          const drawH = img.height * scale
          const dx = (targetW - drawW) / 2
          const dy = (targetH - drawH) / 2
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, targetW, targetH)
          ctx.drawImage(img, dx, dy, drawW, drawH)
          wx.canvasToTempFilePath({
            canvas,
            destWidth: targetW * dpr,
            destHeight: targetH * dpr,
            fileType: 'jpg',
            quality: 0.85,
            success: ({
              tempFilePath
            }) => resolve(tempFilePath),
            fail: reject,
          }, this)
        }
        img.onerror = reject
        img.src = srcPath
      })
    },

    onTapShareFriend() {
      this.triggerEvent('updateShareImage', {
        imageUrl: this.shareImagePath || this.longImagePath || ''
      })
    },
    
    onCopyText() {
      const text = buildCopyText(this.properties.post)
      wx.setClipboardData({
        data: text,
        success: () => {
          wx.showToast({
            title: '已复制',
            icon: 'success'
          })
          setTimeout(() => this.triggerEvent('close'), 1500)
        },
      })
    },
    onClose() {
      this.triggerEvent('close')
    },
  },
})