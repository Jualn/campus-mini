// components/user-profile/index.ts
/**
 * user-profile 组件
 *
 * Properties:
 *   isSelf        Boolean  是否是自己的主页
 *   userInfo      Object   用户信息
 *     - nickname, avatar, bannerUrl, handle, bio
 *     - school, dept, joinYear, verified
 *     - followingCount, followerCount, likeCount
 *   isFollowing   Boolean  是否已关注（仅别人主页）
 *   activeTab     String   当前激活的 tab
 *   statusBarHeight Number  状态栏高度
 *
 * Events:
 *   back          → 返回
 *   goSetting     → 跳设置
 *   editProfile   → 编辑资料
 *   toggleFollow  → 关注/取消关注
 *   more          → ··· 菜单
 *   goFollowing   → 关注列表
 *   goFollower    → 粉丝列表
 *   goLiked / goCollect / goFiles / goHistory → 快捷入口
 *   switchtab     → { tab } 切换 tab
 */

import defineComponent from '../../utils/defineComponent';
import type { UserProfileInfo, UserProfileTab } from '../../types/business';
import { wxNavigateTo, wxShowActionSheet } from '../../utils/wx-promise';
import { getAvatarInfo } from '../../utils/avatar';

interface UserProfilePrivate {
  avatarChar: string;
  avatarBg: string;
}

defineComponent<UserProfilePrivate>()({
  properties: {
    isSelf: {
      type: Boolean,
      value: true,
    },
    userInfo: {
      type: Object as unknown as null,
      value: {} as UserProfileInfo,
      observer(newVal: UserProfileInfo) {
        const { char, bg } = getAvatarInfo(newVal.nickname);
        this.setData({
          avatarChar: char,
          avatarBg: bg,
        });
      },
    },
    isFollowing: {
      type: Boolean,
      value: false,
    },
    activeTab: {
      type: String,
      value: 'posts',
    },
    statusBarHeight: {
      type: Number,
      value: 20,
    },
  },

  data: {
    avatarChar: '',
    avatarBg: '',
  },

  methods: {
    onBack() {
      this.triggerEvent('back');
    },

    onGoSetting() {
      void wxNavigateTo({
        url: '/subpkg_setting/pages/setting/setting',
      });
    },

    onEditProfile() {
      void wxNavigateTo({
        url: '/subpkg_user/pages/edit-profile/edit-profile',
      });
    },

    onMore() {
      void wxShowActionSheet({
        itemList: ['举报用户'],
      })
        .then((res) => {
          this.triggerEvent('more', {
            action: res.tapIndex,
            userId: this.data.userInfo.id,
          });
        })
        .catch(() => {
          // Android 6.7.2 以下版本，点击取消或蒙层时，回调 fail, errMsg 为 "fail cancel"；
        });
    },

    onSwitchTab(e: WechatMiniprogram.TouchEvent) {
      const { tab } = e.currentTarget.dataset as { tab: UserProfileTab };
      this.triggerEvent('switchtab', {
        tab,
      });
    },
  },
});
