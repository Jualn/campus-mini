const {
  drawPostPoster
} = require('../../utils/share_poster/postPoster')

const {
  drawActivityPoster
} = require('../../utils/share_poster/activityPoster')

const {
  drawExamPoster
} = require('../../utils/share_poster/examPoster')

Page({
  data: {
    postData: {
      avatar: '/images/1760004156926.jpg',
      name: '前端小天才',
      time: '2023-10-25 14:30',
      content: '今天天气真不错，和朋友们一起出去露营。这也是一段很长很长的文本，用来测试 Canvas 是否能够正常的进行多行文本的自动换行处理，如果超出三行应该怎么显示呢？我们拭目以待。',
      images: []
    },
    activityData: {
      title: '2024年终技术分享会 · 前端专场,挂机啊圣诞快乐感给撒旦干撒的是德国的受到了',
      time: '2024年12月28日 14:00–18:00',
      location: '北京市朝阳区望京SOHO T1栋 3层会议室',
      maxPeople: 100, // null 表示不限人数
      cover: '/images/1760004156926.jpg', // 有封面时填路径，无封面留空
    },
    examData: {
      name: '大学英语四级（CET-4）',
      tags: ['英语', '全国统考'],   // 最多3个，level 有值时自动加到最前
      level: '四级 / 六级',        // 可选
      enrollTime: '2024年3月1日–3月15日',
      examTime: '2024年6月15日',
      desc: '全国大学英语四六级考试，测评听力、阅读、写作等综合能力，成绩长期有效，是求职简历的重要加分项。',
    },

    image: ''
  },

  onShareAppMessage() {
    return {
      imageUrl: this.data.image
    }
  },

  async onTapShare() {
    // await drawPostPoster(this, this.data.postData, (tempFilePath) => {
    //   this.setData({
    //     image: tempFilePath
    //   })
    // })
    // await drawActivityPoster(this, this.data.activityData, (tempFilePath) => {
    //   this.setData({
    //     image: tempFilePath
    //   })
    // })
    await drawExamPoster(this, this.data.examData, (tempFilePath) => {
      this.setData({
        image: tempFilePath
      })
    })
  },

  async drawPoster() {
    wx.showLoading({
      title: '绘制中...'
    });
    try {
      const {
        images
      } = this.data.postData;
      if (images && images.length > 0) {
        await this.drawWithImages();
      } else {
        await this.drawTextOnly();
      }
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '绘制失败',
        icon: 'error'
      });
      console.error(error);
    }
  },

  // ════════════════════════════════════════════════════
  // 方案 A：有图版  1080×864
  // 首图占上方 2/3，底部白色区域放头像+昵称+文字摘要
  // 多图：右下角小缩略图网格 + +N 角标
  // ════════════════════════════════════════════════════
  async drawWithImages() {
    const query = wx.createSelectorQuery();
    query.select('#posterCanvas').fields({
      node: true,
      size: true
    }).exec(async (res) => {
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getWindowInfo().pixelRatio;

      const W = 1080,
        H = 864;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);

      const {
        avatar,
        name,
        time,
        content,
        images
      } = this.data.postData;
      const PAD = 40;
      const imgH = 560; // 首图区域高度

      // 白色背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      // 1. 首图铺满上方
      try {
        const img = await this.loadImage(canvas, images[0]);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, imgH);
        ctx.clip();
        this.drawCover(ctx, img, 0, 0, W, imgH);
        ctx.restore();
      } catch (e) {
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(0, 0, W, imgH);
      }

      // 2. 多图缩略图（右下角，白边小格）
      if (images.length > 1) {
        const ts = 96,
          tp = 6;
        const maxShow = Math.min(images.length - 1, 4);
        const rowX = W - PAD - maxShow * (ts + tp) + tp;
        const rowY = imgH - ts - PAD;

        for (let i = 0; i < maxShow; i++) {
          const tx = rowX + i * (ts + tp);
          const isLast = i === maxShow - 1 && images.length - 1 > maxShow;

          // 白色描边底
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.fillRect(tx - 3, rowY - 3, ts + 6, ts + 6);

          try {
            const img = await this.loadImage(canvas, images[i + 1]);
            ctx.save();
            ctx.rect(tx, rowY, ts, ts);
            ctx.clip();
            this.drawCover(ctx, img, tx, rowY, ts, ts);
            ctx.restore();
          } catch (e) {
            ctx.fillStyle = '#cccccc';
            ctx.fillRect(tx, rowY, ts, ts);
          }

          if (isLast) {
            ctx.fillStyle = 'rgba(0,0,0,0.52)';
            ctx.fillRect(tx, rowY, ts, ts);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px sans-serif';
            const label = `+${images.length - 1 - i}`;
            ctx.fillText(label, tx + (ts - ctx.measureText(label).width) / 2, rowY + ts / 2 + 8);
          }
        }
      }

      // 3. 图片底部渐变过渡到白色
      const grad = ctx.createLinearGradient(0, imgH - 80, 0, imgH);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, '#ffffff');
      ctx.fillStyle = grad;
      ctx.fillRect(0, imgH - 80, W, 80);

      // 4. 头像 + 昵称 + 时间
      const infoY = imgH - 80;
      const AV = 156;
      await this.drawCircleImage(canvas, ctx, avatar, PAD, infoY, AV);

      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText(name, PAD + AV + 16, infoY + 92);

      ctx.fillStyle = '#bbbbbb';
      ctx.font = '42px sans-serif';
      ctx.fillText(time, PAD + AV + 16, infoY + 150);

      // 5. 文字摘要（2行，28px）
      const textY = infoY + AV + 65;
      ctx.font = '56px sans-serif';
      ctx.fillStyle = '#111111';
      this.drawText(ctx, content, PAD - 20, textY, W - (PAD - 20) * 2, 64, 3);

      this._finalize(canvas);
    });
  },

  // ════════════════════════════════════════════════════
  // 方案 B：无图纯文字版  1080×864
  // 蓝白风格，大字正文占主体，底部署名区紧凑
  // ════════════════════════════════════════════════════
  async drawTextOnly() {
    const query = wx.createSelectorQuery();
    query.select('#posterCanvas').fields({
      node: true,
      size: true
    }).exec(async (res) => {
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getWindowInfo().pixelRatio;

      const W = 1080,
        H = 864;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);

      const {
        avatar,
        name,
        time,
        content
      } = this.data.postData;
      const PAD = 0; // 左边距
      const BLUE = '#1677ff'; // 微信小程序标准蓝

      // 1. 纯白背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      // 2. 顶部蓝色横条（细，12px）
      ctx.fillStyle = BLUE;
      ctx.fillRect(0, 0, W, 12);

      // 3. 大引号装饰（蓝色极低透明度）
      ctx.fillStyle = 'rgba(22,119,255,0.06)';
      ctx.font = 'bold 320px serif';
      ctx.fillText('\u201C', PAD - 30, 310);

      // 4. 正文：绝对主角，66px，最多5行
      ctx.fillStyle = '#111111';
      ctx.font = 'bold 66px sans-serif';
      const textEndY = this.drawText(ctx, content, PAD, 160, W - PAD * 2, 96, 5);

      // 5. 分割线（浅灰，细）
      const divY = Math.max(textEndY + 40, 620);
      ctx.strokeStyle = '#e8e8e8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(PAD, divY);
      ctx.lineTo(W - PAD, divY);
      ctx.stroke();

      // 6. 头像 + 昵称 + 时间 + 右侧蓝色胶囊
      const infoY = divY + 36;
      const AV = 140;
      await this.drawCircleImage(canvas, ctx, avatar, PAD, infoY, AV);

      ctx.fillStyle = '#111111';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText(name, PAD + AV + 20, infoY + 52);

      ctx.fillStyle = '#bbbbbb';
      ctx.font = '42px sans-serif';
      ctx.fillText(time, PAD + AV + 20, infoY + 122);

      // 胶囊按钮（右侧，与署名垂直居中对齐）
      const btnW = 290,
        btnH = 122,
        btnR = 62;
      const btnX = W - PAD - btnW;
      const btnY = infoY + (AV - btnH) / 2;
      ctx.fillStyle = BLUE;
      this.roundRect(ctx, btnX, btnY, btnW, btnH, btnR);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px sans-serif';
      const btnText = '查看全文 >';
      ctx.fillText(btnText, btnX + (btnW - ctx.measureText(btnText).width) / 2, btnY + btnH / 2 + 15);

      this._finalize(canvas);
    });
  },

  // ── 收尾：保存图片 ───────────────────────────
  _finalize(canvas) {
    wx.hideLoading();
    wx.showToast({
      title: '绘制成功',
      icon: 'success'
    });
    wx.canvasToTempFilePath({
      canvas,
      success: (res) => {
        console.log(res.tempFilePath);
        this.setData({
          image: res.tempFilePath
        });
      }
    }, this);
  },

  // ── 通用工具 ─────────────────────────────────

  drawText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    let line = '';
    let lineCount = 0;
    let currentY = y;
    for (let n = 0; n < text.length; n++) {
      const testLine = line + text[n];
      if (ctx.measureText(testLine).width > maxWidth && n > 0) {
        lineCount++;
        if (lineCount === maxLines) {
          let t = line;
          while (ctx.measureText(t + '...').width > maxWidth && t.length > 0) t = t.slice(0, -1);
          ctx.fillText(t + '...', x, currentY);
          return currentY + lineHeight;
        }
        ctx.fillText(line, x, currentY);
        line = text[n];
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
    return currentY + lineHeight;
  },

  drawCover(ctx, img, x, y, w, h) {
    const ir = img.width / img.height,
      ar = w / h;
    let sx, sy, sw, sh;
    if (ir > ar) {
      sh = img.height;
      sw = sh * ar;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      sw = img.width;
      sh = sw / ar;
      sx = 0;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  },

  async drawCircleImage(canvas, ctx, src, x, y, size) {
    try {
      const img = await this.loadImage(canvas, src);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, 2 * Math.PI);
      ctx.clip();
      ctx.drawImage(img, x, y, size, size);
      ctx.restore();
    } catch (e) {
      ctx.fillStyle = '#dddddd';
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, 2 * Math.PI);
      ctx.fill();
    }
  },

  loadImage(canvas, src) {
    return new Promise((resolve, reject) => {
      const img = canvas.createImage();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`加载图片失败: ${src}`));
      img.src = src;
    });
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
});