// behaviors/useSheet.ts
import defineBehavior from '../utils/defineBehavior';

// ── 类型定义 ──────────────────────────────────────────────────────────

interface SheetData {
  panelRatio: number;
  panelHeight: number;
  sheetTranslateY: number;
  sheetTransition: string;
  maskOpacity: number;
  maskTransition: string;
  atScrollTop: boolean;
}

interface SheetPrivate {
  _panelHeight: number;
  _dismissing: boolean;
  _scrollTop: number;
  _keyboardListener: { remove?: () => void } | null;
  _enterTimer: number | null;
  _dismissTimer: number | null;
}

// 构建给 回调使用的 this 类型，包含组件实例的所有公开数据和方法，以及私有字段, 回调需要使用就得加上类型声明
// 如果不加声明在回调里访问 this.data.panelHeight 会提示找不到 panelHeight，因为它是通过 setData 定义的，而不是直接在接口里声明的
type SheetThis = WechatMiniprogram.Component.TrivialInstance & SheetPrivate & { data: SheetData };

export type SheetThiss = SheetPrivate & { data: SheetData };

export interface UseSheetOptions {
  /** 面板高度占屏幕比例，默认 0.9 */
  panelRatio?: number;
  /** 入场/退场动画时长(ms)，默认 380 */
  animDuration?: number;
  /** 关闭延迟时长(ms)，需与 WXS 动画时长对齐，默认 340 */
  dismissDelay?: number;
  /**
   * 关闭前的钩子，返回 false 可阻止关闭
   * 不传则直接关闭
   */
  onBeforeClose?: (this: SheetThis) => boolean;
  /**
   * 关闭完成后的回调（triggerEvent('close') 之后）
   * 不传则只触发 close 事件
   */
  onClose?: (this: SheetThis) => void;
  /**
   * 滚动回调，叠加在默认逻辑之上
   */
  onScroll?: (this: SheetThis, e: WechatMiniprogram.ScrollViewScroll) => void;
}

type AnimKeyFrame = Record<string, string | number>;

// ── 工厂函数 ──────────────────────────────────────────────────────────

export function useSheet(options: UseSheetOptions = {}) {
  const {
    panelRatio = 0.9,
    animDuration = 380,
    dismissDelay = 340,
    onBeforeClose,
    onClose,
    onScroll,
  } = options;

  return defineBehavior<SheetPrivate>()({
    data: {
      panelRatio, // 透传给 wxml 侧使用
      panelHeight: 0,
      sheetTranslateY: 0,
      sheetTransition: 'none',
      maskOpacity: 0,
      maskTransition: 'none',
      atScrollTop: true,
    },

    lifetimes: {
      attached() {
        const h = wx.getWindowInfo().windowHeight * panelRatio;
        this._panelHeight = h;
        this._dismissing = false;
        this._scrollTop = 0;
        this._keyboardListener = null;
        this._enterTimer = null;
        this._dismissTimer = null;
        this.setData({ panelHeight: h });

        // 入场动画，延迟 30ms 等节点渲染完成
        this._enterTimer = setTimeout(() => {
          this._enterTimer = null;
          this.animate(
            '.J-sheet',
            [
              { transform: `translateY(${String(h)}px)` },
              { transform: 'translateY(0px)', ease: 'cubic-bezier(0.32,0.72,0,1)' },
            ] as AnimKeyFrame[],
            animDuration,
          );
          this.animate('.J-mask', [{ opacity: 0 }, { opacity: 1 }], animDuration);
        }, 30);
      },

      detached() {
        if (this._enterTimer !== null) clearTimeout(this._enterTimer);
        if (this._dismissTimer !== null) clearTimeout(this._dismissTimer);
        this._enterTimer = null;
        this._dismissTimer = null;

        // 组件销毁时清理监听器，防止内存泄漏
        this._keyboardListener?.remove?.();
        this._keyboardListener = null;
      },
    },

    methods: {
      // ── WXS 拖拽超阈值回调 ──────────────────────────────────────────
      onWxsDismiss() {
        if (this._dismissing) return;

        // 传入了 onBeforeClose 且返回 false，则阻止关闭
        if (onBeforeClose?.call(this) === false) return;

        this._dismissing = true;

        const h = this._panelHeight || this.data.panelHeight || 600;

        // 数据对齐到 WXS 动画终点，避免重渲染冲突
        this.setData({
          sheetTranslateY: h,
          sheetTransition: 'none',
          maskOpacity: 0,
          maskTransition: 'none',
        });

        void wx.hideKeyboard();
        this._keyboardListener?.remove?.();
        this._keyboardListener = null;

        if (this._dismissTimer !== null) clearTimeout(this._dismissTimer);
        this._dismissTimer = setTimeout(() => {
          this._dismissTimer = null;
          this._dismissing = false;
          this.triggerEvent('close');
          // 叠加执行传入的 onClose，不替换 triggerEvent
          onClose?.call(this);
        }, dismissDelay);
      },

      // ── 滚动事件 ────────────────────────────────────────────────────
      onScroll(e: WechatMiniprogram.ScrollViewScroll) {
        if (this._dismissing) return;
        this._scrollTop = e.detail.scrollTop;
        if (e.detail.scrollTop > 10 && this.data.atScrollTop) {
          this.setData({ atScrollTop: false });
        }
        // 叠加执行传入的 onScroll
        onScroll?.call(this, e);
      },

      onScrollToTop() {
        if (this._dismissing) return;
        this.setData({ atScrollTop: true });
      },

      // ── 供页面/组件主动调用的关闭方法 ───────────────────────────────
      closeSheet() {
        if (this._dismissing) return;
        if (onBeforeClose?.call(this) === false) return;

        this._dismissing = true;
        const h = this._panelHeight || this.data.panelHeight || 600;

        // JS 侧主动关闭需要自己播动画
        this.animate(
          '.J-sheet',
          [
            { transform: 'translateY(0px)' },
            { transform: `translateY(${String(h)}px)`, ease: 'cubic-bezier(0.32,0.72,0,1)' },
          ] as AnimKeyFrame[],
          dismissDelay,
        );
        this.animate('.J-mask', [{ opacity: 1 }, { opacity: 0 }], dismissDelay);

        void wx.hideKeyboard();
        this._keyboardListener?.remove?.();
        this._keyboardListener = null;

        if (this._dismissTimer !== null) clearTimeout(this._dismissTimer);
        this._dismissTimer = setTimeout(() => {
          this._dismissTimer = null;
          this._dismissing = false;
          this.triggerEvent('close');
          onClose?.call(this);
        }, dismissDelay);
      },

      noop() {
        /* 阻止事件冒泡用 */
      },

      // 废弃方法保留签名，避免旧调用报错
      onWxsDragEnd() {
        /* empty */
      },
      onWxsScrollDragCancel() {
        /* empty */
      },
    },
  });
}

