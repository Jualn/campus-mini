// utils/activityPoster.js
// 活动分享卡片
// 有封面：封面图占上方55%，下方结构化信息条
// 无封面：蓝白信息流卡片，时间/地点/人数色块排布
//
// 使用方式：
//   import { drawActivityPoster } from '../../utils/activityPoster'
//   await drawActivityPoster(this, activityData, (tempFilePath) => { ... })
//
// activityData 字段：
//   title      string       活动标题
//   time       string       活动时间
//   location   string       活动地点
//   maxPeople  number|null  人数上限，null 表示不限
//   cover      string       封面图路径，空字符串表示无封面

const PC = require('./posterCanvas');

async function drawActivityPoster(scope, activityData, onSuccess) {
  try {
    const canvas = await PC.getCanvasNode('#posterCanvas', scope);
    if (activityData.cover) {
      await _drawWithCover(canvas, scope, activityData, onSuccess);
    } else {
      await _drawNoCover(canvas, scope, activityData, onSuccess);
    }
  } catch (err) {
    wx.hideLoading();
    wx.showToast({
      title: '绘制失败',
      icon: 'error'
    });
    console.error('[activityPoster]', err);
  }
}

// ── 有封面版 ─────────────────────────────────────────
async function _drawWithCover(canvas, scope, data, onSuccess) {
  const {
    ctx,
    W,
    H
  } = PC.initCanvas(canvas);
  const {
    title,
    time,
    location,
    maxPeople,
    cover
  } = data;
  const PAD = 32;
  const imgH = 474;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 封面图
  try {
    const img = await PC.loadImage(canvas, cover);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, imgH);
    ctx.clip();
    PC.drawCover(ctx, img, 0, 0, W, imgH);
    ctx.restore();
  } catch (e) {
    const grad = ctx.createLinearGradient(0, 0, W, imgH);
    grad.addColorStop(0, '#1677ff');
    grad.addColorStop(1, '#69b1ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, imgH);
  }

  // 封面底部渐变过渡
  const grad = ctx.createLinearGradient(0, imgH - 80, 0, imgH);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, '#ffffff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, imgH - 80, W, 80);

  // 活动标签
  const tagY = imgH + 10;
  ctx.font = 'bold 48px sans-serif';
  const tagText = '活动';
  const tagW = ctx.measureText(tagText).width + 28;
  const tagH = 64;
  ctx.fillStyle = PC.BLUE;
  PC.roundRect(ctx, PAD, tagY - 40, tagW, tagH, 10);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(tagText, PAD + 14, tagY + 8);

  // 标题（单行截断）
  const titleY = tagY + tagH + 32;
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText(PC.truncateText(ctx, title, W - PAD * 2), PAD, titleY);

  // 信息条
  const infoStartY = titleY + 64;
  const infoLineH = 72;
  _drawInfoRow(ctx, PAD, infoStartY, W - PAD * 2, '时间', time, PC.BLUE);
  _drawInfoRow(ctx, PAD, infoStartY + infoLineH, W - PAD * 2, '地点', location, '#555555');
  if (maxPeople) {
    _drawInfoRow(ctx, PAD, infoStartY + infoLineH * 2, W - PAD * 2, '人数', `限 ${maxPeople} 人`, '#fa8c16');
  }

  PC.finalize(canvas, scope, onSuccess);
}

// 有封面版：单行信息条（圆点 + 标签 + 值）
function _drawInfoRow(ctx, x, y, maxW, label, value, color) {
  const dotR = 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + dotR, y + dotR + 2, dotR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText(label, x + dotR * 2 + 12, y + 18);

  const labelW = ctx.measureText(label).width + dotR * 2 + 12 + 16;
  ctx.fillStyle = '#333333';
  ctx.font = '54px sans-serif';
  ctx.fillText(PC.truncateText(ctx, value, maxW - labelW), x + labelW, y + 18);
}

