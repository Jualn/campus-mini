// import createLogger from '../../utils/logger';

// const { drawPostPoster } = require('../../utils/share_poster/postPoster');
// const { drawActivityPoster } = require('../../utils/share_poster/activityPoster');
// const { drawExamPoster } = require('../../utils/share_poster/examPoster');

// type TestPageData = {
//   postData: {
//     avatar: string;
//     name: string;
//     time: string;
//     content: string;
//     images: string[];
//   };
//   activityData: {
//     title: string;
//     time: string;
//     location: string;
//     maxPeople: number | null;
//     cover: string;
//   };
//   examData: {
//     name: string;
//     tags: string[];
//     level: string;
//     enrollTime: string;
//     examTime: string;
//     desc: string;
//   };
//   image: string;
// };

// const log = createLogger('TestPage');

const API_BASE = 'http://127.0.0.1:8080';

type AiFieldKey =
  | 'title'
  | 'category'
  | 'organizer'
  | 'audience_scope'
  | 'start_time'
  | 'end_time'
  | 'enroll_deadline'
  | 'max_participants'
  | 'location'
  | 'join_method'
  | 'contact_info'
  | 'timelineItems'
  | 'content';

type FormFieldKey =
  | 'title'
  | 'category'
  | 'organizer'
  | 'audience_scope'
  | 'start_time'
  | 'end_time'
  | 'enroll_deadline'
  | 'max_participants'
  | 'location'
  | 'join_method'
  | 'contact_info'
  | 'timeline'
  | 'content'
  | 'qrcode_url';

type AiPhase = 'idle' | 'uploading' | 'thinking' | 'filling' | 'done' | 'error';

interface CategoryOption {
  label: string;
  value: number;
}

interface AudienceOption {
  label: string;
  bit: number;
  selected: boolean;
}

interface AiFile {
  name: string;
  path: string;
  size: number;
  sizeText: string;
  ext: 'pdf' | 'doc' | 'docx';
}

interface ContactItem {
  name: string;
  phone: string;
  expanded?: boolean;
}

interface TimelineItem {
  label: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  sort_order: number;
  expanded?: boolean;
}

interface QrcodeImage {
  path: string;
  previewUrl: string;
  url?: string;
  status: 'local' | 'uploading' | 'uploaded' | 'error';
}

interface UploadedAttachment {
  name: string;
  path: string;
  size: number;
  sizeText: string;
  ext: string;
  url?: string;
  status: 'local' | 'uploading' | 'uploaded' | 'error';
}

interface ActivityForm {
  title: string;
  category: number;
  organizer: string;
  audience_scope: number;
  start_time: string;
  end_time: string;
  enroll_deadline: string;
  max_participants: string;
  location: string;
  join_method: string;
  contact_info: ContactItem[];
  timeline: TimelineItem[];
  content: string;
  qrcode_url: string;
}

interface AiStatus {
  phase: AiPhase;
  text: string;
  activeField: AiFieldKey | '';
  activeLabel: string;
  activeSubText: string;
  skippedLabels: string[];
}

interface AiStreamEvent {
  f?: AiFieldKey;
  v?: unknown;
  type?: string;
  message?: string;
  m?: string;
  done?: boolean;
  append?: boolean;
}

const CATEGORY_OPTIONS: CategoryOption[] = [
  { label: '其他', value: 0 },
  { label: '文体比赛', value: 1 },
  { label: '志愿公益', value: 2 },
  { label: '思政主题', value: 3 },
  { label: '学术讲座', value: 4 },
  { label: '体育运动', value: 5 },
];

const AUDIENCE_OPTIONS_BASE: AudienceOption[] = [
  { label: '全院', bit: 0, selected: false },
  { label: '信息', bit: 1, selected: false },
  { label: '理工', bit: 2, selected: false },
  { label: '财经', bit: 3, selected: false },
  { label: '人文', bit: 4, selected: false },
  { label: '基础', bit: 5, selected: false },
];

const FIELD_LABEL_MAP: Record<AiFieldKey, string> = {
  title: '活动标题',
  category: '活动分类',
  organizer: '主办/承办单位',
  audience_scope: '参与范围',
  start_time: '活动开始时间',
  end_time: '活动结束时间',
  enroll_deadline: '报名截止时间',
  max_participants: '最大参与人数',
  location: '活动地点',
  join_method: '参与方式',
  contact_info: '联系人',
  timelineItems: '活动时间线',
  content: '活动详情',
};

const AI_TO_FORM_FIELD_MAP: Record<AiFieldKey, FormFieldKey> = {
  title: 'title',
  category: 'category',
  organizer: 'organizer',
  audience_scope: 'audience_scope',
  start_time: 'start_time',
  end_time: 'end_time',
  enroll_deadline: 'enroll_deadline',
  max_participants: 'max_participants',
  location: 'location',
  join_method: 'join_method',
  contact_info: 'contact_info',
  timelineItems: 'timeline',
  content: 'content',
};

const THINKING_TEXTS = [
  'AI 正在阅读活动文件...',
  'AI 正在识别活动标题和分类...',
  'AI 正在提取时间、地点和参与方式...',
  'AI 正在整理联系人与活动时间线...',
  'AI 正在准备填写表单...',
];

