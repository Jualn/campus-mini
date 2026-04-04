// subpkg_setting/pages/setting/index.js

const POST_VISIBILITY_OPTIONS = [{
    value: 'all',
    label: '所有人'
  },
  {
    value: 'followers',
    label: '关注者'
  },
  {
    value: 'self',
    label: '仅自己'
  },
]

Page({
  data: {
    statusBarHeight: 20,
    version: '1.0.0',

    // 通知设置
    notify: {
      activity: true,
      exam: true,
      interaction: true,
      system: true,
    },

    // 隐私设置
    privacy: {
      postVisibility: 'all',
      postVisibilityLabel: '所有人',
      allowDm: true,
      searchable: true,
    },

    // 账号
    account: {
      phone: '',
    },
  },

  onLoad() {
    const sys = wx.getWindowInfo()
    this.setData({
      statusBarHeight: sys.statusBarHeight
    })
    this._loadSettings()
  },

  _loadSettings() {
    try {
      // 从本地缓存读取设置
      const notify = wx.getStorageSync('settings_notify')
      const privacy = wx.getStorageSync('settings_privacy')
      const account = wx.getStorageSync('settings_account')

      if (notify) this.setData({
        notify
      })
      if (privacy) {
        const label = POST_VISIBILITY_OPTIONS.find(o => o.value === privacy.postVisibility)?.label || '所有人'
        this.setData({
          privacy: {
            ...privacy,
            postVisibilityLabel: label
          }
        })
      }
      if (account) this.setData({
        account
      })
    } catch (e) {}

    // 获取版本号
    const accountInfo = wx.getAccountInfoSync()
    this.setData({
      version: accountInfo?.miniProgram?.version || '开发版'
    })
  },

  _saveNotify() {
    try {
      wx.setStorageSync('settings_notify', this.data.notify)
      // 真实场景同步到后端：wx.request({ url: '/api/user/settings', method: 'PUT', data: { notify } })
    } catch (e) {}
  },

  _savePrivacy() {
    try {
      wx.setStorageSync('settings_privacy', this.data.privacy)
    } catch (e) {}
  },

  // 通知开关
  onNotifyChange(e) {
    const key = e.currentTarget.dataset.key
    const value = e.detail.value
    this.setData({
      [`notify.${key}`]: value
    })
    this._saveNotify()

    // 同步到 app.js globalData，消息页根据此判断是否展示横幅
    const app = getApp()
    if (app.globalData) {
      app.globalData.notifySettings = this.data.notify
    }
  },

  // 隐私开关
  onPrivacyChange(e) {
    const key = e.currentTarget.dataset.key
    const value = e.detail.value
    this.setData({
      [`privacy.${key}`]: value
    })
    this._savePrivacy()
  },

  // 帖子可见范围
  onPickPostVisibility() {
    wx.showActionSheet({
      itemList: POST_VISIBILITY_OPTIONS.map(o => o.label),
      success: (res) => {
        const selected = POST_VISIBILITY_OPTIONS[res.tapIndex]
        this.setData({
          'privacy.postVisibility': selected.value,
          'privacy.postVisibilityLabel': selected.label,
        })
        this._savePrivacy()
      },
    })
  },

  onGoEditProfile() {
    wx.navigateTo({
      url: '/subpkg_user/pages/edit-profile/edit-profile'
    })
  },

  onGoBindPhone() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    })
  },

  onDeactivate() {
    wx.showModal({
      title: '注销账号',
      content: '注销后账号数据将无法恢复，确认注销？',
      confirmText: '确认注销',
      confirmColor: '#FF3B30',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({
            title: '功能开发中',
            icon: 'none'
          })
        }
      },
    })
  },

  onGoFeedback() {
    wx.navigateTo({
      url: '/subpkg_setting/pages/feedback/index'
    })
  },

  onGoAgreement() {
    wx.navigateTo({
      url: '/subpkg_setting/pages/agreement/index'
    })
  },

  onGoPrivacyPolicy() {
    wx.navigateTo({
      url: '/subpkg_setting/pages/privacy-policy/index'
    })
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出当前账号？',
      confirmText: '退出',
      confirmColor: '#FF3B30',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        // 清除本地数据
        wx.clearStorageSync()
        const app = getApp()
        if (app.globalData) {
          app.globalData.userInfo = null
          app.globalData.token = null
        }
        // 跳回登录页（根据实际路径调整）
        wx.reLaunch({
          url: '/pages/login/index'
        })
      },
    })
  },

  onBack() {
    wx.navigateBack()
  },
})