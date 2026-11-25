import { community } from '../services/post-community';
import { getUserId } from '../stores/helper';
import { storage, STORAGE_KEYS, type PostCreationKey } from '../utils/storage';
import { AuthError, HttpError } from '../utils/error';
import { newPostEventId } from '../utils/post-community';
import { POST_CAPABILITIES } from '../config/post-capabilities';
import type { PostCreateRequest, CommentCreateRequest } from '../types/post-contract';

const keys = (): PostCreationKey[] => {
  const value: unknown = storage.get(STORAGE_KEYS.POST_CREATION_KEYS);
  if (!Array.isArray(value)) return [];
  return (value as unknown[]).filter((entry): entry is PostCreationKey => {
    if (!entry || typeof entry !== 'object') return false;
    const x = entry as Partial<PostCreationKey>;
    return (
      typeof x.owner === 'string' &&
      typeof x.key === 'string' &&
      (x.kind === 'post' || x.kind === 'comment') &&
      typeof x.createdAt === 'number'
    );
  });
};
export const pendingPostCreation = (kind: PostCreationKey['kind']) =>
  keys().find((x) => x.owner === getUserId() && x.kind === kind);
function remove(pending: PostCreationKey) {
  storage.set(
    STORAGE_KEYS.POST_CREATION_KEYS,
    keys().filter((x) => x.owner !== pending.owner || x.key !== pending.key),
  );
}
export async function recoverPostCreation(kind: PostCreationKey['kind']) {
  const pending = pendingPostCreation(kind);
  if (!pending) throw new Error('没有待核对的提交');
  const token = storage.get(STORAGE_KEYS.TOKEN);
  const result =
    kind === 'post'
      ? await community.postReceipt(pending.key)
      : await community.commentReceipt(pending.key);
  if (getUserId() !== pending.owner || storage.get(STORAGE_KEYS.TOKEN) !== token)
    throw new Error('账号已变化，请重新查询');
  if (!result.id) throw new Error('提交结果尚未确认，请稍后查询本人记录');
  remove(pending);
  return result;
}
const running = new Set<string>();
async function create(
  kind: PostCreationKey['kind'],
  payload: PostCreateRequest | CommentCreateRequest,
) {
  if (!POST_CAPABILITIES.communityV1) throw new Error('普通社区新服务尚未开放');
  const owner = getUserId(),
    token = storage.get(STORAGE_KEYS.TOKEN);
  if (!owner) throw new Error('请先登录');
  const lock = `${owner}/${kind}`;
  if (running.has(lock)) throw new Error('正在提交，请勿重复点击');
  // Unknown outcomes can only be resolved by the original receipt, never by a new key.
  if (pendingPostCreation(kind))
    throw new Error('上次提交结果未确认，请先核对提交结果或查看本人记录');
  const pending: PostCreationKey = { owner, kind, key: newPostEventId(), createdAt: Date.now() };
  if (!storage.set(STORAGE_KEYS.POST_CREATION_KEYS, [...keys(), pending]))
    throw new Error('无法保存恢复凭据，本次未提交');
  running.add(lock);
  try {
    const result =
      kind === 'post'
        ? await community.createPost(payload, pending.key)
        : await community.createComment(payload as CommentCreateRequest, pending.key);
    if (getUserId() !== owner || storage.get(STORAGE_KEYS.TOKEN) !== token)
      throw new Error('账号已变化，请在原账号核对结果');
    if (!result.submission?.id) throw new Error('已收到响应但公开状态未知，请核对提交结果');
    remove(pending);
    return result.submission;
  } catch (error) {
    if (
      error instanceof AuthError ||
      (error instanceof HttpError &&
        error.statusCode >= 400 &&
        error.statusCode < 500 &&
        error.statusCode !== 408 &&
        error.problemType !== '/problems/idempotency-key-reused')
    )
      remove(pending);
    throw error;
  } finally {
    running.delete(lock);
  }
}
export const createCommunityPost = (payload: PostCreateRequest) => create('post', payload);
export const createCommunityComment = (payload: CommentCreateRequest) => create('comment', payload);
