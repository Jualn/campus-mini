import createLogger from './utils/logger';
import { AuthError, NetworkError, BusinessError } from './utils/error';
import { initUserInfo } from './services/auth';
import { notificationCenter } from './services/index';

const log = createLogger('App');

/**
 * App 启动时就要用的常量,其余运行状态放入 store，持久化storage
 * 例如：appId,环境标记,初始化参数
 *
 * ⚠️ globalData 现已精简，UI状态和用户信息已移至：
 * - store：selectedTabIndex, scrollTops, userInfo, permissions, settings
 * - storage：token, userInfo, permissions, settings
 */
App({
  globalData: {},

  onLaunch() {
    void initUserInfo();
  },

  onShow() {
    notificationCenter.start();
  },

  onHide() {
    notificationCenter.stop();
  },

  onError(err) {
    log.error('onError', 'JS全局异常', err);
  },

  // 全局未捕获的 Promise rejection
  onUnhandledRejection({ reason }) {
    const err = reason as unknown;
    if (err instanceof AuthError) return; // 已在 request 层处理
    if (err instanceof NetworkError) return; // 已 toast
    if (err instanceof BusinessError) return; // 已 toast
    log.error('onUnhandledRejection', '未捕获Promise', err);
  },
});
