const { miniProgram } = wx.getAccountInfoSync();

export const ENV = miniProgram.envVersion; // 'develop' | 'trial' | 'release'

const configs = {
  develop: {
    baseURL: 'https://test.jualn.cn',
    timeout: 10000,
    logLevel: 'debug',
    notificationPollIntervalMs: 20000,
  },
  trial: {
    baseURL: 'https://api.jualn.cn',
    timeout: 10000,
    logLevel: 'warn',
    notificationPollIntervalMs: 20000,
  },
  release: {
    baseURL: 'https://api.jualn.cn',
    timeout: 15000,
    logLevel: 'error',
    notificationPollIntervalMs: 20000,
  },
};

export default configs[ENV];
