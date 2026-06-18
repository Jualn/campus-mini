# 集成指南 - 快速上手

这份文档帮助你快速集成新的数据管理架构到现有的小程序中。

---

## 🚀 立即可用的改动

已为你的项目完成以下更新：

### ✅ 已更新的文件

1. **store/index.js** 
   - 新增字段: `permissions`, `settings`, `selectedTabIndex`, `scrollTops`, `badgeCount`
   - 参考: [store/index.js](../store/index.js)

2. **services/auth.js**
   - 新增: `initUserInfo()` 方法用于恢复登录状态
   - 优化: 登录、登出、权限管理的完整流程
   - 参考: [services/auth.js](../services/auth.js)

3. **app.js**
   - 优化: `onLaunch()` 中调用 `initUserInfo()` 恢复登录状态
   - 参考: [app.js](../../app.js)

4. **utils/storage.js**
   - 添加: 详细的注释说明应该保存哪些key
   - 参考: [utils/storage.js](../utils/storage.js)

### ✨ 新建的文件

1. **store/helper.js** - 高级助手方法库
   - 权限检查: `hasPermission()`, `hasAllPermissions()`
   - 用户信息: `getUserInfo()`, `getUserId()`
   - 设置管理: `getSetting()`, `updateSetting()`
   - 滚动位置: `saveScrollTop()`, `getScrollTop()`
   - 状态查询: `isLoggedIn()`, `syncStorageToStore()`

2. **config/DATA_STORAGE.md** - 完整数据管理指南

3. **config/QUICK_REFERENCE.md** - 快速参考和示例

4. **config/ARCHITECTURE_DIAGRAM.md** - 架构设计文档

---

## 📋 后端需要调整

确保后端登录接口返回以下结构：

```javascript
POST /auth/login
Body: { code: 'xxx' }

Response: {
  code: 0,
  message: 'success',
  data: {
    token: 'eyJ...',              // JWT token
    userInfo: {
      id: 123,
      name: '用户名',
      avatar: 'https://...',
      bio: '个人签名',
      // 其他字段根据需要添加
    },
    permissions: [                // 权限列表
      'post:create',
      'post:edit', 
      'comment:create',
      // 根据业务需要定义
    ],
    settings: {                   // 用户设置
      theme: 'light',             // light | dark
      notification: true,         // 是否启用通知
      privacy: 'public',          // public | friends | private
      // 根据业务需要定义
    }
  }
}
```

---

## 🔧 在页面中集成 - 5个示例

### 示例1: 检查权限并显示按钮

```javascript
// pages/community/post-edit/post-edit.js
import store from '../../../store/index'
import { hasPermission } from '../../../store/helper'

Page({
  onLoad() {
    // 权限检查
    const canCreatePost = hasPermission('post:create')
    const canEditPost = hasPermission('post:edit')
    
    this.setData({
      canCreatePost,
      canEditPost
    })
    
    if (!canCreatePost) {
      wx.showToast({ 
        title: '您没有发布权限',
        icon: 'error'
      })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  }
})
```

### 示例2: 获取并显示用户信息

```javascript
// pages/me/me.js
import store from '../../store/index'
import { getUserInfo, getUserId } from '../../store/helper'

Page({
  data: {
    userInfo: {},
    userId: null
  },

  onLoad() {
    const userInfo = store.get('userInfo')
    const userId = getUserId()
    
    this.setData({
      userInfo: userInfo || {},
      userId
    })
    
    // 监听userInfo变化
    this.unwatchUser = store.watch('userInfo', (newInfo) => {
      this.setData({ userInfo: newInfo })
    })
  },

  onUnload() {
    this.unwatchUser?.()
  }
})
```

### 示例3: 管理滚动位置

```javascript
// 任意列表页面
import { saveScrollTop, getScrollTop } from '../../store/helper'

Page({
  onLoad() {
    // 恢复之前的滚动位置
    const savedTop = getScrollTop(this.route)
    if (savedTop > 0) {
      wx.pageScrollTo({ scrollTop: savedTop })
    }
  },

  onPageScroll(e) {
    // 每次滚动都保存位置
    saveScrollTop(this.route, e.scrollTop)
  },

  async onPullDownRefresh() {
    // 下拉刷新时重置滚动位置
    saveScrollTop(this.route, 0)
    await this.loadData()
    wx.stopPullDownRefresh()
  }
})
```

### 示例4: 监听tab变化

```javascript
// custom-tab-bar/index.js
import store from '../store/index'

Component({
  data: {
    selectedTabIndex: 0,
    // ... 其他tabbar数据
  },

  attached() {
    // 从store读取初始值
    this.setData({
      selectedTabIndex: store.get('selectedTabIndex') || 0
    })
    
    // 监听tabbar索引变化
    this.unwatchTab = store.watch('selectedTabIndex', (tabIndex) => {
      this.setData({ selectedTabIndex: tabIndex })
    })
  },

  detached() {
    this.unwatchTab?.()
  },

  methods: {
    switchTab(index) {
      // 更新store
      store.set('selectedTabIndex', index)
      
      // 导航
      const pages = [
        '/pages/index/index',
        '/pages/message/message',
        '/pages/community/community',
        '/pages/me/me'
      ]
      wx.switchTab({ url: pages[index] })
    }
  }
})
```

