// components/user-profile/index.js
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
 *   switchTab     → { tab } 切换 tab
 */
Component({
  properties: {
    isSelf: {
      type: Boolean,
      value: true
    },
    userInfo: {
      type: Object,
      value: {}
    },
    isFollowing: {
      type: Boolean,
      value: false
    },
    activeTab: {
      type: String,
      value: 'posts'
    },
    statusBarHeight: {
      type: Number,
      value: 20
    },
  },

  methods: {
    onBack() {
      this.triggerEvent('back')
    },
    onGoSetting() {
      this.triggerEvent('goSetting')
    },
    onEditProfile() {
      this.triggerEvent('editProfile')
    },
    onToggleFollow() {
      this.triggerEvent('toggleFollow')
    },

    onMore() {
      wx.showActionSheet({
        itemList: ['发消息', '举报用户', '拉黑此人'],
        success: (res) => {
          this.triggerEvent('more', {
            action: res.tapIndex
          })
        },
      })
    },

    onGoFollowing() {
      this.triggerEvent('goFollowing')
    },
    onGoFollower() {
      this.triggerEvent('goFollower')
    },
    onGoLiked() {
      this.triggerEvent('goLiked')
    },
    onGoCollect() {
      this.triggerEvent('goCollect')
    },
    onGoFiles() {
      this.triggerEvent('goFiles')
    },
    onGoHistory() {
      this.triggerEvent('goHistory')
    },

    onSwitchTab(e) {
      this.triggerEvent('switchTab', {
        tab: e.currentTarget.dataset.tab
      })
    },
  },
})