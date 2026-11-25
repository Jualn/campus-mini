const { miniProgram } = wx.getAccountInfoSync();

export const ENV = miniProgram.envVersion; // 'develop' | 'trial' | 'release'

// These are public static image URLs, not API or upload endpoints. Replace each after domain verification.
// The legacy values remain active until cutover; they do not establish storage-environment isolation.
const shareImages = {
  test: 'https://cos.jualn.cn/share/index-share.jpg',
  production: 'https://cos.jualn.cn/share/index-share.jpg',
};

const configs = {
  develop: {
    defaultShareImageUrl: shareImages.test,
    baseURL: 'https://test.jualn.cn',
    timeout: 10000,
    logLevel: 'debug',
    notificationPollIntervalMs: 20000,
  },
  trial: {
    defaultShareImageUrl: shareImages.test,
    baseURL: 'https://test.jualn.cn',
    timeout: 10000,
    logLevel: 'warn',
    notificationPollIntervalMs: 20000,
  },
  release: {
    defaultShareImageUrl: shareImages.production,
    baseURL: 'https://api.jualn.cn',
    timeout: 15000,
    logLevel: 'error',
    notificationPollIntervalMs: 20000,
  },
};

export default configs[ENV];