### 示例5: 管理用户设置

```javascript
// subpkg_setting/pages/setting/setting.js
import store from '../../../store/index'
import { getSetting, updateSetting } from '../../../store/helper'

Page({
  data: {
    theme: 'light',
    notification: true,
    privacy: 'public'
  },

  onLoad() {
    // 读取当前设置
    const settings = store.get('settings') || {}
    this.setData({
      theme: settings.theme || 'light',
      notification: settings.notification !== false,
      privacy: settings.privacy || 'public'
    })
  },

  onThemeChange(e) {
    const theme = e.detail.value
    this.setData({ theme })
    
    // 同时更新到store和storage
    updateSetting('theme', theme)
  },

  onNotificationToggle(e) {
    const notification = e.detail
    this.setData({ notification })
    
    updateSetting('notification', notification)
  },

  onPrivacyChange(e) {
    const privacy = e.detail.value
    this.setData({ privacy })
    
    updateSetting('privacy', privacy)
  }
})
```

---

## 📚 文档阅读顺序

根据需求选择对应文档：

| 需求 | 推荐阅读 | 耗时 |
|------|---------|------|
| 快速了解架构 | QUICK_REFERENCE.md | 5min |
| 理解完整流程 | DATA_STORAGE.md | 15min |
| 深入学习设计 | ARCHITECTURE_DIAGRAM.md | 20min |
| 快速集成代码 | 本文档(INTEGRATION_GUIDE.md) | 10min |

---

## 🔍 常见问题排查

### Q: 登录后页面仍显示未登录?

**可能原因**: Store中的userInfo未更新

**解决方案**:
```javascript
// 在登录成功后添加日志
import { isLoggedIn } from './store/helper'
console.log('已登录:', isLoggedIn())
console.log('UserInfo:', store.get('userInfo'))
```

### Q: 设置修改不生效?

**可能原因**: 只修改了storage，未同步到store

**解决方案**: 使用helper方法替代直接操作
```javascript
// ❌ 错误
storage.set('settings', { theme: 'dark' })

// ✅ 正确
import { updateSetting } from './store/helper'
updateSetting('theme', 'dark')
```

### Q: 页面刷新后滚动位置丢失?

**正常现象**: scrollTops只存在store中，刷新会丢失

**解决方案**: 如果需要跨会话保存，改为使用storage:
```javascript
// 修改 store/helper.js 中的 saveScrollTop 方法
// 同时保存到 storage
storage.set(`scroll_${route}`, scrollTop)
```

### Q: 多个页面监听同一个字段导致冗余?

**优化方案**: 在自定义组件中集中处理
```javascript
// components/global-state-sync/index.js
// 统一管理所有全局状态同步
Component({
  attached() {
    // 监听所有需要响应的字段
    store.watch('selectedTabIndex', this.updateTabIndex)
    store.watch('badgeCount', this.updateBadge)
  }
})
```

---

## ✅ 集成检查清单

使用此清单验证集成是否完成：

- [ ] 后端API已返回 permissions 和 settings
- [ ] auth.js 中已导入 store 和 helper 方法
- [ ] app.js onLaunch 已调用 initUserInfo()
- [ ] 权限检查页面已使用 hasPermission()
- [ ] 用户信息页面已使用 getUserInfo()
- [ ] 设置管理已使用 updateSetting()
- [ ] tabbar切换已使用 store.set('selectedTabIndex')
- [ ] 列表页面已实现滚动位置保存和恢复
- [ ] 登出功能已调用 clearAuth()
- [ ] 测试: 登录 → 操作 → 关闭App → 重启 → 验证状态恢复

---

## 🎯 下一步行动

1. **立即**: 查看 [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) 了解快速用法
2. **今天**: 在3-5个页面中集成示例代码
3. **本周**: 完整测试登录、登出、权限、设置的完整流程
4. **完成**: 根据实际业务调整权限类型和设置字段

---

## 💡 最佳实践

```javascript
// ✅ DO: 使用helper方法
import { hasPermission, getUserInfo, updateSetting } from './store/helper'

// ❌ DON'T: 直接访问store的内部数据
const permissions = store._state.permissions  // 不要这样做

// ✅ DO: 监听需要的字段
const unwatch = store.watch('selectedTabIndex', (val) => { ... })

// ❌ DON'T: 在循环或条件中重复监听
for (let i = 0; i < 10; i++) {
  store.watch('userInfo', ...) // 会造成内存泄漏
}

// ✅ DO: 在onUnload中取消监听
onUnload() {
  this.unwatchUser?.()
}

// ✅ DO: 使用updateSetting同步更新
updateSetting({ theme: 'dark', notification: false })

// ❌ DON'T: 分别调用store和storage
store.set('settings', {...})
storage.set('settings', {...})  // 容易遗漏同步
```

---

## 📞 支持

如遇到任何问题，参考以下文件：

- 基础概念: [DATA_STORAGE.md](./DATA_STORAGE.md)
- 详细案例: [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
- 架构理解: [ARCHITECTURE_DIAGRAM.md](./ARCHITECTURE_DIAGRAM.md)

或在 store/helper.js 中查看助手方法的完整注释。
