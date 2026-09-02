import * as commentService from '../services/comment';
import * as interactService from '../services/interact';
import type { SelectedMediaFile } from './media';
import { uploadFilesToCos } from './media';
import { TARGET_TYPES, type TargetType } from '../utils/constants';
import type { CommentCreateRequest, CommentPageQuery } from '../types/api';
import type { CommentItem, ReplyItem } from '../types/business';
import { peekCurrentProfile } from './current-user';
import { projectCommentAuthor } from '../utils/user-projection';

export const syncCommentAuthor = <T extends CommentItem | ReplyItem>(item: T): T =>
  projectCommentAuthor(item, peekCurrentProfile());

export const getCommentList = async (query: CommentPageQuery) => {
  const page = await commentService.getCommentList(query);
  return { ...page, list: page.list.map(syncCommentAuthor) };
};

export const getReplyList = async (query: CommentPageQuery) => {
  const page = await commentService.getReplyList(query);
  return { ...page, list: page.list.map(syncCommentAuthor) };
};

export const createComment = (data: CommentCreateRequest) => commentService.createComment(data);

export const createCommentWithImage = async (options: {
  targetId: string;
  targetType: TargetType;
  content: string;
  parentId?: string;
  imageFile?: SelectedMediaFile;
}): Promise<string> => {
  let imageUrl = '';
  let imageObjectKey: string | undefined;

  if (!options.parentId && options.imageFile) {
    const attachmentItems = await uploadFilesToCos(TARGET_TYPES.COMMENT.value, [options.imageFile]);
    imageUrl = attachmentItems[0]?.url ?? '';
    imageObjectKey = attachmentItems[0]?.objectKey;
  }

  return createComment({
    targetId: options.targetId,
    targetType: options.targetType,
    content: options.content,
    imageUrl,
    imageObjectKey,
    parentId: options.parentId,
  });
};

export const removeComment = (commentId: string) => commentService.removeComment(commentId);

export const toggleCommentLike = async (options: {
  commentId: string;
  isLiked: boolean;
}): Promise<void> => {
  const payload = {
    targetType: TARGET_TYPES.COMMENT.value,
    targetId: options.commentId,
  };

  if (options.isLiked) {
    await interactService.unlike(payload);
    return;
  }

  await interactService.like(payload);
};
