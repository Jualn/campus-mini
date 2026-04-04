// subpkg_user/pages/edit-profile/index.js
Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 88, // rpx → 将在 onLoad 中转为 px
    hasChanged: false,
    _original: {},
    form: {
      nickname: '',
      bio: '',
      handle: '',
      school: '',
      dept: '',
      gender: '',
      avatar: '',
      bannerUrl: '',
    },
  },

  onLoad() {
    const systemInfo = wx.getWindowInfo()
    const statusBarHeight = systemInfo.statusBarHeight // px
    // 导航内容区固定 44px（与胶囊按钮高度对齐），总高 = 状态栏 + 44px
    this.setData({
      statusBarHeight,
      navBarHeight: statusBarHeight + 44,
    })
    this._loadProfile()
  },

  _loadProfile() {
    const profile = {
      nickname: '不爱写Bug的学长',
      bio: '热爱开源 🚀 写代码比写 Bug 多一点点 | 校园圈活跃用户',
      handle: 'bugfree_senior',
      school: '北京某大学',
      dept: '计算机学院 · 大三',
      gender: 'male',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=me',
      bannerUrl: '',
    }
    this.setData({
      form: {
        ...profile
      },
      _original: {
        ...profile
      },
    })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    let value = e.detail.value

    // 修复：textarea 的 maxlength 在部分场景下不截断 e.detail.value
    // 需要手动对齐，保证字数显示和实际内容一致
    const maxLengthMap = {
      nickname: 20,
      bio: 80,
      handle: 20,
      dept: 20,
    }
    if (maxLengthMap[field] !== undefined) {
      value = value.slice(0, maxLengthMap[field])
    }

    this.setData({
      [`form.${field}`]: value
    })
    this._checkChanged()
  },

  onSelectGender(e) {
    this.setData({
      'form.gender': e.currentTarget.dataset.gender
    })
    this._checkChanged()
  },

  onPickSchool() {
    const schools = ['北京大学', '清华大学', '北京某大学', '其他院校']
    wx.showActionSheet({
      itemList: schools,
      success: (res) => {
        this.setData({
          'form.school': schools[res.tapIndex]
        })
        this._checkChanged()
      },
    })
  },

  onChangeAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({
          'form.avatar': res.tempFiles[0].tempFilePath
        })
        this._checkChanged()
      },
    })
  },

  onChangeBanner() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({
          'form.bannerUrl': res.tempFiles[0].tempFilePath
        })
        this._checkChanged()
      },
    })
  },

  _checkChanged() {
    const o = this.data._original
    const f = this.data.form
    this.setData({
      hasChanged: Object.keys(o).some(k => o[k] !== f[k])
    })
  },

  onSave() {
    if (!this.data.hasChanged) return
    if (!this.data.form.nickname.trim()) {
      wx.showToast({
        title: '昵称不能为空',
        icon: 'none'
      })
      return
    }
    wx.showLoading({
      title: '保存中...'
    })
    setTimeout(() => {
      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })
      const app = getApp()
      if (app.globalData) app.globalData.userInfo = {
        ...this.data.form
      }
      setTimeout(() => wx.navigateBack(), 1500)
    }, 800)
  },

  onCancel() {
    if (!this.data.hasChanged) {
      wx.navigateBack()
      return
    }
    wx.showModal({
      title: '放弃修改？',
      content: '当前改动尚未保存',
      confirmText: '放弃',
      confirmColor: '#FF3B30',
      cancelText: '继续编辑',
      success: (res) => {
        if (res.confirm) wx.navigateBack()
      },
    })
  },
})