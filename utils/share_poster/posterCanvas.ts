// posterCanvas.ts

export const W = 1080;
export const H = 864;
export const BLUE = '#1677ff';

// ── 类型定义 ──────────────────────────────────────────────────────────

// 新增渐变接口
export interface WxGradient {
  addColorStop(offset: number, color: string): void;
}

/** WX Canvas 2D 上下文的最小接口（只声明本文件实际用到的方法） */
export interface Ctx2D {
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
  measureText(text: string): {
    width: number;
    actualBoundingBoxAscent?: number;
    actualBoundingBoxDescent?: number;
  };
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

export function initCanvas(canvasNode: WechatMiniprogram.Canvas): CanvasInit {
  // 设计坐标即输出像素，不再按设备 DPR 重复放大 1080px 海报。
  const dpr = 1;
  const ctx = canvasNode.getContext('2d') as unknown as Ctx2D;
  canvasNode.width = W * dpr;
  canvasNode.height = H * dpr;
  ctx.scale(dpr, dpr);
  return { ctx, W, H, dpr };
}

export function getCanvasNode(selector: string, scope: WxScope): Promise<WechatMiniprogram.Canvas> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('画布初始化超时'));
    }, 3000);
    wx.nextTick(() => {
      wx.createSelectorQuery()
        .in(scope)
        .select(selector)
        .fields({ node: true, size: true })
        .exec((res) => {
          clearTimeout(timer);
          const canvas = (res as unknown as { node?: WechatMiniprogram.Canvas }[])[0]?.node;
          if (canvas) resolve(canvas);
          else reject(new Error('Canvas 节点未找到'));
        });
    });
  });
}

// ── 图片 ─────────────────────────────────────────────────────────────

export function loadImage(canvasNode: WechatMiniprogram.Canvas, src: string): Promise<WxImage> {
  return new Promise((resolve, reject) => {
    const img = canvasNode.createImage();
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('图片加载超时'));
    }, 8000);
    const cleanup = () => {
      clearTimeout(timer);
      img.onload = () => {
        /* ignore late events */
      };
      img.onerror = () => {
        /* ignore late events */
      };
    };
    img.onload = () => {
      cleanup();
      resolve(img);
    };
    img.onerror = () => {
      cleanup();
      reject(new Error('图片加载失败'));
    };
    img.src = src;
  });
}

/** 可选图片加载失败时返回 null，由模板选择占位或纯文字布局。 */
export async function optionalImage(
  canvasNode: WechatMiniprogram.Canvas,
  src?: string,
): Promise<WechatMiniprogram.Image | null> {
  if (!src) return null;
  try {
    return await loadImage(canvasNode, src);
  } catch {
    return null;
  }
}

export function drawCover(
  ctx: Ctx2D,
  img: WxImage,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
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

export async function drawCircleImage(
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
    drawCover(ctx, img, x, y, size, size);
    ctx.restore();
  } catch {
    ctx.fillStyle = '#dddddd';
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── 文字与图形 ────────────────────────────────────────────────────────

/** 以可见字形而不是字体 em 框居中；旧运行时缺少边界指标时使用字号兜底。 */
export function drawVerticallyCenteredText(
  ctx: Ctx2D,
  value: string,
  x: number,
  centerY: number,
  fontSize: number,
): void {
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  const { actualBoundingBoxAscent: ascent, actualBoundingBoxDescent: descent } =
    ctx.measureText(value);
  const offset =
    typeof ascent === 'number' &&
    typeof descent === 'number' &&
    Number.isFinite(ascent) &&
    Number.isFinite(descent) &&
    ascent + descent > 0
      ? (ascent - descent) / 2
      : fontSize * 0.35;
  ctx.fillText(value, x, centerY + offset);
  ctx.restore();
}

export function drawTextAvatar(
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

  const fontSize = size * 0.35;
  ctx.font = `bold ${String(fontSize)}px sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  drawVerticallyCenteredText(ctx, Array.from(text)[0] ?? '?', cx, cy, fontSize);
  ctx.restore();
}

export function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 支持显式换行及 Unicode 码点，最后一行按真实宽度留出省略号。 */
export function wrapText(
  ctx: Pick<Ctx2D, 'measureText'>,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  if (!text || maxWidth <= 0 || maxLines <= 0) return [];
  const chars = Array.from(text.replace(/\r\n?/g, '\n'));
  const lines: string[] = [];
  let line = '';
  let overflow = false;
  for (const char of chars) {
    if (char === '\n' || (line && ctx.measureText(line + char).width > maxWidth)) {
      let carry = '';
      if (char !== '\n' && /^[，。！？、：；）》」』】…,.!?;:%]$/.test(char)) {
        const previous = Array.from(line);
        carry = previous.pop() ?? '';
        line = previous.join('');
      }
      lines.push(line);
      if (lines.length === maxLines) {
        overflow = true;
        break;
      }
      line = char === '\n' ? '' : carry + char;
    } else {
      line += char;
    }
  }
  if (lines.length < maxLines) lines.push(line);
  if (overflow) {
    const last = Array.from(lines[lines.length - 1]);
    while (last.length && ctx.measureText(last.join('') + '…').width > maxWidth) last.pop();
    lines[lines.length - 1] = last.join('') + '…';
  }
  return lines;
}

export function drawText(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const lines = wrapText(ctx, text, maxWidth, maxLines);
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
  return y + lines.length * lineHeight;
}

export function truncateText(ctx: Ctx2D, text: string, maxWidth: number): string {
  return wrapText(ctx, text.replace(/\s+/g, ' '), maxWidth, 1)[0] || '';
}

// ── 绘制工具 ─────────────────────────────────────────────────────────

export function drawTopBar(ctx: Ctx2D, color: string = BLUE): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, 12);
}

// ── 保存与收尾 ────────────────────────────────────────────────────────

/** Promise 覆盖绘制后的导出过程；失败可由页面展示重试。 */
export function finalize(canvasNode: WechatMiniprogram.Canvas, scope: WxScope): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('分享图片导出超时'));
    }, 8000);
    wx.canvasToTempFilePath(
      {
        canvas: canvasNode,
        destWidth: W,
        destHeight: H,
        fileType: 'png',
        success: (res) => {
          clearTimeout(timer);
          resolve(res.tempFilePath);
        },
        fail: (err) => {
          clearTimeout(timer);
          reject(new Error(err.errMsg || '分享图片导出失败'));
        },
      },
      scope,
    );
  });
}
