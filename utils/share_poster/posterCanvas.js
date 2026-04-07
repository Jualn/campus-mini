// utils/posterCanvas.js
// 所有分享卡片共用的底层工具方法
// 使用方式：import * as PC from '../../utils/posterCanvas'

const W = 1080;
const H = 864;
const BLUE = '#1677ff';

/**
 * 初始化画布，返回 { canvas, ctx }
 * 自动处理 dpr 缩放
 */
function initCanvas(canvasNode) {
  const dpr = wx.getWindowInfo().pixelRatio;
  const ctx = canvasNode.getContext('2d');
  canvasNode.width = W * dpr;
  canvasNode.height = H * dpr;
  ctx.scale(dpr, dpr);
  return {
    ctx,
    W,
    H,
    dpr
  };
}

/**
 * 获取 Canvas 节点（Promise 封装）
 * @param {string} selector  CSS 选择器，如 '#posterCanvas'
 * @param {object} scope     Page 实例，传 this
 */
function getCanvasNode(selector, scope) {
  return new Promise((resolve, reject) => {
    const query = wx.createSelectorQuery().in(scope);
    query.select(selector).fields({
      node: true,
      size: true
    }).exec((res) => {
      if (res[0] && res[0].node) {
        resolve(res[0].node);
      } else {
        reject(new Error('Canvas 节点未找到'));
      }
    });
  });
}

/**
 * 加载图片（Promise 封装）
 */
function loadImage(canvasNode, src) {
  return new Promise((resolve, reject) => {
    const img = canvasNode.createImage();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`图片加载失败: ${src}`));
    img.src = src;
  });
}

/**
 * object-fit: cover 模式绘制图片（居中裁剪，不变形）
 */
function drawCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const ar = w / h;
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
}

/**
 * 绘制圆形头像，失败时显示灰色占位圆
 */
async function drawCircleImage(canvasNode, ctx, src, x, y, size) {
  try {
    const img = await loadImage(canvasNode, src);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  } catch (e) {
    ctx.fillStyle = '#dddddd';
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 绘制文字头像（纯色背景 + 首字母）
 * @param {Object} ctx - canvas 上下文
 * @param {String} text - 要展示的文字（avatarChar）
 * @param {String} bgColor - 背景颜色（avatarBg）
 * @param {Number} x - 起始 x 坐标
 * @param {Number} y - 起始 y 坐标
 * @param {Number} size - 头像尺寸
 */
function drawTextAvatar(ctx, text, bgColor, x, y, size) {
  ctx.save();

  const centerX = x + size / 2;
  const centerY = y + size / 2;

  // 圆
  ctx.beginPath();
  ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = bgColor;
  ctx.fill();

  // 字体
  const fontSize = size * 0.35;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 👇 关键：微调
  const offsetY = size * 0.05;

  ctx.fillText(text.charAt(0), centerX, centerY + offsetY);


  ctx.restore();
}

/**
 * 绘制圆角矩形路径（不 fill/stroke，由调用方决定）
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * 多行文本绘制，自动换行+末行省略
 * @returns {number} 文字绘制结束后的 Y 坐标
 */
function drawText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  let line = '',
    lineCount = 0,
    currentY = y;
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
}

/**
 * 单行文本截断（超出加省略号）
 * @returns {string} 处理后的字符串
 */
function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (ctx.measureText(t + '...').width > maxWidth && t.length > 0) t = t.slice(0, -1);
  return t + '...';
}

/**
 * 绘制顶部蓝色细横条（所有无图卡片统一用）
 */
function drawTopBar(ctx, color = BLUE) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, 12);
}

/**
 * 保存画布为临时文件，回调 success(tempFilePath)
 */
function saveToTempFile(canvasNode, scope, success) {
  wx.canvasToTempFilePath({
    canvas: canvasNode,
    success: (res) => success(res.tempFilePath),
    fail: (err) => console.error('保存失败', err)
  }, scope);
}

/**
 * 绘制完成的统一收尾（toast + 保存）
 */
function finalize(canvasNode, scope, onSuccess) {
  saveToTempFile(canvasNode, scope, onSuccess);
}

module.exports = {
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