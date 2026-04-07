// utils/postPoster.js
// 帖子分享卡片
// 有图：首图铺满上方，多图缩略网格，底部头像+摘要
// 无图：蓝白排版卡片，大字正文，底部署名+按钮
//
// 使用方式：
//   import { drawPostPoster } from '../../utils/postPoster'
//   await drawPostPoster(this, postData, (tempFilePath) => { ... })
//
// postData 字段：
//   avatar   string   头像路径
//   name     string   昵称
//   time     string   发布时间
//   content  string   正文内容
//   images   string[] 图片路径数组，空数组或不传为无图

const PC = require('./posterCanvas');

/**
 * 入口：根据是否有图自动选择方案
 * @param {object} scope        Page 实例（传 this）
 * @param {object} postData     帖子数据
 * @param {function} onSuccess  成功回调，参数为 tempFilePath
 */
async function drawPostPoster(scope, postData, onSuccess) {
  try {
    const canvas = await PC.getCanvasNode('#posterCanvas', scope);
    const hasImages = postData.images && postData.images.length > 0;
    if (hasImages) {
      await _drawWithImages(canvas, scope, postData, onSuccess);
    } else {
      await _drawTextOnly(canvas, scope, postData, onSuccess);
    }
  } catch (err) {
    wx.hideLoading();
    wx.showToast({
      title: '绘制失败',
      icon: 'error'
    });
    console.error('[postPoster]', err);
  }
}

// ── 有图版 ───────────────────────────────────────────
async function _drawWithImages(canvas, scope, postData, onSuccess) {
  const {
    ctx,
    W,
    H
  } = PC.initCanvas(canvas);
  const {
    avatarUrl,
    avatarChar,
    avatarBg,
    name,
    time,
    content,
    images
  } = postData;
  const PAD = 40;
  const imgH = 560;

  // 白色背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 1. 首图
  try {
    const img = await PC.loadImage(canvas, images[0]);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, imgH);
    ctx.clip();
    PC.drawCover(ctx, img, 0, 0, W, imgH);
    ctx.restore();
  } catch (e) {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, W, imgH);
  }

  // 2. 多图缩略图（右下角）
  if (images.length > 1) {
    const ts = 96,
      tp = 6;
    const maxShow = Math.min(images.length - 1, 4);
    const rowX = W - PAD - maxShow * (ts + tp) + tp;
    const rowY = imgH - ts - PAD;

    for (let i = 0; i < maxShow; i++) {
      const tx = rowX + i * (ts + tp);
      const isLast = i === maxShow - 1 && images.length - 1 > maxShow;

      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(tx - 3, rowY - 3, ts + 6, ts + 6);

      try {
        const img = await PC.loadImage(canvas, images[i + 1]);
        ctx.save();
        ctx.rect(tx, rowY, ts, ts);
        ctx.clip();
        PC.drawCover(ctx, img, tx, rowY, ts, ts);
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

  // 3. 底部渐变过渡
  const grad = ctx.createLinearGradient(0, imgH - 80, 0, imgH);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, '#ffffff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, imgH - 80, W, 80);

  // 4. 头像 + 昵称 + 时间
  const infoY = imgH - 80;
  const AV = 156;

  // 判断渲染逻辑
  if (avatarUrl) {
    // 如果有图片链接，调用你原来的图片方法
    await PC.drawCircleImage(canvas, ctx, avatarUrl, PAD, infoY, AV);
  } else if (avatarChar && avatarBg) {
    // 如果没有图片，但有文字和背景色配置，调用纯文字头像方法
    // 注意：这个操作是同步的，不需要 await
    await PC.drawTextAvatar(ctx, avatarChar, avatarBg, PAD, infoY, AV);
  } else {
    // 如果什么都没有，你可以画一个默认的灰色占位头像
    await PC.drawTextAvatar(ctx, '?', '#dddddd', PAD, infoY, AV);
  }

  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 50px sans-serif';
  ctx.fillText(name, PAD + AV + 16, infoY + 92);

  ctx.fillStyle = '#bbbbbb';
  ctx.font = '42px sans-serif';
  ctx.fillText(time, PAD + AV + 16, infoY + 150);

  // 5. 正文摘要（3行）
  const textY = infoY + AV + 65;
  ctx.font = '56px sans-serif';
  ctx.fillStyle = '#111111';
  PC.drawText(ctx, content, PAD, textY, W - PAD * 2, 64, 3);

  PC.finalize(canvas, scope, onSuccess);
}

// ── 无图版 ───────────────────────────────────────────
async function _drawTextOnly(canvas, scope, postData, onSuccess) {
  const {
    ctx,
    W,
    H
  } = PC.initCanvas(canvas);
  const {
    avatarUrl,
    avatarChar,
    avatarBg,
    name,
    time,
    content
  } = postData;
  const PAD = 32;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  PC.drawTopBar(ctx);

  // 大引号装饰
  ctx.fillStyle = 'rgba(22,119,255,0.06)';
  ctx.font = 'bold 320px serif';
  ctx.fillText('\u201C', PAD - 30, 310);

  // 正文（5行，66px）
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 66px sans-serif';
  const textEndY = PC.drawText(ctx, content, PAD, 160, W - PAD * 2, 96, 5);

  // 分割线
  const divY = Math.max(textEndY + 40, 620);
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, divY);
  ctx.lineTo(W - PAD, divY);
  ctx.stroke();

  // 头像 + 昵称 + 时间
  const infoY = divY + 36;
  const AV = 140;

  // 判断渲染逻辑
  if (avatarUrl) {
    // 如果有图片链接，调用你原来的图片方法
    await PC.drawCircleImage(canvas, ctx, avatarUrl, PAD, infoY, AV);
  } else if (avatarChar && avatarBg) {
    // 如果没有图片，但有文字和背景色配置，调用纯文字头像方法
    // 注意：这个操作是同步的，不需要 await
    await PC.drawTextAvatar(ctx, avatarChar, avatarBg, PAD, infoY, AV);
  } else {
    // 如果什么都没有，你可以画一个默认的灰色占位头像
    await PC.drawTextAvatar(ctx, '?', '#dddddd', PAD, infoY, AV);
  }

  ctx.fillStyle = '#111111';
  ctx.font = 'bold 50px sans-serif';
  ctx.fillText(name, PAD + AV + 20, infoY + 62);

  ctx.fillStyle = '#bbbbbb';
  ctx.font = '42px sans-serif';
  ctx.fillText(time, PAD + AV + 20, infoY + 122);

  // 胶囊按钮
  const btnW = 290,
    btnH = 122,
    btnR = 62;
  const btnX = W - PAD - btnW;
  const btnY = infoY + (AV - btnH) / 2;
  ctx.fillStyle = PC.BLUE;
  PC.roundRect(ctx, btnX, btnY, btnW, btnH, btnR);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  const btnText = '查看全文 ›';
  ctx.fillText(btnText, btnX + (btnW - ctx.measureText(btnText).width) / 2, btnY + btnH / 2 + 15);

  PC.finalize(canvas, scope, onSuccess);
}

module.exports = {
  drawPostPoster
};