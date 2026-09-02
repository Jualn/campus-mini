import * as PC from './posterCanvas';
import type { WxScope } from './posterCanvas';

// ── 类型定义 ──────────────────────────────────────────────────────────

export interface PostData {
  avatarUrl?: string;
  avatarChar?: string;
  avatarBg?: string;
  name: string;
  time: string;
  content: string;
  images?: string[];
}

/** 沿用最初的海报布局；生成与导出统一返回 Promise，由页面管理加载状态。 */
export async function drawPostPoster(scope: WxScope, postData: PostData): Promise<string> {
  const canvas = await PC.getCanvasNode('#posterCanvas', scope);
  // 首图、头像和最多四张缩略图并行加载，避免失败资源逐张等待超时。
  const [images, avatar] = await Promise.all([
    Promise.all((postData.images ?? []).slice(0, 5).map((src) => PC.optionalImage(canvas, src))),
    PC.optionalImage(canvas, postData.avatarUrl),
  ]);
  if (images[0]) return _drawWithImages(canvas, scope, postData, images, avatar);
  return _drawTextOnly(canvas, scope, postData, avatar);
}

// ── 头像渲染（图片优先，降级文字，兜底灰圆）────────────────────────────

function _drawAvatar(
  ctx: PC.Ctx2D,
  data: Pick<PostData, 'avatarChar' | 'avatarBg'>,
  avatar: WechatMiniprogram.Image | null,
  x: number,
  y: number,
  size: number,
): void {
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    PC.drawCover(ctx, avatar, x, y, size, size);
    ctx.restore();
  } else {
    PC.drawTextAvatar(
      ctx,
      (data.avatarChar ?? '') || '?',
      (data.avatarBg ?? '') || '#dddddd',
      x,
      y,
      size,
    );
  }
}

// ── 有图版 ────────────────────────────────────────────────────────────

function _drawWithImages(
  canvas: WechatMiniprogram.Canvas,
  scope: WxScope,
  postData: PostData,
  loadedImages: (WechatMiniprogram.Image | null)[],
  avatar: WechatMiniprogram.Image | null,
): Promise<string> {
  const { ctx, W, H } = PC.initCanvas(canvas);
  const { name, time, content, images = [] } = postData;
  const PAD = 32;
  const imgH = 560;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 1. 首图（失败时灰色占位）
  try {
    const img = loadedImages[0];
    if (!img) throw new Error('首图不可用');
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, imgH);
    ctx.clip();
    PC.drawCover(ctx, img, 0, 0, W, imgH);
    ctx.restore();
  } catch {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, W, imgH);
  }

  // 2. 多图缩略网格（右下角，最多 4 张）
  if (images.length > 1) {
    const ts = 96;
    const tp = 6;
    const maxShow = Math.min(images.length - 1, 4);
    const rowX = W - PAD - maxShow * (ts + tp) + tp;
    const rowY = imgH - ts - 88;

    for (let i = 0; i < maxShow; i++) {
      const tx = rowX + i * (ts + tp);
      const isLast = i === maxShow - 1 && images.length - 1 > maxShow;

      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(tx - 3, rowY - 3, ts + 6, ts + 6);

      try {
        const img = loadedImages[i + 1];
        if (!img) throw new Error('缩略图不可用');
        ctx.save();
        ctx.beginPath();
        ctx.rect(tx, rowY, ts, ts);
        ctx.clip();
        PC.drawCover(ctx, img, tx, rowY, ts, ts);
        ctx.restore();
      } catch {
        ctx.fillStyle = '#cccccc';
        ctx.fillRect(tx, rowY, ts, ts);
      }

      if (isLast) {
        const label = `+${(images.length - 1 - i).toString()}`;
        ctx.fillStyle = 'rgba(0,0,0,0.52)';
        ctx.fillRect(tx, rowY, ts, ts);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(label, tx + (ts - ctx.measureText(label).width) / 2, rowY + ts / 2 + 8);
      }
    }
  }

  // 3. 首图底部渐变过渡
  const grad = ctx.createLinearGradient(0, imgH - 80, 0, imgH);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, '#ffffff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, imgH - 80, W, 80);

  // 4. 头像 + 昵称 + 时间
  const infoY = imgH - 80;
  const AV = 144;
  _drawAvatar(ctx, postData, avatar, PAD, infoY, AV);

  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 50px sans-serif';
  ctx.fillText(PC.truncateText(ctx, name, W - PAD * 2 - AV - 16), PAD + AV + 16, infoY + 88);
  ctx.fillStyle = '#bbbbbb';
  ctx.font = '42px sans-serif';
  ctx.fillText(PC.truncateText(ctx, time, W - PAD * 2 - AV - 16), PAD + AV + 16, infoY + 142);

  // 5. 正文摘要（3 行）
  const textY = infoY + AV + 60;
  ctx.font = '56px sans-serif';
  ctx.fillStyle = '#111111';
  PC.drawText(ctx, content, PAD, textY, W - PAD * 2, 64, 3);

  return PC.finalize(canvas, scope);
}

// ── 无图版 ────────────────────────────────────────────────────────────

function _drawTextOnly(
  canvas: WechatMiniprogram.Canvas,
  scope: WxScope,
  postData: PostData,
  avatar: WechatMiniprogram.Image | null,
): Promise<string> {
  const { ctx, W, H } = PC.initCanvas(canvas);
  const { name, time, content } = postData;
  const PAD = 32;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  PC.drawTopBar(ctx);

  // 大引号装饰
  ctx.fillStyle = 'rgba(22,119,255,0.06)';
  ctx.font = 'bold 320px serif';
  ctx.fillText('\u201C', PAD - 30, 310);

  // 正文（5 行）
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 66px sans-serif';
  const textEndY = PC.drawText(ctx, content, PAD, 160, W - PAD * 2, 96, 5);

  // 分割线
  const divY = Math.min(Math.max(textEndY + 16, 620), H - 208);
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, divY);
  ctx.lineTo(W - PAD, divY);
  ctx.stroke();

  // 头像 + 昵称 + 时间
  const infoY = divY + 36;
  const AV = 140;
  _drawAvatar(ctx, postData, avatar, PAD, infoY, AV);

  ctx.fillStyle = '#111111';
  ctx.font = 'bold 50px sans-serif';
  ctx.fillText(PC.truncateText(ctx, name, W - PAD * 2 - AV - 20 - 314), PAD + AV + 20, infoY + 62);
  ctx.fillStyle = '#bbbbbb';
  ctx.font = '42px sans-serif';
  ctx.fillText(PC.truncateText(ctx, time, W - PAD * 2 - AV - 20 - 314), PAD + AV + 20, infoY + 122);

  // 胶囊按钮
  const btnW = 290;
  const btnH = 122;
  const btnR = 62;
  const btnX = W - PAD - btnW;
  const btnY = infoY + (AV - btnH) / 2;
  const btnText = '查看全文';
  ctx.fillStyle = PC.BLUE;
  PC.roundRect(ctx, btnX, btnY, btnW, btnH, btnR);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  const labelW = ctx.measureText(btnText).width;
  const labelX = btnX + (btnW - labelW - 30) / 2;
  const centerY = btnY + btnH / 2;
  PC.drawVerticallyCenteredText(ctx, btnText, labelX, centerY, 44);
  const arrowX = labelX + labelW + 16;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(arrowX, centerY - 12);
  ctx.lineTo(arrowX + 12, centerY);
  ctx.lineTo(arrowX, centerY + 12);
  ctx.stroke();

  return PC.finalize(canvas, scope);
}
