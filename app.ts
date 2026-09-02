import { createLogger } from './utils/logger';
import { AuthError, BusinessError, HttpError, NetworkError } from './utils/error';
import * as authAction from './actions/auth';
import * as notificationCenter from './actions/notification-center';
import { getCurrentProfile } from './actions/current-user';

const log = createLogger('App');

App({
  // 共享运行时状态由 Store 管理，持久化与初始化由 Action 协调。
  globalData: {},

  onLaunch() {
    void authAction.initUserInfo();
  },

  onShow() {
    // 应用负责资料预热/过期校验，头像组件只订阅，不各自发请求。
    void getCurrentProfile({ allowStale: true }).catch((err: unknown) => {
      log.warn('onShow', '当前用户资料校验失败', err);
    });
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
    if (
      err instanceof AuthError ||
      err instanceof NetworkError ||
      err instanceof HttpError ||
      err instanceof BusinessError
    ) {
      // 展示由发起操作的页面决定；全局层只留日志，避免重复或跨页面 Toast。
      log.warn('onUnhandledRejection', '未被页面处理的请求异常', err);
      return;
    }
    log.error('onUnhandledRejection', '未捕获Promise', err);
  },
});
