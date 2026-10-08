import * as PC from '../../utils/share_poster/posterCanvas';
import type { WxScope } from '../../utils/share_poster/posterCanvas';

// ── 类型定义 ──────────────────────────────────────────────────────────

export interface ActivityData {
  title: string;
  time: string;
  location: string;
  maxPeople: number | null;
  capacityText?: string;
  cover: string;
}

type Ctx = ReturnType<typeof PC.initCanvas>['ctx'];
/** 保留原版封面、标签及信息色块；页面统一处理生成状态。 */
export async function drawActivityPoster(
  scope: WxScope,
  activityData: ActivityData,
): Promise<string> {
  const canvas = await PC.getCanvasNode('#posterCanvas', scope);
  const image = await PC.optionalImage(canvas, activityData.cover);
  const data = {
    ...activityData,
    title: activityData.title || '校园活动',
    time: activityData.time || '未提供时间',
    location: activityData.location || '未提供地点',
    maxPeople:
      typeof activityData.maxPeople === 'number' && activityData.maxPeople > 0
        ? activityData.maxPeople
        : null,
  };
  return image ? _drawWithCover(canvas, scope, data, image) : _drawNoCover(canvas, scope, data);
}

// ── 有封面版 ─────────────────────────────────────────
function _drawWithCover(
  canvas: WechatMiniprogram.Canvas,
  scope: WxScope,
  data: ActivityData,
  image: WechatMiniprogram.Image,
): Promise<string> {
  const { ctx, W, H } = PC.initCanvas(canvas);
  const { title, time, location, maxPeople } = data;
  const capacity = data.capacityText ?? (maxPeople ? `${String(maxPeople)} 人` : '');
  const PAD = 32;
  const imgH = 474;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  PC.drawCover(ctx, image, 0, 0, W, imgH);

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
  PC.drawVerticallyCenteredText(ctx, tagText, PAD + 14, tagY - 8, 48);

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
  if (capacity) {
    _drawInfoRow(
      ctx,
      PAD,
      infoStartY + infoLineH * 2,
      W - PAD * 2,
      '官方名额',
      capacity,
      '#fa8c16',
    );
  }

  return PC.finalize(canvas, scope);
}

// 有封面版：单行信息条（圆点 + 标签 + 值）
function _drawInfoRow(
  ctx: Ctx,
  x: number,
  y: number,
  maxW: number,
  label: string,
  value: string,
  color: string,
): void {
  const dotR = 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + dotR, y, dotR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.font = 'bold 48px sans-serif';
  PC.drawVerticallyCenteredText(ctx, label, x + dotR * 2 + 12, y, 48);

  const labelW = ctx.measureText(label).width + dotR * 2 + 12 + 16;
  ctx.fillStyle = '#333333';
  ctx.font = '54px sans-serif';
  PC.drawVerticallyCenteredText(ctx, PC.truncateText(ctx, value, maxW - labelW), x + labelW, y, 54);
}

// ── 无封面版 ─────────────────────────────────────────
function _drawNoCover(
  canvas: WechatMiniprogram.Canvas,
  scope: WxScope,
  data: ActivityData,
): Promise<string> {
  const { ctx, W, H } = PC.initCanvas(canvas);
  const { title, time, location, maxPeople } = data;
  const capacity = data.capacityText ?? (maxPeople ? `${String(maxPeople)} 人` : '');
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
  PC.drawVerticallyCenteredText(ctx, tagText, PAD + 20, tagY + tagH / 2, 48);

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
  const timeBlockH = capacity
    ? Math.floor((blockH - blockGap * 2) * 0.42)
    : Math.floor((blockH - blockGap) * 0.5);

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
  PC.drawVerticallyCenteredText(ctx, '日', iconX + 8, iconY + iconSize / 2, 48);

  ctx.fillStyle = PC.BLUE;
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('时间', iconX + iconSize + 20, blockY + timeBlockH / 2 - 26);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '54px sans-serif';
  const timeMaxW = W - PAD * 2 - iconSize - 80;
  ctx.fillText(
    PC.truncateText(ctx, time, timeMaxW),
    iconX + iconSize + 20,
    blockY + timeBlockH / 2 + 40,
  );

  // 地点 / 人数块
  const row2Y = blockY + timeBlockH + blockGap;
  const row2H = blockH - timeBlockH - blockGap;

  if (capacity) {
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
    const locationLines = Math.max(1, Math.min(3, Math.floor((row2H - 136) / 58) + 1));
    PC.drawText(ctx, location, PAD + 24, row2Y + 120, colW - 48, 58, locationLines);

    // 人数块
    const col2X = PAD + colW + blockGap;
    ctx.fillStyle = '#fff7e6';
    PC.roundRect(ctx, col2X, row2Y, colW, row2H, 16);
    ctx.fill();
    ctx.fillStyle = '#fa8c16';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('官方名额', col2X + 24, row2Y + 54);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 54px sans-serif';
    const capacityText = PC.truncateText(ctx, capacity, colW - 48);
    ctx.fillText(capacityText, col2X + 24, row2Y + row2H / 2 + 22);
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

  return PC.finalize(canvas, scope);
}