// ── 无封面版 ─────────────────────────────────────────
async function _drawNoCover(canvas, scope, data, onSuccess) {
  const {
    ctx,
    W,
    H
  } = PC.initCanvas(canvas);
  const {
    title,
    time,
    location,
    maxPeople
  } = data;
  const PAD = 32;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  PC.drawTopBar(ctx);

  // 活动标签
  const tagY = 32;
  ctx.font = 'bold 48px sans-serif';
  const tagText = '活动';
  const tagW = ctx.measureText(tagText).width + 42;
  const tagH = 68;
  ctx.fillStyle = PC.BLUE;
  PC.roundRect(ctx, PAD, tagY, tagW, tagH, 10);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(tagText, PAD + 20, tagY + 50);

  // 标题（最多2行，56px）
  const titleY = tagY + tagH + 78;
  ctx.font = 'bold 64px sans-serif';
  ctx.fillStyle = '#111111';
  const titleEndY = PC.drawText(ctx, title, PAD, titleY, W - PAD * 2, 78, 2);

  // 分割线
  const divY = titleEndY;
  ctx.strokeStyle = '#ebebeb';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, divY);
  ctx.lineTo(W - PAD, divY);
  ctx.stroke();

  // 色块区域（剩余空间）
  const blockY = divY + 40;
  const blockH = H - blockY - PAD;
  const blockGap = 20;

  // 时间块（全宽，蓝色背景）
  const timeBlockH = maxPeople ?
    Math.floor((blockH - blockGap * 2) * 0.42) :
    Math.floor((blockH - blockGap) * 0.5);

  ctx.fillStyle = '#f0f5ff';
  PC.roundRect(ctx, PAD, blockY, W - PAD * 2, timeBlockH, 16);
  ctx.fill();

  const iconSize = 64;
  const iconX = PAD + 32;
  const iconY = blockY + (timeBlockH - iconSize) / 2;
  ctx.fillStyle = PC.BLUE;
  PC.roundRect(ctx, iconX, iconY, iconSize, iconSize, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('日', iconX + 8, iconY + 48);

  ctx.fillStyle = PC.BLUE;
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('时间', iconX + iconSize + 20, blockY + timeBlockH / 2 - 26);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '54px sans-serif';
  const timeMaxW = W - PAD * 2 - iconSize - 80;
  ctx.fillText(PC.truncateText(ctx, time, timeMaxW), iconX + iconSize + 20, blockY + timeBlockH / 2 + 40);

  // 地点 / 人数块
  const row2Y = blockY + timeBlockH + blockGap;
  const row2H = blockH - timeBlockH - blockGap;

  if (maxPeople) {
    const colW = (W - PAD * 2 - blockGap) / 2;

    // 地点块
    ctx.fillStyle = '#f6f6f6';
    PC.roundRect(ctx, PAD, row2Y, colW, row2H, 16);
    ctx.fill();
    ctx.fillStyle = '#888888';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('地点', PAD + 24, row2Y + 54);
    ctx.fillStyle = '#222222';
    ctx.font = '54px sans-serif';
    PC.drawText(ctx, location, PAD + 24, row2Y + 120, colW - 48, 58, 3);

    // 人数块
    const col2X = PAD + colW + blockGap;
    ctx.fillStyle = '#fff7e6';
    PC.roundRect(ctx, col2X, row2Y, colW, row2H, 16);
    ctx.fill();
    ctx.fillStyle = '#fa8c16';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('人数上限', col2X + 24, row2Y + 54);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 54px sans-serif';
    const numStr = `${maxPeople}`;
    ctx.fillText(numStr, col2X + 24, row2Y + row2H / 2 + 22);
    ctx.fillStyle = '#888888';
    ctx.font = '54px sans-serif';
    ctx.fillText('人', col2X + 24 + ctx.measureText(numStr).width + 6, row2Y + row2H / 2 + 22);
  } else {
    // 地点独占全宽
    ctx.fillStyle = '#f6f6f6';
    PC.roundRect(ctx, PAD, row2Y, W - PAD * 2, row2H, 16);
    ctx.fill();
    ctx.fillStyle = '#888888';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('地点', PAD + 32, row2Y + 54);
    ctx.fillStyle = '#222222';
    ctx.font = '54px sans-serif';
    PC.drawText(ctx, location, PAD + 32, row2Y + 120, W - PAD * 2 - 64, 58, 2);
  }

  PC.finalize(canvas, scope, onSuccess);
}

module.exports = {
  drawActivityPoster
};