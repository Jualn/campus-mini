import { http } from '../../utils/request';

// Hand-maintained consumer projection of contracts/api/schemas/admin-qr-login.yaml.
export type AdminQrLoginStatus =
  | 'PENDING'
  | 'SCANNED'
  | 'CONFIRMED'
  | 'CONSUMED'
  | 'EXPIRED'
  | 'REJECTED'
  | 'CANCELLED';

export interface AdminQrLoginScan {
  session: {
    sessionId: string;
    status: AdminQrLoginStatus;
    expiresAt: string;
    pollIntervalMs: number;
    confirmedAt?: string;
    consumedAt?: string;
  };
  target: 'ADMIN_WEB';
}

/** Decode exactly once; neither legacy QR payloads nor URLs are scenes. */
export function parseAdminLoginScene(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const scene = decodeURIComponent(raw);
    return /^[A-Za-z0-9_-]{32}$/.test(scene) ? scene : null;
  } catch {
    return null;
  }
}

export async function requestAdminQrLogin(
  operation: 'scan' | 'confirm' | 'reject',
  sceneCode: string,
): Promise<AdminQrLoginScan> {
  const suffix = operation === 'scan' ? '' : `:${operation}`;
  const result = await http.post(
    `/v1/admin/auth/qr-login-scans${suffix}`,
    { sceneCode },
    { auth: 'required', sensitive: true, retryAuth: false },
  );
  return parseScanResponse(result);
}

function parseScanResponse(value: unknown): AdminQrLoginScan {
  if (!value || typeof value !== 'object') throw new Error('Invalid QR login response');
  const response = value as Partial<AdminQrLoginScan>;
  const session = response.session;
  const statuses: string[] = [
    'PENDING',
    'SCANNED',
    'CONFIRMED',
    'CONSUMED',
    'EXPIRED',
    'REJECTED',
    'CANCELLED',
  ];
  if (
    response.target !== 'ADMIN_WEB' ||
    !session ||
    typeof session.sessionId !== 'string' ||
    !session.sessionId ||
    !statuses.includes(session.status) ||
    typeof session.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(session.expiresAt)) ||
    !Number.isInteger(session.pollIntervalMs) ||
    session.pollIntervalMs < 1000
  ) {
    throw new Error('Invalid QR login response');
  }
  // Project display fields only; never retain unexpected credentials from a provider.
  return {
    target: 'ADMIN_WEB',
    session: {
      sessionId: session.sessionId,
      status: session.status,
      expiresAt: session.expiresAt,
      pollIntervalMs: session.pollIntervalMs,
    },
  };
}
