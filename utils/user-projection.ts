/** 用户展示投影：不请求、不修改输入；帖子/评论内容和分页状态仍归各自模块。 */
import type {
  CommentItem,
  PostCardItem,
  PostDetail,
  ReplyItem,
  UserProfileInfo,
} from '../types/business';
import { getAvatarInfo } from './avatar';

export function projectPostAuthor<T extends PostCardItem | PostDetail>(
  post: T,
  profile: UserProfileInfo | null,
): T {
  if (!profile?.id || post.userId !== profile.id) return post;
  const avatarUrl = profile.avatarUrl ?? '';
  if ('avatar' in post) {
    const avatar = getAvatarInfo(profile.nickname);
    if (
      post.nickname === profile.nickname &&
      post.avatar === avatarUrl &&
      post._avatarChar === avatar.char &&
      post._avatarBg === avatar.bg
    )
      return post;
    return {
      ...post,
      nickname: profile.nickname,
      avatar: avatarUrl,
      _avatarChar: avatar.char,
      _avatarBg: avatar.bg,
    };
  }
  if (post.nickname === profile.nickname && post.avatarUrl === avatarUrl) return post;
  return { ...post, nickname: profile.nickname, avatarUrl };
}

export function projectCommentAuthor<T extends CommentItem | ReplyItem>(
  item: T,
  profile: UserProfileInfo | null,
): T;
export function projectCommentAuthor(
  item: CommentItem | ReplyItem,
  profile: UserProfileInfo | null,
): CommentItem | ReplyItem {
  if (!profile?.id) return item;
  let next = item;
  if (item.userId === profile.id) {
    const avatar = getAvatarInfo(profile.nickname);
    const avatarUrl = profile.avatarUrl ?? '';
    if (
      item.nickName !== profile.nickname ||
      item.avatarUrl !== avatarUrl ||
      item._avatarChar !== avatar.char ||
      item._avatarBg !== avatar.bg
    ) {
      next = {
        ...next,
        nickName: profile.nickname,
        avatarUrl,
        _avatarChar: avatar.char,
        _avatarBg: avatar.bg,
      };
    }
  }
  if (
    'replyToUserId' in next &&
    next.replyToUserId === profile.id &&
    next.replyToName !== profile.nickname
  ) {
    next = { ...next, replyToName: profile.nickname };
  }
  if ('replyList' in next) {
    const previous = next;
    const replyList = next.replyList.map((reply) => projectCommentAuthor(reply, profile));
    const replyPreview = next.replyPreview?.map((reply) => projectCommentAuthor(reply, profile));
    if (
      replyList.some((reply, i) => reply !== previous.replyList[i]) ||
      replyPreview?.some((reply, i) => reply !== previous.replyPreview?.[i])
    ) {
      next = { ...next, replyList, replyPreview };
    }
  }
  return next;
}
