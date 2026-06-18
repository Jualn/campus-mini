// components/post-card/index.ts
/**
 * post-card 组件
 *
 * Properties:
 *   post  Object  帖子数据
 *     - id, nickname, avatar, content, images
 *     - commentCount, likeCount, isLiked, createdAt
 *
 * Events:
 *   tap     → 点击卡片跳详情，{ postId }
 *   like    → 点赞/取消，{ postId, isLiked }
 *   comment → 打开评论，{ postId, commentCount }
 *   more    → 点击 ···，{ postId }
 */

import defineComponent from '../../utils/defineComponent';
import { getAvatarInfo } from '../../utils/avatar';
import { drawPostPoster } from '../../utils/share_poster/postPoster';
import type { PostCardItem } from '../../types/business';
import createLogger from '../../utils/logger';
import { wxNavigateTo, wxShowToast } from '../../utils/wx-promise';
import { interactService } from '../../services/index';
import { TARGET_TYPES } from '../../utils/constants';
import { emitPostUpdated } from '../../events/post-event';

const log = createLogger('PostCard');

interface PostCardPrivate {
  _avatarUrl: string;
  _avatarChar: string;
  _avatarBg: string;
  _lastPostId?: string;
  _likePending: boolean;
}

defineComponent<PostCardPrivate>()({
  properties: {
    post: {
      type: Object as unknown as null,
      value: {} as PostCardItem,
      observer(newVal: PostCardItem | null) {
        if (!newVal) return;
        const { char, bg } = getAvatarInfo(newVal.nickname);
        const safeIsLiked = newVal.isLiked;
        const safeLikeCount =
          typeof newVal.likeCount === 'number' ? Math.max(0, newVal.likeCount) : 0;
        const safeViewCount =
          typeof newVal.viewCount === 'number' ? Math.max(0, newVal.viewCount) : 0;
        const content = newVal.content || '';
        const canExpand = content.length > 120;
        const shouldReset = this._lastPostId !== newVal.id;
        const nextExpanded = shouldReset ? false : this.data.isExpanded;
        this._lastPostId = newVal.id;
        this.setData({
          _avatarUrl: newVal.avatarUrl || '',
          _avatarChar: char,
          _avatarBg: bg,
          liked: safeIsLiked,
          likeCount: safeLikeCount,
          viewCountText: this._formatViewCount(safeViewCount),
          canExpand,
          isExpanded: canExpand ? nextExpanded : false,
        });

        // 确保 images 始终是数组
        if (!Array.isArray(newVal.images)) {
          this.setData({
            'post.images': [],
          });
        }
      },
    },
  },
  data: {
    _avatarUrl: '',
    _avatarChar: '',
    _avatarBg: '',
    liked: false,
    likeCount: 0,
    viewCountText: '',
    isExpanded: false,
    canExpand: false,
  },

  lifetimes: {
    attached() {
      // 私有字段初始化
      this._lastPostId = undefined;
      this._likePending = false;
    },

    detached() {
      // 私有字段重置（以防万一，虽然下次 attached 会重新赋值）
      this._lastPostId = undefined;
      this._likePending = false;
    },
  },
  methods: {
    noop() {
      /* empty */
    },

    _formatViewCount(count: number) {
      const safeCount = Math.max(0, count || 0);
      if (safeCount <= 0) return '';
      if (safeCount < 1000) return String(safeCount);
      const value = safeCount / 1000;
      const text = value >= 100 ? Math.round(value).toString() : value.toFixed(1);
      return `${text.replace(/\.0$/, '')}k`;
    },

    onTapCard() {
      void wxNavigateTo({
        url: `/subpkg_community/pages/detail/detail?postId=${this.properties.post.id}`,
      });
    },

    onTapAvatar() {
      void wxNavigateTo({
        url: `/subpkg_user/pages/user/user?userId=${this.properties.post.userId}`,
      }).catch((err: unknown) => {
        log.error('onTapAvatar', err);
      });
    },

    async onLike() {
      const { id: postId } = this.properties.post;
      const { liked, likeCount } = this.data;
      if (!postId) return;
      if (this._likePending) return;
      this._likePending = true;

      this.triggerEvent('view', { postId, source: 'like' });

      const safeLikeCount = typeof likeCount === 'number' ? likeCount : 0;
      const nextLiked = !liked;
      const nextLikeCount = Math.max(0, safeLikeCount + (liked ? -1 : 1));

      this.setData({
        liked: nextLiked,
        likeCount: nextLikeCount,
      });

      emitPostUpdated({
        id: postId,
        isLiked: nextLiked,
        likeCount: nextLikeCount,
      });

      try {
        if (liked) {
          await interactService.unlike({ targetType: TARGET_TYPES.POST.value, targetId: postId });
        } else {
          await interactService.like({ targetType: TARGET_TYPES.POST.value, targetId: postId });
        }
      } catch (err) {
        log.error('onLike', '点赞失败', err);
        void wxShowToast({ title: '点赞失败, 请稍后再试！', icon: 'none' });
        // 恢复状态
        this.setData({
          liked: liked,
          likeCount: safeLikeCount,
        });
        emitPostUpdated({
          id: postId,
          isLiked: liked,
          likeCount: safeLikeCount,
        });
      } finally {
        this._likePending = false;
      }

      // this.triggerEvent('like', {
      //     postId,
      //     isLiked,
      //   });
      // 这里直接在组件内处理点赞逻辑，更新 UI 状态，并调用接口。如果父组件有需要渲染，就交给父组件，
      // 目前父组件就用于数据拉取和分页，点赞等交互都在组件内处理了
      //       onPostLike(
      //   e: WechatMiniprogram.CustomEvent<{
      //     postId: string;
      //     isLiked: boolean;
      //   }>,
      // ) {
      //   const { postId, isLiked } = e.detail;
      //   const idx = this.data.posts.findIndex((p: IndexPostCard) => p.id === postId);
      //   if (idx === -1) return;
      //   const post = this.data.posts[idx];
      //   this.setData({
      //     [`posts[${idx.toString()}].isLiked`]: !isLiked,
      //     [`posts[${idx.toString()}].likeCount`]: post.likeCount + (isLiked ? -1 : 1),
      //   });
      // },
    },

    onComment() {
      const { id, commentCount } = this.properties.post;
      this.triggerEvent('comment', {
        postId: id,
        commentCount,
      });
    },

    onToggleExpand() {
      const { id: postId } = this.properties.post;
      if (!this.data.canExpand) return;
      const nextExpanded = !this.data.isExpanded;
      this.setData({ isExpanded: nextExpanded });
      if (nextExpanded && postId) {
        this.triggerEvent('view', { postId, source: 'expand' });
      }
    },

    onPreviewImage() {
      const { id: postId } = this.properties.post;
      if (!postId) return;
      this.triggerEvent('view', { postId, source: 'preview' });
    },

    async onShare() {
      const post = this.properties.post;
      this.triggerEvent('share', {
        shareTitle: '你好',
        sharePath: `/subpkg_community/pages/detail/detail?postId=${post.id}&from=share`,
        shareImage: '',
        targetId: post.id,
      });

      const postData = {
        avatarUrl: post.avatarUrl || '',
        avatarChar: this.data._avatarChar,
        avatarBg: this.data._avatarBg,
        name: post.nickname || '',
        content: post.content || '',
        images: post.images ?? [],
        time: post.createdAt || '',
      };

      await drawPostPoster(this, postData, (tempFilePath: string) => {
        this.triggerEvent('shareImageReady', {
          shareImage: tempFilePath,
        });
      }).catch((err: unknown) => {
        log.error('onShare', '生成分享图片失败', err);
        void wxShowToast({
          title: '生成分享图片失败',
          icon: 'none',
        });
      });
    },

    onMoreTap() {
      const post = this.properties.post;
      if (!post.id) return;

      this.triggerEvent('more', {
        post,
        targetType: TARGET_TYPES.POST.value,
        targetId: post.id,
      });
    },

    // async _detelePost() {
    //   const confirmed = await wxShowModal({
    //     title: '确认删除',
    //     content: '删除后无法恢复，确定要删除吗？',
    //     confirmColor: '#e02020',
    //   }).then((res) => res.confirm);

    //   if (!confirmed) return;

    //   const { id } = this.properties.post;
    //   if (!id) return;

    //   try {
    //     await postService.deletePost(id);
    //   } catch (err) {
    //     log.error('deletePost', '删除帖子失败', err);
    //     void wxShowToast({ title: '删除帖子失败，请稍后再试！', icon: 'none' });
    //   }
    // },

    // /** 判断传入 userId 是否为当前登录用户。 */
    // _isCurrentUser(userId: string): boolean {
    //   const currentUserId = getUserInfo('id');
    //   return !!currentUserId && currentUserId === userId;
    // },
  },
});