// interface SheetData {
//   panelRatio: number;
//   panelHeight: number;
//   sheetTranslateY: number;
//   sheetTransition: string;
//   maskOpacity: number;
//   maskTransition: string;
//   atScrollTop: boolean;
// }

// // 直接挂在实例上的私有字段（非响应式 data，不走 setData）
// interface SheetPrivate {
//   _panelHeight: number;
//   _dismissing: boolean;
//   _scrollTop: number;
//   _keyboardListener: { remove?: () => void } | null;
// }

// // 合并 WX 组件实例能力 + 私有字段，供方法内 this 使用
// type SheetMixinThis = WechatMiniprogram.Component.TrivialInstance & {
//   data: SheetData;
// } & SheetPrivate;

// // wx animate() 的关键帧类型定义不完整，用此补全
// type AnimKeyFrame = Record<string, string | number>;

// // ── Behavior ──────────────────────────────────────────────────────────

// export default Behavior({
//   data: {
//     panelRatio: 0.9,
//     panelHeight: 0,
//     sheetTranslateY: 0,
//     sheetTransition: 'none',
//     maskOpacity: 0,
//     maskTransition: 'none',
//     atScrollTop: true, // 默认在顶部
//   },

//   lifetimes: {
//     attached(this: SheetMixinThis) {
//       const ratio = typeof this.data.panelRatio === 'number' ? this.data.panelRatio : 0.9;
//       const h = wx.getWindowInfo().windowHeight * ratio;
//       this._panelHeight = h;
//       this.setData({
//         panelHeight: h,
//       });

//       // 入场也用 animate，延迟 30ms 等节点渲染完成
//       setTimeout(() => {
//         this.animate(
//           '.J-sheet',
//           [
//             {
//               transform: 'translateY(' + h.toString() + 'px)',
//             },
//             {
//               transform: 'translateY(0px)',
//               ease: 'cubic-bezier(0.32,0.72,0,1)',
//             },
//           ] as AnimKeyFrame[],
//           380,
//         );
//         this.animate(
//           '.J-mask',
//           [
//             {
//               opacity: 0,
//             },
//             {
//               opacity: 1,
//             },
//           ],
//           380,
//         );
//       }, 30);
//     },
//   },

//   methods: {
//     // 以下方法可以保留（供非 WXS 场景调用），但 WXS 路径不再走这里
//     onWxsDragEnd(this: SheetMixinThis) {
//       /* 不再使用，可删除 */
//     },
//     onWxsScrollDragCancel(this: SheetMixinThis) {
//       /* 不再使用，可删除 */
//     },

//     // WXS 动画已在 WXS 侧完成，JS 只负责延时关闭
//     // ── WXS 拖拽超阈值：动画已由 WXS 播完，直接等时间关闭 ───────────
//     onWxsDismiss(this: SheetMixinThis) {
//       if (this._dismissing) return;
//       this._dismissing = true;

//       const h = this._panelHeight || this.data.panelHeight || 600;

//       // 立即把数据对齐到 WXS 动画终点，重渲染也不会产生冲突
//       this.setData({
//         sheetTranslateY: h,
//         sheetTransition: 'none',
//         maskOpacity: 0,
//         maskTransition: 'none',
//       });

//       // 立即停止监听 + 归零，动画期间不再 reflow
//       void wx.hideKeyboard();
//       this._keyboardListener?.remove?.();
//       this._keyboardListener = null;

//       setTimeout(() => {
//         this._dismissing = false;
//         // 通知父组件关闭弹窗
//         this.triggerEvent('close');
//       }, 340);
//     },

//     // scroll-view 事件保持不变
//     onScroll(this: SheetMixinThis, e: WechatMiniprogram.ScrollViewScroll) {
//       if (this._dismissing) return;
//       this._scrollTop = e.detail.scrollTop;
//       if (e.detail.scrollTop > 10 && this.data.atScrollTop) {
//         this.setData({
//           atScrollTop: false,
//         });
//       }
//     },

//     onScrollToTop(this: SheetMixinThis) {
//       if (this._dismissing) return;
//       this.setData({
//         atScrollTop: true,
//       });
//     },

//     noop(this: SheetMixinThis) {
//       /* empty */
//     },
//   },
// });
