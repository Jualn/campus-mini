import * as PC from '../../utils/share_poster/posterCanvas';

export interface PublicEventPosterData {
  name: string;
  desc: string;
  /** 保留业务时间节点原标签，不按左右位置推断报名或考试时间。 */
  dates: { label: string; value: string }[];
}

/** 恢复原版红色顶条、公共事项标签、简介和双色时间块。 */
export async function drawPublicEventPoster(
  scope: PC.WxScope,
  data: PublicEventPosterData,
): Promise<string> {
  const canvas = await PC.getCanvasNode('#posterCanvas', scope);
  const { ctx, W, H } = PC.initCanvas(canvas);
  const PAD = 32;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  PC.drawTopBar(ctx, '#ff4d4f');

  ctx.font = 'bold 48px sans-serif';
  const tagW = ctx.measureText('公共事项').width + 42;
  ctx.fillStyle = '#ff4d4f';
  PC.roundRect(ctx, PAD, 32, tagW, 68, 10);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  PC.drawVerticallyCenteredText(ctx, '公共事项', PAD + 20, 66, 48);

  ctx.fillStyle = '#111111';
  ctx.font = 'bold 64px sans-serif';
  const nameEndY = PC.drawText(ctx, data.name || '公共事项', PAD, 178, W - PAD * 2, 78, 2);
  // 详情没有等级、类型标签字段，不补造旧示例中的标签，也不保留空标签行。
  const divY = nameEndY + 16;
  ctx.strokeStyle = '#ebebeb';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, divY);
  ctx.lineTo(W - PAD, divY);
  ctx.stroke();

  ctx.font = '54px sans-serif';
  ctx.fillStyle = '#444444';
  const descEndY = PC.drawText(ctx, data.desc, PAD, divY + 72, W - PAD * 2, 64, 3);
  const blockY = Math.max(descEndY + 12, H - PAD - 240);
  const blockH = H - PAD - blockY;
  const dates = data.dates.filter((date) => date.value).slice(0, 2);
  if (!dates.length) {
    ctx.fillStyle = '#f0f5ff';
    PC.roundRect(ctx, PAD, blockY, W - PAD * 2, blockH, 16);
    ctx.fill();
    ctx.fillStyle = '#1677ff';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('时间安排', PAD + 24, blockY + 64);
    ctx.fillStyle = '#444444';
    ctx.font = '54px sans-serif';
    ctx.fillText('暂未提供，请关注官方通知', PAD + 24, blockY + 140);
  } else {
    const gap = 20;
    const width = (W - PAD * 2 - gap * (dates.length - 1)) / dates.length;
    dates.forEach((date, index) => {
      const x = PAD + index * (width + gap);
      ctx.fillStyle = index === 0 ? '#fff7e6' : '#f0f5ff';
      PC.roundRect(ctx, x, blockY, width, blockH, 16);
      ctx.fill();
      ctx.fillStyle = index === 0 ? '#fa8c16' : '#1677ff';
      ctx.font = 'bold 48px sans-serif';
      ctx.fillText(PC.truncateText(ctx, date.label || '时间节点', width - 48), x + 24, blockY + 64);
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '54px sans-serif';
      const value = date.value.replace(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/, '$1\n$2');
      PC.drawText(ctx, value, x + 24, blockY + 130, width - 48, 64, 2);
    });
  }
  return PC.finalize(canvas, scope);
}
