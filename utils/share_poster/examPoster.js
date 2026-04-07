// utils/examPoster.js
// 公共考试资讯分享卡片（四六级 / 考研 / 计算机等级 / 普通话 等）
// 目的：让用户了解考试信息，吸引点击查看详情
// 无个人隐私数据
//
// 使用方式：
//   const { drawExamPoster } = require('../../utils/examPoster')
//   await drawExamPoster(this, examData, (tempFilePath) => { ... })
//
// examData 字段：
//   name        string     考试全称，如"英语四级（CET-4）"
//   tags        string[]   标签，如 ['英语', '四级', '全国统考']，最多3个
//   enrollTime  string     报名时间，如"2024年3月1日–3月15日"
//   examTime    string     考试时间，如"2024年6月15日"
//   desc        string     考试简介/亮点，2-3句话，是吸引用户的核心文案
//   level       string     可选，等级说明，如"四级 / 六级"

const PC = require('./posterCanvas');

// 考试卡片专用色
const EXAM_AMBER = '#fa8c16'; // 报名时间（紧迫感）
const EXAM_BLUE = '#1677ff'; // 考试时间（权威感）
const EXAM_RED = '#ff4d4f'; // 顶部色条

async function drawExamPoster(scope, examData, onSuccess) {
  wx.showLoading({
    title: '绘制中...'
  });
  try {
    const canvas = await PC.getCanvasNode('#posterCanvas', scope);
    await _draw(canvas, scope, examData, onSuccess);
  } catch (err) {
    wx.hideLoading();
    wx.showToast({
      title: '绘制失败',
      icon: 'error'
    });
    console.error('[examPoster]', err);
  }
}

async function _draw(canvas, scope, data, onSuccess) {
  const {
    ctx,
    W,
    H
  } = PC.initCanvas(canvas);
  const {
    name,
    tags = [],
    enrollTime,
    examTime,
    desc,
    level
  } = data;
  const PAD = 32;

  // 白色背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 顶部红色横条（区别于活动蓝条）
  ctx.fillStyle = EXAM_RED;
  ctx.fillRect(0, 0, W, 12);

  // ── 1. 「考试」标签 ──
  const tagY = 32;
  ctx.font = 'bold 48px sans-serif';
  const tagText = '考试';
  const tagW = ctx.measureText(tagText).width + 42;
  const tagH = 68;
  ctx.fillStyle = EXAM_RED;
  PC.roundRect(ctx, PAD, tagY, tagW, tagH, 10);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(tagText, PAD + 20, tagY + 50);

  // ── 2. 考试名称（最大视觉元素，最多2行）──
  const nameY = tagY + tagH + 78;
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 64px sans-serif';
  const nameEndY = PC.drawText(ctx, name, PAD, nameY, W - PAD * 2, 78, 2);

  // ── 3. 标签行（等级/类型标签，小胶囊）──
  let tagsEndX = PAD;
  const tagsY = nameEndY - 20;
  const chipH = 78,
    chipR = 32,
    chipPadX = 28;
  const allTags = level ? [level, ...tags] : tags;

  allTags.slice(0, 3).forEach((tag) => {
    ctx.font = '48px sans-serif';
    const chipW = ctx.measureText(tag).width + chipPadX * 2;
    ctx.fillStyle = '#f0f5ff';
    PC.roundRect(ctx, tagsEndX, tagsY, chipW, chipH, chipR);
    ctx.fill();
    ctx.fillStyle = EXAM_BLUE;
    ctx.fillText(tag, tagsEndX + chipPadX, tagsY + 54);
    tagsEndX += chipW + 12;
  });

  // ── 4. 分割线 ──
  const divY = tagsY + chipH + 36;
  ctx.strokeStyle = '#ebebeb';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, divY);
  ctx.lineTo(W - PAD, divY);
  ctx.stroke();

  // ── 5. 简介文案（用户看了想了解的核心，3行）──
  const descY = divY + 72;
  ctx.font = '54px sans-serif';
  ctx.fillStyle = '#444444';
  const descEndY = PC.drawText(ctx, desc, PAD, descY, W - PAD * 2, 64, 3);

  // ── 6. 底部时间色块（报名时间 + 考试时间）──
  const blockY = descEndY;
  const blockH = H - blockY - PAD + 20;
  const blockGap = 20;
  const colW = (W - PAD * 2 - blockGap) / 2;

  // 报名时间（橙色，突出紧迫感）
  ctx.fillStyle = '#fff7e6';
  PC.roundRect(ctx, PAD, blockY, colW, blockH, 16);
  ctx.fill();
  ctx.fillStyle = EXAM_AMBER;
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('报名时间', PAD + 24, blockY + 72);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '54px sans-serif';
  PC.drawText(ctx, enrollTime, PAD + 24, blockY + 140, colW - 48, 64, 2);

  // 考试时间（蓝色，权威感）
  const col2X = PAD + colW + blockGap;
  ctx.fillStyle = '#f0f5ff';
  PC.roundRect(ctx, col2X, blockY, colW, blockH, 16);
  ctx.fill();
  ctx.fillStyle = EXAM_BLUE;
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('考试时间', col2X + 24, blockY + 72);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '54px sans-serif';
  PC.drawText(ctx, examTime, col2X + 24, blockY + 140, colW - 48, 64, 2);

  PC.finalize(canvas, scope, onSuccess);
}

module.exports = {
  drawExamPoster
};