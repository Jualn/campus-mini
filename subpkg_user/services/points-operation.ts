import { uploadCosFile, type CosUploadProgress } from '../../utils/cos';
import { isHttpError, isNetworkError } from '../../utils/error';
import {
  applicationBody,
  closeMyPointApplication,
  pointCloseBody,
  createPointApplication,
  createPointFileUploadCredentials,
  fileDeclaration,
  getMyPointApplication,
  getMyPointFile,
  newPointKey,
  pointId,
  pointSession,
  registerPointFile,
  type ApplicationCreate,
  type FileDeclaration,
  type PointApplication,
  type PointFile,
  type PointFileCredentials,
} from './points';

export type OperationState = 'READY' | 'SUBMITTING' | 'UNKNOWN' | 'REJECTED' | 'CONFIRMED';
function uncertain(error: unknown): boolean {
  return (
    isNetworkError(error) ||
    !isHttpError(error) ||
    error.statusCode >= 500 ||
    [408, 409, 429].includes(error.statusCode)
  );
}

// Closing is a separate intent from a new application. It never transfers/deletes materials.
export function pointCloseOperation(applicationId: string, input: { reason: string }) {
  const id = pointId(applicationId),
    body = pointCloseBody(input),
    key = newPointKey(),
    session = pointSession();
  let attempted = false;
  let state: OperationState = 'READY';
  let running: Promise<PointApplication> | undefined;
  const run = async () => {
    session();
    if (state === 'REJECTED') throw new Error('申请不能结束，请重新查询状态');
    state = 'SUBMITTING';
    try {
      // The target is already known: query before retrying an unknown mutation.
      if (attempted) {
        const current = await getMyPointApplication(id);
        session();
        if (current.status !== 'PENDING') {
          state = 'CONFIRMED';
          return current; // An approval winning the race is not a successful close.
        }
      }
      attempted = true;
      const current = await closeMyPointApplication(id, body, key);
      session();
      state = 'CONFIRMED';
      return current;
    } catch (error) {
      state = uncertain(error) ? 'UNKNOWN' : 'REJECTED';
      throw error;
    } finally {
      running = undefined;
    }
  };
  return {
    get state() {
      return state;
    },
    submit(): Promise<PointApplication> {
      if (running) return running;
      running = run();
      return running;
    },
  };
}

// Keep this handle for the entire logical intent, including unknown outcomes and navigation.
// It holds an immutable body/key. Creating another handle means an explicit NEW application.
// No title/list heuristic can identify a lost POST response: V1 has no lookup-by-key API.
export function pointApplicationOperation(input: ApplicationCreate) {
  const body = applicationBody(input),
    key = newPointKey(),
    session = pointSession();
  let state: OperationState = 'READY';
  let known: PointApplication | undefined;
  let running: Promise<PointApplication> | undefined;
  const run = async () => {
    session();
    if (state === 'REJECTED') throw new Error('本次提交未被接受，请修正后明确发起新申请');
    state = 'SUBMITTING';
    try {
      // Once the resource identity is known, always query current state instead of replaying a stale PENDING.
      const result = known
        ? await getMyPointApplication(known.applicationId)
        : await createPointApplication(body, key);
      session();
      known = result;
      state = 'CONFIRMED';
      return result;
    } catch (error) {
      state = known ? 'CONFIRMED' : uncertain(error) ? 'UNKNOWN' : 'REJECTED';
      throw error;
    } finally {
      running = undefined;
    }
  };
  return {
    get state() {
      return state;
    },
    get applicationId() {
      return known?.applicationId;
    },
    submit(): Promise<PointApplication> {
      if (running) return running;
      running = run();
      return running;
    },
  };
}

// One-file upload intent: credential and registration retries retain separate original keys.
// SDK success only permits registration. Only registerPointFile confirms a usable private fileId.
// No credential, signed URL or private proof is written to Storage/logs.
export function pointFileUploadOperation(input: FileDeclaration, filePath: string) {
  const declaration = fileDeclaration(input),
    session = pointSession();
  if (!filePath) throw new Error('请选择本地证明文件');
  const credentialKey = newPointKey(),
    registerKey = newPointKey();
  let credentials: PointFileCredentials | undefined;
  let uploadId: string | undefined;
  let uploaded = false;
  let uploadUncertain = false;
  let registered: PointFile | undefined;
  let running: Promise<PointFile> | undefined;
  const validateRegistration = (result: PointFile) => {
    if (
      result.applicationId ||
      !result.unboundExpiresAt ||
      result.fileName !== declaration.fileName ||
      result.kind !== declaration.kind ||
      result.contentType !== declaration.contentType ||
      result.sizeBytes !== declaration.sizeBytes
    )
      throw new Error('证明材料登记响应不一致，请使用原操作核查');
    return result;
  };
  const run = async (onProgress?: (progress: CosUploadProgress) => void) => {
    session();
    try {
      if (registered) {
        const result = await getMyPointFile(registered.fileId);
        session();
        return result;
      }
      if (uploadUncertain && uploadId) {
        try {
          const result = await registerPointFile(uploadId, 0, registerKey);
          session();
          registered = validateRegistration(result);
          return registered;
        } catch (error) {
          // Only definite material unavailability permits another PUT to the original object.
          // Provider/unknown failures retain the original operation for another registration query.
          if (
            !isHttpError(error) ||
            error.statusCode !== 400 ||
            error.problemType !== '/problems/points-file-unavailable'
          )
            throw error;
        }
      }
      if (!uploaded) {
        credentials ??= await createPointFileUploadCredentials([declaration], credentialKey);
        session();
        if (Date.parse(credentials.uploadExpiresAt) <= Date.now()) {
          credentials = undefined;
          throw new Error('本次上传已过期，请明确发起新上传');
        }
        uploadId = pointId(credentials.uploadId);
        uploadUncertain = true;
        await uploadCosFile({
          credential: {
            bucket: credentials.bucket,
            region: credentials.region,
            objectKeys: [...credentials.objectKeys],
            tmpSecretId: credentials.tmpSecretId,
            tmpSecretKey: credentials.tmpSecretKey,
            sessionToken: credentials.sessionToken,
            expiredTime: credentials.expiredTime,
          },
          filePath,
          contentType: declaration.contentType,
          singlePut: true,
          headers: { 'x-cos-acl': 'private', 'x-cos-forbid-overwrite': 'true' },
          onProgress: (p) => {
            try {
              session();
            } catch {
              return;
            }
            onProgress?.(p);
          },
        });
        session();
        uploaded = true;
        uploadUncertain = false;
        credentials = undefined;
      }
      const result = await registerPointFile(pointId(uploadId), 0, registerKey);
      session();
      registered = validateRegistration(result);
      return result;
    } catch (error) {
      // A retry reacquires the original credential representation with the SAME key.
      // Do not retain temporary secrets while an operation is idle after failure.
      credentials = undefined;
      throw error;
    } finally {
      running = undefined;
    }
  };
  return {
    upload(onProgress?: (progress: CosUploadProgress) => void): Promise<PointFile> {
      if (running) return running;
      running = run(onProgress);
      return running;
    },
  };
}