// 滚动到表单字段的选择器
const AI_FIELD_SELECTOR_MAP: Record<AiFieldKey, string> = {
  title: '#field-title',
  category: '#field-category',
  organizer: '#field-organizer',
  audience_scope: '#field-audience_scope',
  start_time: '#field-start_time',
  end_time: '#field-end_time',
  enroll_deadline: '#field-enroll_deadline',
  max_participants: '#field-max_participants',
  location: '#field-location',
  join_method: '#field-join_method',
  contact_info: '#field-contact_info',
  timelineItems: '#field-timelineItems',
  content: '#field-content',
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSize(size: number) {
  if (!size) return '0 KB';

  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getExt(name: string) {
  return (name || '').split('.').pop()?.toLowerCase() ?? '';
}

function isAllowedDocExt(ext: string) {
  return ['pdf', 'doc', 'docx'].includes(ext);
}

function todayDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeDateTime(value: string) {
  if (!value) {
    return {
      date: todayDate(),
      time: '00:00',
    };
  }

  const [date, timeRaw = '00:00:00'] = value.split(' ');
  const [hh = '00', mm = '00'] = timeRaw.split(':');

  return {
    date,
    time: `${hh}:${mm}`,
  };
}

function combineDateTime(date: string, time: string) {
  return `${date} ${time}:00`;
}

function buildAudienceMask(options: AudienceOption[]) {
  return options.reduce((mask, item) => {
    if (!item.selected) return mask;
    return mask | (1 << item.bit);
  }, 0);
}

function buildAudienceOptionsFromMask(mask: number) {
  const hasFull = Boolean(mask & 1);

  return AUDIENCE_OPTIONS_BASE.map((item) => {
    if (hasFull) {
      return {
        ...item,
        selected: item.bit === 0,
      };
    }

    return {
      ...item,
      selected: Boolean(mask & (1 << item.bit)),
    };
  });
}

function decodeChunk(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  try {
    const encoded = Array.from(bytes)
      .map((byte) => `%${byte.toString(16).padStart(2, '0')}`)
      .join('');

    return decodeURIComponent(encoded);
  } catch {
    return String.fromCharCode.apply(null, Array.from(bytes));
  }
}

Page({
  // data: {
  //   postData: {
  //     avatar: '/images/1760004156926.jpg',
  //     name: '前端小天才',
  //     time: '2023-10-25 14:30',
  //     content: '今天天气真不错，和朋友们一起出去露营。这也是一段很长很长的文本，用来测试 Canvas 是否能够正常的进行多行文本的自动换行处理，如果超出三行应该怎么显示呢？我们拭目以待。',
  //     images: [],
  //   },
  //   activityData: {
  //     title: '2024年终技术分享会 · 前端专场,挂机啊圣诞快乐感给撒旦干撒的是德国的受到了',
  //     time: '2024年12月28日 14:00–18:00',
  //     location: '北京市朝阳区望京SOHO T1栋 3层会议室',
  //     maxPeople: 100,
  //     cover: '/images/1760004156926.jpg',
  //   },
  //   examData: {
  //     name: '大学英语四级（CET-4）',
  //     tags: ['英语', '全国统考'],
  //     level: '四级 / 六级',
  //     enrollTime: '2024年3月1日–3月15日',
  //     examTime: '2024年6月15日',
  //     desc: '全国大学英语四六级考试，测评听力、阅读、写作等综合能力，成绩长期有效，是求职简历的重要加分项。',
  //   },

  //   image: '',
  // } as TestPageData,

  // onShareAppMessage(this: any) {
  //   return {
  //     imageUrl: this.data.image,
  //   };
  // },

  // async onTapShare(this: any) {
  //   // await drawPostPoster(this, this.data.postData, (tempFilePath) => {
  //   //   this.setData({
  //   //     image: tempFilePath
  //   //   })
  //   // })
  //   // await drawActivityPoster(this, this.data.activityData, (tempFilePath) => {
  //   //   this.setData({
  //   //     image: tempFilePath
  //   //   })
  //   // })
  //   await drawExamPoster(this, this.data.examData, (tempFilePath: string) => {
  //     this.setData({
  //       image: tempFilePath,
  //     });
  //   });
  // },

  // async drawPoster(this: any) {
  //   wx.showLoading({
  //     title: '绘制中...',
  //   });
  //   try {
  //     const { images } = this.data.postData;
  //     if (images && images.length > 0) {
  //       await this.drawWithImages();
  //     } else {
  //       await this.drawTextOnly();
  //     }
  //   } catch (error) {
  //     wx.hideLoading();
  //     wx.showToast({
  //       title: '绘制失败',
  //       icon: 'error',
  //     });
  //     log.error('drawPoster', error);
  //   }
  // },

  // async drawWithImages(this: any) {
  //   const query = wx.createSelectorQuery();
  //   query.select('#posterCanvas').fields({
  //     node: true,
  //     size: true,
  //   }).exec(async (res: any) => {
  //     const canvas = res[0].node;
  //     const ctx = canvas.getContext('2d');
  //     const dpr = wx.getWindowInfo().pixelRatio;

  //     const W = 1080, H = 864;
  //     canvas.width = W * dpr;
  //     canvas.height = H * dpr;
  //     ctx.scale(dpr, dpr);

  //     const { avatar, name, time, content, images } = this.data.postData;
  //     const PAD = 40;
  //     const imgH = 560;

  //     ctx.fillStyle = '#ffffff';
  //     ctx.fillRect(0, 0, W, H);

  //     try {
  //       const img = await this.loadImage(canvas, images[0]);
  //       ctx.save();
  //       ctx.beginPath();
  //       ctx.rect(0, 0, W, imgH);
  //       ctx.clip();
  //       this.drawCover(ctx, img, 0, 0, W, imgH);
  //       ctx.restore();
  //     } catch {
  //       ctx.fillStyle = '#e8e8e8';
  //       ctx.fillRect(0, 0, W, imgH);
  //     }

  //     if (images.length > 1) {
  //       const ts = 96, tp = 6;
  //       const maxShow = Math.min(images.length - 1, 4);
  //       const rowX = W - PAD - maxShow * (ts + tp) + tp;
  //       const rowY = imgH - ts - PAD;

  //       for (let i = 0; i < maxShow; i++) {
  //         const tx = rowX + i * (ts + tp);
  //         const isLast = i === maxShow - 1 && images.length - 1 > maxShow;
  //         ctx.fillStyle = 'rgba(255,255,255,0.9)';
  //         ctx.fillRect(tx - 3, rowY - 3, ts + 6, ts + 6);
  //         try {
  //           const img = await this.loadImage(canvas, images[i + 1]);
  //           ctx.save();
  //           ctx.rect(tx, rowY, ts, ts);
  //           ctx.clip();
  //           this.drawCover(ctx, img, tx, rowY, ts, ts);
  //           ctx.restore();
  //         } catch {
  //           ctx.fillStyle = '#cccccc';
  //           ctx.fillRect(tx, rowY, ts, ts);
  //         }
  //         if (isLast) {
  //           ctx.fillStyle = 'rgba(0,0,0,0.52)';
  //           ctx.fillRect(tx, rowY, ts, ts);
  //           ctx.fillStyle = '#ffffff';
  //           ctx.font = 'bold 22px sans-serif';
  //           const label = `+${images.length - 1 - i}`;
  //           ctx.fillText(label, tx + (ts - ctx.measureText(label).width) / 2, rowY + ts / 2 + 8);
  //         }
  //       }
  //     }

  //     const grad = ctx.createLinearGradient(0, imgH - 80, 0, imgH);
  //     grad.addColorStop(0, 'rgba(255,255,255,0)');
  //     grad.addColorStop(1, '#ffffff');
  //     ctx.fillStyle = grad;
  //     ctx.fillRect(0, imgH - 80, W, 80);

  //     const infoY = imgH - 80;
  //     const AV = 156;
  //     await this.drawCircleImage(canvas, ctx, avatar, PAD, infoY, AV);

  //     ctx.fillStyle = '#1a1a1a';
  //     ctx.font = 'bold 50px sans-serif';
  //     ctx.fillText(name, PAD + AV + 16, infoY + 92);
  //     ctx.fillStyle = '#bbbbbb';
  //     ctx.font = '42px sans-serif';
  //     ctx.fillText(time, PAD + AV + 16, infoY + 150);

  //     const textY = infoY + AV + 65;
  //     ctx.font = '56px sans-serif';
  //     ctx.fillStyle = '#111111';
  //     this.drawText(ctx, content, PAD - 20, textY, W - (PAD - 20) * 2, 64, 3);

  //     this._finalize(canvas);
  //   });
  // },

  // async drawTextOnly(this: any) {
  //   const query = wx.createSelectorQuery();
  //   query.select('#posterCanvas').fields({
  //     node: true,
  //     size: true,
  //   }).exec(async (res: any) => {
  //     const canvas = res[0].node;
  //     const ctx = canvas.getContext('2d');
  //     const dpr = wx.getWindowInfo().pixelRatio;

  //     const W = 1080, H = 864;
  //     canvas.width = W * dpr;
  //     canvas.height = H * dpr;
  //     ctx.scale(dpr, dpr);

  //     const { avatar, name, time, content } = this.data.postData;
  //     const PAD = 0;
  //     const BLUE = '#1677ff';

  //     ctx.fillStyle = '#ffffff';
  //     ctx.fillRect(0, 0, W, H);
  //     ctx.fillStyle = BLUE;
  //     ctx.fillRect(0, 0, W, 12);
  //     ctx.fillStyle = 'rgba(22,119,255,0.06)';
  //     ctx.font = 'bold 320px serif';
  //     ctx.fillText('\u201C', PAD - 30, 310);

  //     ctx.fillStyle = '#111111';
  //     ctx.font = 'bold 66px sans-serif';
  //     const textEndY = this.drawText(ctx, content, PAD, 160, W - PAD * 2, 96, 5);

  //     const divY = Math.max(textEndY + 40, 620);
  //     ctx.strokeStyle = '#e8e8e8';
  //     ctx.lineWidth = 1.5;
  //     ctx.beginPath();
  //     ctx.moveTo(PAD, divY);
  //     ctx.lineTo(W - PAD, divY);
  //     ctx.stroke();

  //     const infoY = divY + 36;
  //     const AV = 140;
  //     await this.drawCircleImage(canvas, ctx, avatar, PAD, infoY, AV);

  //     ctx.fillStyle = '#111111';
  //     ctx.font = 'bold 50px sans-serif';
  //     ctx.fillText(name, PAD + AV + 20, infoY + 52);
  //     ctx.fillStyle = '#bbbbbb';
  //     ctx.font = '42px sans-serif';
  //     ctx.fillText(time, PAD + AV + 20, infoY + 122);

  //     const btnW = 290, btnH = 122, btnR = 62;
  //     const btnX = W - PAD - btnW;
  //     const btnY = infoY + (AV - btnH) / 2;
  //     ctx.fillStyle = BLUE;
  //     this.roundRect(ctx, btnX, btnY, btnW, btnH, btnR);
  //     ctx.fill();
  //     ctx.fillStyle = '#ffffff';
  //     ctx.font = 'bold 44px sans-serif';
  //     const btnText = '查看全文 >';
  //     ctx.fillText(btnText, btnX + (btnW - ctx.measureText(btnText).width) / 2, btnY + btnH / 2 + 15);

  //     this._finalize(canvas);
  //   });
  // },

  // _finalize(this: any, canvas: any) {
  //   wx.hideLoading();
  //   wx.showToast({
  //     title: '绘制成功',
  //     icon: 'success',
  //   });
  //   wx.canvasToTempFilePath({
  //     canvas,
  //     success: (res: any) => {
  //       this.setData({ image: res.tempFilePath });
  //     },
  //   }, this);
  // },

  // drawText(this: any, ctx: any, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  //   let line = '';
  //   let lineCount = 0;
  //   let currentY = y;
  //   for (let n = 0; n < text.length; n++) {
  //     const testLine = line + text[n];
  //     if (ctx.measureText(testLine).width > maxWidth && n > 0) {
  //       lineCount++;
  //       if (lineCount === maxLines) {
  //         let t = line;
  //         while (ctx.measureText(t + '...').width > maxWidth && t.length > 0) t = t.slice(0, -1);
  //         ctx.fillText(t + '...', x, currentY);
  //         return currentY + lineHeight;
  //       }
  //       ctx.fillText(line, x, currentY);
  //       line = text[n];
  //       currentY += lineHeight;
  //     } else {
  //       line = testLine;
  //     }
  //   }
  //   ctx.fillText(line, x, currentY);
  //   return currentY + lineHeight;
  // },

  // drawCover(this: any, ctx: any, img: any, x: number, y: number, w: number, h: number) {
  //   const ir = img.width / img.height;
  //   const ar = w / h;
  //   let sx: number, sy: number, sw: number, sh: number;
  //   if (ir > ar) {
  //     sh = img.height;
  //     sw = sh * ar;
  //     sx = (img.width - sw) / 2;
  //     sy = 0;
  //   } else {
  //     sw = img.width;
  //     sh = sw / ar;
  //     sx = 0;
  //     sy = (img.height - sh) / 2;
  //   }
  //   ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  // },

  // async drawCircleImage(this: any, canvas: any, ctx: any, src: string, x: number, y: number, size: number) {
  //   try {
  //     const img = await this.loadImage(canvas, src);
  //     ctx.save();
  //     ctx.beginPath();
  //     ctx.arc(x + size / 2, y + size / 2, size / 2, 0, 2 * Math.PI);
  //     ctx.clip();
  //     ctx.drawImage(img, x, y, size, size);
  //     ctx.restore();
  //   } catch {
  //     ctx.fillStyle = '#dddddd';
  //     ctx.beginPath();
  //     ctx.arc(x + size / 2, y + size / 2, size / 2, 0, 2 * Math.PI);
  //     ctx.fill();
  //   }
  // },

  // loadImage(this: any, canvas: any, src: string) {
  //   return new Promise<any>((resolve, reject) => {
  //     const img = canvas.createImage();
  //     img.onload = () => resolve(img);
  //     img.onerror = () => reject(new Error(`加载图片失败: ${src}`));
  //     img.src = src;
  //   });
  // },

  // roundRect(this: any, ctx: any, x: number, y: number, w: number, h: number, r: number) {
  //   ctx.beginPath();
  //   ctx.moveTo(x + r, y);
  //   ctx.arcTo(x + w, y, x + w, y + h, r);
  //   ctx.arcTo(x + w, y + h, x, y + h, r);
  //   ctx.arcTo(x, y + h, x, y, r);
  //   ctx.arcTo(x, y, x + w, y, r);
  //   ctx.closePath();
  // },
  fieldTaskQueue: Promise.resolve(),
  contentQueue: [] as string[],
  isAppendingContent: false,
  contentStarted: false,
  thinkingTimer: null,
  finishRequested: false,
  streamBuffer: '',
  behaviors:[],
  data: {
    categoryOptions: CATEGORY_OPTIONS,
    categoryIndex: 0,

    audienceOptions: AUDIENCE_OPTIONS_BASE,

    today: todayDate(),

    aiFile: null as AiFile | null,

    form: {
      title: '',
      category: 0,
      organizer: '',
      audience_scope: 0,
      start_time: '',
      end_time: '',
      enroll_deadline: '',
      max_participants: '',
      location: '',
      join_method: '',
      contact_info: [],
      timeline: [],
      content: '',
      qrcode_url: '',
    },

    aiStatus: {
      phase: 'idle',
      text: '上传活动文件后，AI 可以自动识别并填写表单',
      activeField: '',
      activeLabel: '',
      activeSubText: '',
      skippedLabels: [],
    },

    userLockedFields: {},

    qrcodeImage: null as QrcodeImage | null,

    attachmentFile: null as UploadedAttachment | null,
  },

  onUnload() {
    this.stopThinkingTicker();
  },

  scrollToSelectorCenter(selector: string, ratio = 0.28) {
    return new Promise<void>((resolve) => {
      wx.nextTick(() => {
        const query = wx.createSelectorQuery();

        query.select(selector).boundingClientRect();
        query.selectViewport().scrollOffset();

        query.exec((res) => {
          const rect = res?.[0];
          const viewport = res?.[1];

          if (!rect || !viewport) {
            resolve();
            return;
          }

          const windowHeight = wx.getWindowInfo().windowHeight;

          /**
           * ratio = 0.28 表示让目标元素顶部停在屏幕高度 28% 的位置
           * 也就是“中心偏上”
           *
           * 如果你想更靠中间：0.38
           * 如果你想更靠上：0.18
           */
          const targetScrollTop = viewport.scrollTop + rect.top - windowHeight * ratio;

          wx.pageScrollTo({
            scrollTop: Math.max(0, targetScrollTop),
            duration: 320,
            complete: () => {
              setTimeout(() => {
                resolve();
              }, 80);
            },
          });
        });
      });
    });
  },

  async scrollToAiField(aiField: AiFieldKey) {
    const selector = AI_FIELD_SELECTOR_MAP[aiField];

    if (!selector) return;

    await this.scrollToSelectorCenter(selector, 0.28);
  },

  async maybeFollowContentTail() {
    return new Promise<void>((resolve) => {
      wx.nextTick(() => {
        const query = wx.createSelectorQuery();

        query.select('#content-tail-anchor').boundingClientRect();
        query.select('#page-root').boundingClientRect();
        query.selectViewport().scrollOffset();

        query.exec((res) => {
          const tailRect = res?.[0];
          const pageRect = res?.[1];
          const viewport = res?.[2];

          if (!tailRect || !pageRect || !viewport) {
            resolve();
            return;
          }

          const windowHeight = wx.getWindowInfo().windowHeight;

          /**
           * tailRect.top 是尾部锚点相对当前屏幕顶部的位置。
           * 只有尾部超过屏幕 76% 时，才需要跟随。
           */
          const followLine = windowHeight * 0.76;

          /**
           * 如果尾部已经在可视区舒适范围内，就不滚。
           * 这样可以避免 content 刚开始写入时反复抽搐。
           */
          if (tailRect.top <= followLine) {
            resolve();
            return;
          }

          /**
           * 计算整个页面高度，用于判断是否已经到底。
           */
          const pageHeight = viewport.scrollTop + pageRect.bottom;
          const maxScrollTop = Math.max(0, pageHeight - windowHeight);

          /**
           * 目标不是把尾部拉到中间，而是轻轻拉回 68% 位置。
           */
          const targetLine = windowHeight * 0.68;
          const targetScrollTop = viewport.scrollTop + tailRect.top - targetLine;
          const safeTarget = Math.min(Math.max(0, targetScrollTop), maxScrollTop);

          /**
           * 如果已经接近底部，或者目标滚动距离很小，就不滚。
           */
          const delta = Math.abs(safeTarget - viewport.scrollTop);

          if (delta < 24 || viewport.scrollTop >= maxScrollTop - 8) {
            resolve();
            return;
          }

          wx.pageScrollTo({
            scrollTop: safeTarget,
            duration: 120,
            complete: () => resolve(),
          });
        });
      });
    });
  },

  isAiRunning() {
    const phase = this.data.aiStatus.phase;
    return phase === 'uploading' || phase === 'thinking' || phase === 'filling';
  },

  setAiStatus(partial: Partial<AiStatus>) {
    this.setData({
      aiStatus: {
        ...this.data.aiStatus,
        ...partial,
      },
    });
  },

  startThinkingTicker() {
    this.stopThinkingTicker();

    let index = 0;

    this.thinkingTimer = setInterval(() => {
      if (this.data.aiStatus.phase !== 'thinking') return;

      this.setData({
        'aiStatus.text': THINKING_TEXTS[index % THINKING_TEXTS.length],
      });

      index += 1;
    }, 1400);
  },

  stopThinkingTicker() {
    if (this.thinkingTimer) {
      clearInterval(this.thinkingTimer);
      this.thinkingTimer = null;
    }
  },

  hasValue(field: FormFieldKey, value: any): boolean {
    if (field === 'category') {
      return Number(value) !== 0;
    }

    if (field === 'audience_scope') {
      return Number(value) !== 0;
    }

    if (field === 'contact_info') {
      return (
        Array.isArray(value) &&
        value.some((item) => {
          return String(item.name || '').trim() || String(item.phone || '').trim();
        })
      );
    }

    if (field === 'timeline') {
      return Array.isArray(value) && value.length > 0;
    }

    return String(value ?? '').trim() !== '';
  },

  snapshotUserFilledFields() {
    const form = this.data.form;
    const oldLocked = this.data.userLockedFields || {};
    const nextLocked: Partial<Record<FormFieldKey, boolean>> = { ...oldLocked };

    const fields: FormFieldKey[] = [
      'title',
      'category',
      'organizer',
      'audience_scope',
      'start_time',
      'end_time',
      'enroll_deadline',
      'max_participants',
      'location',
      'join_method',
      'contact_info',
      'timeline',
      'content',
      'qrcode_url',
    ];

    fields.forEach((field) => {
      if (this.hasValue(field, form[field])) {
        nextLocked[field] = true;
      }
    });

    this.setData({
      userLockedFields: nextLocked,
    });
  },

  markFieldByUser(field: FormFieldKey, value: any) {
    this.setData({
      [`userLockedFields.${field}`]: this.hasValue(field, value),
    });
  },

  isFieldLocked(field: FormFieldKey) {
    return Boolean(this.data.userLockedFields[field]);
  },

  addSkippedField(aiField: AiFieldKey) {
    const label = FIELD_LABEL_MAP[aiField];
    const oldList = this.data.aiStatus.skippedLabels || [];

    if (oldList.includes(label)) return;

    this.setData({
      'aiStatus.skippedLabels': [...oldList, label],
    });
  },

  onTextInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as FormFieldKey;
    const value = e.detail.value;

    this.setData({
      [`form.${field}`]: value,
      [`userLockedFields.${field}`]: this.hasValue(field, value),
    });
  },

  onContentInput(e: WechatMiniprogram.Input) {
    const value = e.detail.value;

    this.setData({
      'form.content': value,
      'userLockedFields.content': this.hasValue('content', value),
    });
  },

  onCategoryChange(e: WechatMiniprogram.PickerChange) {
    if (this.data.aiStatus.activeField === 'category') return;

    const index = Number(e.detail.value);
    const selected = CATEGORY_OPTIONS[index];

    this.setData({
      categoryIndex: index,
      'form.category': selected.value,
      'userLockedFields.category': true,
    });
  },

  onToggleAudience(e: WechatMiniprogram.TouchEvent) {
    if (this.data.aiStatus.activeField === 'audience_scope') {
      wx.showToast({
        title: 'AI 正在填写参与范围',
        icon: 'none',
      });
      return;
    }

    const bit = Number(e.currentTarget.dataset.bit);
    let options = this.data.audienceOptions.map((item: AudienceOption) => ({ ...item }));

    if (bit === 0) {
      const fullOption = options.find((item: AudienceOption) => item.bit === 0);
      const nextFullSelected = !fullOption?.selected;

      options = options.map((item: AudienceOption) => ({
        ...item,
        selected: item.bit === 0 ? nextFullSelected : false,
      }));
    } else {
      options = options.map((item: AudienceOption) => {
        if (item.bit === 0) {
          return {
            ...item,
            selected: false,
          };
        }

        if (item.bit === bit) {
          return {
            ...item,
            selected: !item.selected,
          };
        }

        return item;
      });
    }

    const mask = buildAudienceMask(options);

    this.setData({
      audienceOptions: options,
      'form.audience_scope': mask,
      'userLockedFields.audience_scope': mask !== 0,
    });
  },

  onFormDateChange(e: WechatMiniprogram.PickerChange) {
    const field = e.currentTarget.dataset.field as FormFieldKey;
    const date = String(e.detail.value);
    const current = normalizeDateTime(this.data.form[field] as string);
    const next = combineDateTime(date, current.time);

    this.setData({
      [`form.${field}`]: next,
      [`userLockedFields.${field}`]: true,
    });
  },

  onFormTimeChange(e: WechatMiniprogram.PickerChange) {
    const field = e.currentTarget.dataset.field as FormFieldKey;
    const time = String(e.detail.value);
    const current = normalizeDateTime(this.data.form[field] as string);
    const next = combineDateTime(current.date, time);

    this.setData({
      [`form.${field}`]: next,
      [`userLockedFields.${field}`]: true,
    });
  },
  chooseAiFile(){
    const token = wx.getStorageSync('token')

const h5EntryUrl =
  `https://test.jualn.cn/third/wx/mp-oauth/start?token=${encodeURIComponent(token)}`

wx.navigateTo({
  url: '/subpkg_setting/pages/service-subscribe-webview/index?url=' +
    encodeURIComponent(h5EntryUrl)
})
  },
  // chooseAiFile() {
  //   if (this.isAiRunning()) {
  //     wx.showToast({
  //       title: 'AI 处理中，请稍后',
  //       icon: 'none',
  //     });
  //     return;
  //   }

  //   wx.chooseMessageFile({
  //     count: 1,
  //     type: 'file',
  //     extension: ['pdf', 'doc', 'docx'],
  //     success: (res) => {
  //       const tempFile = res.tempFiles[0];
  //       const name = tempFile.name || '';
  //       const ext = getExt(name);

  //       if (!isAllowedDocExt(ext)) {
  //         wx.showToast({
  //           title: '仅支持 PDF、DOC、DOCX',
  //           icon: 'none',
  //         });
  //         return;
  //       }

  //       this.setData({
  //         aiFile: {
  //           name,
  //           path: tempFile.path,
  //           size: tempFile.size,
  //           sizeText: formatSize(tempFile.size),
  //           ext: ext as 'pdf' | 'doc' | 'docx',
  //         },
  //       });
  //     },
  //   });
  // },

  removeAiFile() {
    if (this.isAiRunning()) {
      wx.showToast({
        title: 'AI 处理中，暂不能删除',
        icon: 'none',
      });
      return;
    }

    this.setData({
      aiFile: null,
    });
  },

  previewAiFile() {
    const file = this.data.aiFile;
    if (!file) return;

    wx.openDocument({
      filePath: file.path,
      showMenu: true,
      fail: () => {
        wx.showToast({
          title: '暂不支持预览该文件',
          icon: 'none',
        });
      },
    });
  },

  startAiFill() {
    if (!this.data.aiFile) {
      wx.showToast({
        title: '请先上传活动文件',
        icon: 'none',
      });
      return;
    }

    if (this.isAiRunning()) {
      wx.showToast({
        title: 'AI 正在处理中',
        icon: 'none',
      });
      return;
    }

    this.snapshotUserFilledFields();

    this.finishRequested = false;
    this.fieldTaskQueue = Promise.resolve();
    this.streamBuffer = '';

    this.setData({
      'aiStatus.phase': 'uploading',
      'aiStatus.text': '正在上传活动文件...',
      'aiStatus.activeField': '',
      'aiStatus.activeLabel': '',
      'aiStatus.activeSubText': '',
      'aiStatus.skippedLabels': [],
    });

    wx.uploadFile({
      url: `${API_BASE}/v1/activity/ai-extract/upload`,
      filePath: this.data.aiFile.path,
      name: 'file',
      header: {
        Authorization: `Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJsb2dpblR5cGUiOiJsb2dpbiIsImxvZ2luSWQiOjEsInJuU3RyIjoiOEtZMHdwSmVVcWlWVGtHS2ZFVGxzNHRIbjBCdkpocWEifQ.xtQMSWjM3VaMLKHNRZ3D2lH20sk-Q0TdQug6vFkGFIA`,
      },

      success: (res) => {
        try {
          const data = JSON.parse(res.data || '{}');
          const taskId = data.data.taskId;

          if (!taskId) {
            throw new Error('missing taskId');
          }

          this.startAiStream(taskId);
        } catch {
          this.setAiStatus({
            phase: 'error',
            text: '文件已上传，但后端未返回有效 taskId',
            activeField: '',
            activeLabel: '',
            activeSubText: '',
          });
        }
      },
      fail: () => {
        this.setAiStatus({
          phase: 'error',
          text: '文件上传失败，请稍后重试',
          activeField: '',
          activeLabel: '',
          activeSubText: '',
        });
      },
    });
  },

  startAiStream(taskId: string) {
    this.setAiStatus({
      phase: 'thinking',
      text: 'AI 正在阅读活动文件...',
      activeField: '',
      activeLabel: '',
      activeSubText: '',
    });

    this.startThinkingTicker();

    const requestTask = wx.request({
      url: `${API_BASE}/v1/activity/ai-extract/stream?taskId=${taskId}`,
      header: {
        Accept: 'text/event-stream',
        Authorization: `Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJsb2dpblR5cGUiOiJsb2dpbiIsImxvZ2luSWQiOjEsInJuU3RyIjoiOEtZMHdwSmVVcWlWVGtHS2ZFVGxzNHRIbjBCdkpocWEifQ.xtQMSWjM3VaMLKHNRZ3D2lH20sk-Q0TdQug6vFkGFIA`,
      },
      enableChunked: true,
      success: () => {
        this.finishAiWhenQueueEmpty();
      },
      fail: () => {
        this.stopThinkingTicker();

        this.setAiStatus({
          phase: 'error',
          text: 'AI 解析失败，请稍后重试',
          activeField: '',
          activeLabel: '',
          activeSubText: '',
        });
      },
    });

    requestTask.onChunkReceived((chunk: { data: ArrayBuffer }) => {
      const text = decodeChunk(chunk.data);
      if (!text) return;

      this.consumeStreamText(text);
    });
  },

  consumeStreamText(text: string) {
    const merged = this.streamBuffer + text;
    const lines = merged.split('\n');
    const rest = lines.pop() ?? '';

    this.streamBuffer = rest;

    lines.forEach((line) => {
      const clean = line.replace(/^data:\s*/, '').trim();

      if (!clean || clean === '[DONE]') {
        if (clean === '[DONE]') {
          this.finishAiWhenQueueEmpty();
        }
        return;
      }

      try {
        const event = JSON.parse(clean);
        this.handleAiStreamEvent(event);
      } catch {
        // 半包或非 JSON 行，忽略。
      }
    });
  },

  handleAiStreamEvent(event: AiStreamEvent) {
    if (!event) return;

    if (event.done || event.type === 'done') {
      this.finishAiWhenQueueEmpty();
      return;
    }

    if (event.type === 'thinking' || event.message || event.m) {
      this.setAiStatus({
        phase: 'thinking',
        text: event.message ?? event.m ?? 'AI 正在分析活动信息...',
        activeField: '',
        activeLabel: '',
        activeSubText: '',
      });
      return;
    }

    if (event.f) {
      this.stopThinkingTicker();
      this.enqueueAiFieldEvent(event as Required<Pick<AiStreamEvent, 'f' | 'v' | 'append'>>);
    }
  },

  enqueueAiFieldEvent(event: { f: AiFieldKey; v: unknown; append?: boolean }) {
    this.fieldTaskQueue = this.fieldTaskQueue.then(() => {
      return this.applyAiFieldEvent(event);
    });
  },

  async applyAiFieldEvent(event: { f: AiFieldKey; v: unknown; append?: boolean }) {
    const aiField = event.f;
    const value = event.v;
    const append = event.append;

    if (value === null || value === undefined || value === '') {
      return;
    }

    const formField = AI_TO_FORM_FIELD_MAP[aiField];

    if (this.isFieldLocked(formField)) {
      this.addSkippedField(aiField);
      return;
    }

    this.setAiStatus({
      phase: 'filling',
      text: `AI 正在填写：${FIELD_LABEL_MAP[aiField]}`,
      activeField: aiField,
      activeLabel: FIELD_LABEL_MAP[aiField],
      activeSubText: '',
    });

    if (aiField === 'content') {
      if (!this.contentStarted) {
        this.contentStarted = true;
        await this.scrollToAiField(aiField);
        await sleep(120);
      }

      if (append) {
        await this.enqueueContent(String(value || ''));
      } else {
        this.setData({
          'form.content': String(value || ''),
        });
      }
      return;
    }

    await this.scrollToAiField(aiField);

    if (aiField === 'contact_info') {
      await this.applyContactInfoSmoothly(Array.isArray(value) ? value : []);
      return;
    }

    if (aiField === 'timelineItems') {
      await this.applyTimelineSmoothly(Array.isArray(value) ? value : []);
      return;
    }

    if (aiField === 'category') {
      await this.applyCategoryByAi(Number(value));
      return;
    }

    if (aiField === 'audience_scope') {
      await this.applyAudienceByAi(Number(value));
      return;
    }

    await this.typeFormFieldSmoothly(formField, String(value));

    this.setAiStatus({
      activeField: '',
      activeLabel: '',
      activeSubText: '',
    });
  },

  async applyCategoryByAi(value: number) {
    const index = CATEGORY_OPTIONS.findIndex((item) => item.value === value);
    const safeIndex = index >= 0 ? index : 0;
    const safeValue = CATEGORY_OPTIONS[safeIndex].value;

    await sleep(420);

    this.setData({
      categoryIndex: safeIndex,
      'form.category': safeValue,
    });

    this.setAiStatus({
      activeField: '',
      activeLabel: '',
      activeSubText: '',
    });
  },

  async applyAudienceByAi(mask: number) {
    const safeMask = Number.isFinite(mask) ? mask : 0;
    const options = buildAudienceOptionsFromMask(safeMask);

    await sleep(420);

    this.setData({
      audienceOptions: options,
      'form.audience_scope': safeMask,
    });

    this.setAiStatus({
      activeField: '',
      activeLabel: '',
      activeSubText: '',
    });
  },

  async typeFormFieldSmoothly(field: FormFieldKey, text: string) {
    const value = text || '';
    const steps = Math.max(4, Math.min(14, value.length || 4));
    const interval = Math.max(32, Math.floor(520 / steps));

    for (let i = 1; i <= steps; i++) {
      const end = Math.ceil((value.length * i) / steps);

      this.setData({
        [`form.${field}`]: value.slice(0, end),
      });

      await sleep(interval);
    }
  },

  async enqueueContent(text: string) {
    if (!text.trim()) return;

    this.contentQueue.push(text);

    if (this.isAppendingContent) return;

    this.isAppendingContent = true;

    while (this.contentQueue.length) {
      const chunk = this.contentQueue.shift() ?? '';
      await this.appendContentSmoothly(chunk);
    }

    this.isAppendingContent = false;
  },

  async appendContentSmoothly(text: string) {
    const value = text || '';
    if (!value.trim()) return;

    this.setAiStatus({
      phase: 'filling',
      activeField: 'content',
      activeLabel: '活动详情',
      activeSubText: '正在追加活动详情内容',
      text: 'AI 正在填写：活动详情',
    });

    const oldText = this.data.form.content || '';
    const nextText = oldText + value;

    /**
     * content 第一次出现时，前面 applyAiFieldEvent 已经 scrollToAiField('content') 了。
     * 这里不要再主动滚到头，也不要马上滚到尾。
     */
    const steps = Math.max(6, Math.min(18, value.length || 6));
    const interval = Math.max(28, Math.floor(520 / steps));

    for (let i = 1; i <= steps; i++) {
      const end = Math.ceil((value.length * i) / steps);

      this.setData({
        'form.content': oldText + value.slice(0, end),
      });

      /**
       * 前 2 步不滚。
       * 因为这时候 content 还没明显增长，滚动最容易抽搐。
       */
      if (i > 2 && (i % 4 === 0 || i === steps)) {
        await this.maybeFollowContentTail();
      }

      await sleep(interval);
    }

    this.setData({
      'form.content': nextText,
    });

    /**
     * 最后只做一次“必要时跟随”，不是强制滚动。
     */
    await this.maybeFollowContentTail();

    this.setAiStatus({
      activeField: '',
      activeLabel: '',
      activeSubText: '',
    });
  },

  async applyContactInfoSmoothly(list: ContactItem[]) {
    if (!Array.isArray(list) || list.length === 0) return;

    this.setData({
      'form.contact_info': [],
      'aiStatus.activeField': 'contact_info',
      'aiStatus.activeLabel': '联系人',
      'aiStatus.activeSubText': '正在整理联系人信息',
    });

    for (let i = 0; i < list.length; i++) {
      const item = list[i] || {};

      const nextItem: ContactItem = {
        name: '',
        phone: '',
        expanded: true,
      };

      this.setData({
        'form.contact_info': [...this.data.form.contact_info, nextItem],
        'aiStatus.activeSubText': `正在填写联系人 ${i + 1}`,
      });

      await this.scrollToSelectorCenter(`#contact-card-${i}`, 0.34);

      await sleep(240);

      await this.typeContactField(i, 'name', item.name || '');
      await this.typeContactField(i, 'phone', item.phone || '');
    }

    this.setAiStatus({
      activeField: '',
      activeLabel: '',
      activeSubText: '',
    });
  },

  async typeContactField(index: number, key: 'name' | 'phone', text: string) {
    const value = String(text || '');
    const steps = Math.max(3, Math.min(8, value.length || 3));

    for (let i = 1; i <= steps; i++) {
      const end = Math.ceil((value.length * i) / steps);

      this.setData({
        [`form.contact_info[${index}].${key}`]: value.slice(0, end),
      });

      await sleep(45);
    }
  },

  async applyTimelineSmoothly(list: TimelineItem[]) {
    if (!Array.isArray(list) || list.length === 0) return;

    this.setData({
      'form.timeline': [],
      'aiStatus.activeField': 'timelineItems',
      'aiStatus.activeLabel': '活动时间线',
      'aiStatus.activeSubText': '正在生成活动时间线',
    });

    for (let i = 0; i < list.length; i++) {
      const item = list[i] || {};

      const nextItem: TimelineItem = {
        label: '',
        description: '',
        start_time: '',
        end_time: '',
        sort_order: i,
        expanded: true,
      };

      this.setData({
        'form.timeline': [...this.data.form.timeline, nextItem],
        'aiStatus.activeSubText': `正在填写时间节点 ${i + 1}`,
      });

      await this.scrollToSelectorCenter(`#timeline-card-${i}`, 0.32);

      await sleep(240);

      await this.typeTimelineField(i, 'label', item.label || '');
      await this.typeTimelineField(i, 'description', item.description || '');

      this.setData({
        [`form.timeline[${i}].start_time`]: item.start_time || '',
        [`form.timeline[${i}].end_time`]: item.end_time || '',
        [`form.timeline[${i}].sort_order`]: Number(item.sort_order ?? i),
      });

      await sleep(220);
    }

    this.setAiStatus({
      activeField: '',
      activeLabel: '',
      activeSubText: '',
    });
  },

  async typeTimelineField(index: number, key: 'label' | 'description', text: string) {
    const value = String(text || '');
    const steps = Math.max(3, Math.min(10, value.length || 3));

    for (let i = 1; i <= steps; i++) {
      const end = Math.ceil((value.length * i) / steps);

      this.setData({
        [`form.timeline[${index}].${key}`]: value.slice(0, end),
      });

      await sleep(42);
    }
  },

  finishAiWhenQueueEmpty() {
    if (this.finishRequested) return;

    this.finishRequested = true;

    this.fieldTaskQueue = this.fieldTaskQueue.then(async () => {
      this.stopThinkingTicker();

      const skipped = this.data.aiStatus.skippedLabels || [];

      this.setAiStatus({
        phase: 'done',
        text: skipped.length
          ? `AI 填写完成，已跳过你手动填写的字段：${skipped.join('、')}`
          : 'AI 填写完成，请检查后发布',
        activeField: '',
        activeLabel: '',
        activeSubText: '',
      });
    });
  },

  addContact() {
    const list = this.data.form.contact_info || [];

    this.setData({
      'form.contact_info': [
        ...list,
        {
          name: '',
          phone: '',
          expanded: true,
        },
      ],
      'userLockedFields.contact_info': true,
    });
  },

  removeContact(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    const list = this.data.form.contact_info.filter((_: ContactItem, i: number) => i !== index);

    this.setData({
      'form.contact_info': list,
      'userLockedFields.contact_info': this.hasValue('contact_info', list),
    });
  },

  toggleContactExpand(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.form.contact_info[index];

    this.setData({
      [`form.contact_info[${index}].expanded`]: !item.expanded,
    });
  },

  onContactInput(e: WechatMiniprogram.Input) {
    const index = Number(e.currentTarget.dataset.index);
    const key = e.currentTarget.dataset.key as 'name' | 'phone';
    const value = e.detail.value;

    this.setData({
      [`form.contact_info[${index}].${key}`]: value,
    });

    const nextList = this.data.form.contact_info.map((item: ContactItem, i: number) => {
      if (i !== index) return item;
      return {
        ...item,
        [key]: value,
      };
    });

    this.setData({
      'userLockedFields.contact_info': this.hasValue('contact_info', nextList),
    });
  },

  addTimelineNode() {
    const list = this.data.form.timeline || [];

    this.setData({
      'form.timeline': [
        ...list,
        {
          label: '',
          description: '',
          start_time: '',
          end_time: '',
          sort_order: list.length,
          expanded: true,
        },
      ],
      'userLockedFields.timeline': true,
    });
  },

  removeTimelineNode(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);

    const list = this.data.form.timeline
      .filter((_: TimelineItem, i: number) => i !== index)
      .map((item: TimelineItem, i: number) => ({
        ...item,
        sort_order: i,
      }));

    this.setData({
      'form.timeline': list,
      'userLockedFields.timeline': list.length > 0,
    });
  },

  toggleTimelineExpand(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.form.timeline[index];

    this.setData({
      [`form.timeline[${index}].expanded`]: !item.expanded,
    });
  },

  onTimelineInput(e: WechatMiniprogram.Input) {
    const index = Number(e.currentTarget.dataset.index);
    const key = e.currentTarget.dataset.key as keyof TimelineItem;
    const value = e.detail.value;

    this.setData({
      [`form.timeline[${index}].${key}`]: value,
      'userLockedFields.timeline': true,
    });
  },

  onTimelineDateChange(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.currentTarget.dataset.index);
    const key = e.currentTarget.dataset.key as 'start_time' | 'end_time';
    const date = String(e.detail.value);
    const current = normalizeDateTime(this.data.form.timeline[index][key] || '');
    const next = combineDateTime(date, current.time);

    this.setData({
      [`form.timeline[${index}].${key}`]: next,
      'userLockedFields.timeline': true,
    });
  },

  onTimelineTimeChange(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.currentTarget.dataset.index);
    const key = e.currentTarget.dataset.key as 'start_time' | 'end_time';
    const time = String(e.detail.value);
    const current = normalizeDateTime(this.data.form.timeline[index][key] || '');
    const next = combineDateTime(current.date, time);

    this.setData({
      [`form.timeline[${index}].${key}`]: next,
      'userLockedFields.timeline': true,
    });
  },

  chooseQrcodeImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles[0];

        this.setData({
          qrcodeImage: {
            path: file.tempFilePath,
            previewUrl: file.tempFilePath,
            status: 'local',
          },
          'userLockedFields.qrcode_url': true,
        });

        // 后续在这里接你的 COS 上传：
        // 上传成功后：
        // this.setData({
        //   'qrcodeImage.url': cosUrl,
        //   'qrcodeImage.previewUrl': cosUrl,
        //   'qrcodeImage.status': 'uploaded',
        //   'form.qrcode_url': cosUrl,
        // });
      },
    });
  },

  previewQrcode() {
    const img = this.data.qrcodeImage;
    if (!img?.previewUrl) return;

    wx.previewImage({
      urls: [img.previewUrl],
      current: img.previewUrl,
    });
  },

  removeQrcode() {
    this.setData({
      qrcodeImage: null,
      'form.qrcode_url': '',
      'userLockedFields.qrcode_url': false,
    });
  },

  chooseAttachmentFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf', 'doc', 'docx'],
      success: (res) => {
        const file = res.tempFiles[0];
        const name = file.name || '';
        const ext = getExt(name);

        if (!isAllowedDocExt(ext)) {
          wx.showToast({
            title: '仅支持 PDF、DOC、DOCX',
            icon: 'none',
          });
          return;
        }

        this.setData({
          attachmentFile: {
            name,
            path: file.path,
            size: file.size,
            sizeText: formatSize(file.size),
            ext,
            status: 'local',
          },
        });

        // 后续在这里接你的附件 COS 上传：
        // 上传成功后设置 attachmentFile.url 和 status。
      },
    });
  },

  previewAttachment() {
    const file = this.data.attachmentFile;
    if (!file) return;

    if (file.path) {
      wx.openDocument({
        filePath: file.path,
        showMenu: true,
        fail: () => {
          wx.showToast({
            title: '暂不支持预览该文件',
            icon: 'none',
          });
        },
      });
      return;
    }

    if (file.url) {
      wx.downloadFile({
        url: file.url,
        success: (res) => {
          wx.openDocument({
            filePath: res.tempFilePath,
            showMenu: true,
          });
        },
        fail: () => {
          wx.showToast({
            title: '文件下载失败',
            icon: 'none',
          });
        },
      });
    }
  },

  removeAttachment() {
    this.setData({
      attachmentFile: null,
    });
  },

  buildSubmitPayload() {
    const form = this.data.form;

    const contactInfo = (form.contact_info || [])
      .filter((item: ContactItem) => {
        return String(item.name || '').trim() || String(item.phone || '').trim();
      })
      .map((item: ContactItem) => ({
        name: String(item.name || '').trim(),
        phone: String(item.phone || '').trim(),
      }));

    const timelineItems = (form.timeline || [])
      .map((item: TimelineItem, index: number) => ({
        label: String(item.label || '').trim(),
        description: String(item.description || '').trim() || null,
        start_time: item.start_time || null,
        end_time: item.end_time || null,
        sort_order: Number(item.sort_order ?? index),
      }))
      .filter((item: TimelineItem) => item.label);

    return {
      activity: {
        title: form.title.trim(),
        category: Number(form.category),
        organizer: form.organizer.trim() || null,
        audience_scope: Number(form.audience_scope),
        start_time: form.start_time,
        end_time: form.end_time,
        enroll_deadline: form.enroll_deadline || null,
        max_participants: form.max_participants ? Number(form.max_participants) : null,
        location: form.location.trim() || null,
        join_method: form.join_method.trim() || null,
        contact_info: JSON.stringify(contactInfo),
        content: form.content.trim(),
        qrcode_url: form.qrcode_url || this.data.qrcodeImage?.url || null,
      },
      timelineItems,
      attachment: this.data.attachmentFile?.url
        ? {
            name: this.data.attachmentFile.name,
            url: this.data.attachmentFile.url,
            ext: this.data.attachmentFile.ext,
            size: this.data.attachmentFile.size,
          }
        : null,
    };
  },

  submitActivity() {
    const payload = this.buildSubmitPayload();

    if (!payload.activity.title) {
      wx.showToast({
        title: '请填写活动标题',
        icon: 'none',
      });
      return;
    }

    if (!payload.activity.content) {
      wx.showToast({
        title: '请填写活动详情',
        icon: 'none',
      });
      return;
    }

    if (!payload.activity.start_time || !payload.activity.end_time) {
      wx.showToast({
        title: '请选择活动开始和结束时间',
        icon: 'none',
      });
      return;
    }

    wx.request({
      url: `${API_BASE}/v1/activity`,
      method: 'POST',
      data: payload,
      success: () => {
        wx.showToast({
          title: '发布成功',
          icon: 'success',
        });
      },
      fail: () => {
        wx.showToast({
          title: '发布失败',
          icon: 'none',
        });
      },
    });
  },
});
