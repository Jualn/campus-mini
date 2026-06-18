const { miniProgram } = wx.getAccountInfoSync();

export const ENV = miniProgram.envVersion; // 'develop' | 'trial' | 'release'

const configs = {
  develop: {
    baseURL: 'https://test.jualn.cn',
    timeout: 10000,
    logLevel: 'debug',
  },
  trial: {
    baseURL: 'https://api.jualn.cn',
    timeout: 10000,
    logLevel: 'warn',
  },
  release: {
    baseURL: 'https://api.jualn.cn',
    timeout: 15000,
    logLevel: 'error',
  },
};

export default configs[ENV];
