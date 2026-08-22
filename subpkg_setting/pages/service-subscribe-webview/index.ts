// subpkg_setting/pages/service-subscribe-webview/index.ts
Page({
  data: {
    url: '',
  },

  onLoad(options: { url?: string }) {
    this.setData({
      url: decodeURIComponent(options.url ?? ''),
    });
  },
});
