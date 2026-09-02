import * as adminAuthService from '../services/admin-auth';
import { wxScanCode } from '../../utils/wx-promise';
import type { AdminQrConfirmationVO } from '../../types/api';

const isScanCancelled = (err: unknown): boolean => {
  if (!err || typeof err !== 'object' || !('errMsg' in err)) return false;

  const errMsg = (err as { errMsg?: unknown }).errMsg;
  return typeof errMsg === 'string' && errMsg.includes('cancel');
};

/** 扫描并解析管理端登录二维码；用户取消扫码时返回 null。 */
export const scanAdminLoginQr = async (): Promise<string | null> => {
  try {
    const result = await wxScanCode({ scanType: ['qrCode'] });
    return adminAuthService.parseAdminLoginQr(result.result);
  } catch (err) {
    if (isScanCancelled(err)) return null;
    throw err;
  }
};

/** 使用当前小程序登录态确认指定的管理端二维码会话。 */
export const confirmAdminLogin = (sessionId: string): Promise<AdminQrConfirmationVO> =>
  adminAuthService.confirmQrLogin(sessionId);
