import defineComponent from '../../utils/defineComponent';
import { wxGetWindowInfo } from '../../utils/wx-promise';

defineComponent()({
  options: {
    styleIsolation: 'isolated',
  },
  properties: {
    title: {
      type: String,
      value: '',
    },
    fixed: {
      type: Boolean,
      value: false,
    },
    surface: {
      type: String,
      value: 'card',
      observer(surface: string, previous: string) {
        if (surface === 'brand' || previous === 'brand') this.updateStatusBar(surface === 'brand');
      },
    },
    backgroundColor: {
      type: String,
      value: '',
    },
    autoBack: {
      type: Boolean,
      value: true,
    },
  },
  data: {
    statusBarHeight: 20,
    rowHeight: 44,
    titleInset: 104,
  },
  lifetimes: {
    attached() {
      this.updateLayout();
      this.updateStatusBar(this.data.surface === 'brand');
    },
  },
  pageLifetimes: {
    show() {
      this.updateStatusBar(this.data.surface === 'brand');
    },
    resize() {
      this.updateLayout();
    },
  },
  methods: {
    updateStatusBar(brand: boolean) {
      wx.setNavigationBarColor({
        frontColor: brand ? '#ffffff' : '#000000',
        // The native API requires hex. WXSS paints the custom navigation surface using the token.
        backgroundColor: brand ? '#c43b4a' : '#ffffff',
        fail: () => undefined,
      });
    },
    onBack() {
      this.triggerEvent('back');
    },
    updateLayout() {
      const { statusBarHeight, windowWidth } = wxGetWindowInfo();
      const capsule =
        typeof wx.getMenuButtonBoundingClientRect === 'function'
          ? wx.getMenuButtonBoundingClientRect()
          : null;
      if (
        !capsule ||
        capsule.width <= 0 ||
        capsule.height <= 0 ||
        capsule.left <= windowWidth / 2 ||
        capsule.left >= windowWidth ||
        capsule.top < statusBarHeight
      ) {
        this.setData({ statusBarHeight, rowHeight: 44, titleInset: 104 });
        return;
      }

      const topGap = capsule.top - statusBarHeight;
      this.setData({
        statusBarHeight,
        rowHeight: capsule.height + 2 * topGap,
        titleInset: windowWidth - capsule.left + 8,
      });
    },
  },
});
