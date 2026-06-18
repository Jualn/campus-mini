// posterCanvas.ts

import createLogger from '../logger';

const W = 1080;
const H = 864;
const BLUE = '#1677ff';

const log = createLogger('PosterCanvas');

// ── 类型定义 ──────────────────────────────────────────────────────────

// 新增渐变接口
export interface WxGradient {
  addColorStop(offset: number, color: string): void;
}

/** WX Canvas 2D 上下文的最小接口（只声明本文件实际用到的方法） */
interface Ctx2D {
  fillStyle: string | WxGradient; // 原来是 string，改为支持渐变
  strokeStyle: string | WxGradient;
  lineWidth: number;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): WxGradient;
  rect(x: number, y: number, w: number, h: number): void;
  stroke(): void;
  lineTo(x: number, y: number): void;
  scale(x: number, y: number): void;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  clip(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  drawImage(
    image: WechatMiniprogram.Image,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  drawImage(image: WechatMiniprogram.Image, dx: number, dy: number, dw: number, dh: number): void;
  measureText(text: string): { width: number };
  font: string;
  textAlign: 'left' | 'right' | 'center' | 'start' | 'end';
  textBaseline: 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom';
}

type WxImage = WechatMiniprogram.Image;
export type WxScope =
  | WechatMiniprogram.Component.TrivialInstance
  | WechatMiniprogram.Page.TrivialInstance;

interface CanvasInit {
  ctx: Ctx2D;
  W: number;
  H: number;
  dpr: number;
}

// ── 初始化 ────────────────────────────────────────────────────────────

function initCanvas(canvasNode: WechatMiniprogram.Canvas): CanvasInit {
  const dpr = wx.getWindowInfo().pixelRatio;
  const ctx = canvasNode.getContext('2d') as unknown as Ctx2D;
  canvasNode.width = W * dpr;
  canvasNode.height = H * dpr;
  ctx.scale(dpr, dpr);
  return { ctx, W, H, dpr };
}

function getCanvasNode(selector: string, scope: WxScope): Promise<WechatMiniprogram.Canvas> {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery()
      .in(scope)
      .select(selector)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res[0]?.node) {
          resolve(res[0].node as WechatMiniprogram.Canvas);
        } else {
          reject(new Error('Canvas 节点未找到'));
        }
      });
  });
}

// ── 图片 ─────────────────────────────────────────────────────────────

function loadImage(canvasNode: WechatMiniprogram.Canvas, src: string): Promise<WxImage> {
  return new Promise((resolve, reject) => {
    const img = canvasNode.createImage();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      reject(new Error(`图片加载失败: ${src}`));
    };
    img.src = src;
  });
}

function drawCover(ctx: Ctx2D, img: WxImage, x: number, y: number, w: number, h: number): void {
  const ir = img.width / img.height;
  const ar = w / h;
  let sx: number, sy: number, sw: number, sh: number;

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
}

async function drawCircleImage(
  canvasNode: WechatMiniprogram.Canvas,
  ctx: Ctx2D,
  src: string,
  x: number,
  y: number,
  size: number,
): Promise<void> {
  try {
    const img = await loadImage(canvasNode, src);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  } catch {
    ctx.fillStyle = '#dddddd';
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── 文字与图形 ────────────────────────────────────────────────────────

function drawTextAvatar(
  ctx: Ctx2D,
  text: string,
  bgColor: string,
  x: number,
  y: number,
  size: number,
): void {
  ctx.save();
  const cx = x + size / 2;
  const cy = y + size / 2;

  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = bgColor;
  ctx.fill();

  ctx.font = `bold ${String(size * 0.35)}px sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.charAt(0), cx, cy + size * 0.05);
  ctx.restore();
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawText(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  let line = '';
  let lineCount = 0;
  let currentY = y;

  const safeText = text == null ? '' : String(text);

  if (!safeText) {
    return y;
  }

  for (let n = 0; n < safeText.length ; n++) {
    const testLine = line + safeText[n];
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      lineCount++;
      if (lineCount === maxLines) {
        let t = line;
        while (ctx.measureText(t + '...').width > maxWidth && t.length > 0) {
          t = t.slice(0, -1);
        }
        ctx.fillText(t + '...', x, currentY);
        return currentY + lineHeight;
      }
      ctx.fillText(line, x, currentY);
      line = safeText[n];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
  return currentY + lineHeight;
}

function truncateText(ctx: Ctx2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (ctx.measureText(t + '...').width > maxWidth && t.length > 0) {
    t = t.slice(0, -1);
  }
  return t + '...';
}

// ── 绘制工具 ─────────────────────────────────────────────────────────

function drawTopBar(ctx: Ctx2D, color: string = BLUE): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, 12);
}

// ── 保存与收尾 ────────────────────────────────────────────────────────

function saveToTempFile(
  canvasNode: WechatMiniprogram.Canvas,
  scope: WxScope,
  success: (tempFilePath: string) => void,
): void {
  wx.canvasToTempFilePath(
    {
      canvas: canvasNode,
      success: (res) => {
        success(res.tempFilePath);
      },
      fail: (err) => {
        log.error('saveToTempFile', '保存失败', err);
      },
    },
    scope,
  );
}

function finalize(
  canvasNode: WechatMiniprogram.Canvas,
  scope: WxScope,
  onSuccess: (tempFilePath: string) => void,
): void {
  saveToTempFile(canvasNode, scope, onSuccess);
}

export default {
  W,
  H,
  BLUE,
  initCanvas,
  getCanvasNode,
  loadImage,
  drawCover,
  drawCircleImage,
  drawTextAvatar,
  roundRect,
  drawText,
  truncateText,
  drawTopBar,
  finalize,
};
