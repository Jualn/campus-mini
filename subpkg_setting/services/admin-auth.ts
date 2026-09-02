import { api } from '../../services/api';
import { BusinessError } from '../../utils/error';
import type { AdminQrConfirmationVO } from '../../types/api';

const ADMIN_LOGIN_QR_PREFIX = 'jualn-admin-login:';

/**
 * 解析管理端生成的登录二维码协议。
 * sessionId 是后端签发的不透明值，前端只负责校验协议和非空约束。
 */
export const parseAdminLoginQr = (payload: string): string => {
  if (!payload.startsWith(ADMIN_LOGIN_QR_PREFIX)) {
    throw new BusinessError(-1, 'invalid admin login qr', undefined, {
      userMessage: '不是有效的管理端登录二维码',
    });
  }

  const sessionId = payload.slice(ADMIN_LOGIN_QR_PREFIX.length);
  if (!sessionId.trim()) {
    throw new BusinessError(-1, 'empty admin login qr session', undefined, {
      userMessage: '管理端登录二维码缺少会话信息',
    });
  }

  return sessionId;
};

export const confirmQrLogin = async (sessionId: string): Promise<AdminQrConfirmationVO> => {
  const result = await api.adminAuth.confirmQrLogin(sessionId);

  if (!result.confirmed) {
    throw new BusinessError(-1, 'admin login qr confirmation rejected', result, {
      userMessage: '登录确认未生效，请刷新管理端二维码后重试',
    });
  }

  return result;
};
