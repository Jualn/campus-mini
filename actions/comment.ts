import { commentService, interactService } from '../services/index';
import type { SelectedMediaFile } from './media';
import { uploadAndSaveFiles } from './media';
import { TARGET_TYPES, type TargetType } from '../utils/constants';
import type { CommentCreateRequest, CommentPageQuery } from '../types/api';

export const getCommentList = (query: CommentPageQuery) => commentService.getCommentList(query);

export const getReplyList = (query: CommentPageQuery) => commentService.getReplyList(query);

export const createComment = (data: CommentCreateRequest) => commentService.createComment(data);

export const createCommentWithImage = async (options: {
  targetId: string;
  targetType: TargetType;
  content: string;
  parentId?: string;
  imageFile?: SelectedMediaFile;
}): Promise<string> => {
  let imageUrl = '';

  if (!options.parentId && options.imageFile) {
    const attachmentItems = await uploadAndSaveFiles(TARGET_TYPES.COMMENT.value, [
      options.imageFile,
    ]);
    imageUrl = attachmentItems[0]?.url ?? '';
  }

  return createComment({
    targetId: options.targetId,
    targetType: options.targetType,
    content: options.content,
    imageUrl,
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
