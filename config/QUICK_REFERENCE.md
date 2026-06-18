# 快速参考：数据存放位置

## 一览表

| 数据项 | App.js | Store | Storage | 说明 |
|------|--------|-------|---------|------|
| **token** | ❌ | ✅ | ✅ | 登录凭证，必须同时驻留 |
| **userInfo** | ❌ | ✅ | ✅ | 用户基础信息 |
| **permissions** | ❌ | ✅ | ✅ | 用户权限列表 |
| **settings** | ❌ | ✅ | ✅ | 用户设置（主题、通知等） |
| **selectedTabIndex** | ❌ | ✅ | ❌ | 当前选中的tabbar索引 |
| **scrollTops** | ❌ | ✅ | ❌ | 各页面滚动位置 |
| **badgeCount** | ❌ | ✅ | ❌ | 消息/通知未读数 |
| **examTimelines** | ✅ | ❌ | ❌ | 考试时间表（常量）|
| **BASE_URL** | ✅ | ❌ | ❌ | API基础地址 |

---

## 代码示例

### 获取数据

```javascript
// 从Store获取
import store from './store/index'
const userInfo = store.get('userInfo')
const token = store.get('token')

// 从Storage获取（持久化）
import storage from './utils/storage'
const savedToken = storage.get('token')

// 从App获取常量
const app = getApp()
const apiUrl = app.BASE_URL
const timelines = app.globalData.examTimelines

// 使用helper方法（推荐）
import { getUserInfo, hasPermission, isLoggedIn } from './store/helper'
const userId = getUserInfo('id')
const canPost = hasPermission('post:create')
const loggedIn = isLoggedIn()
```

### 设置数据

```javascript
// 单个设置
store.set('selectedTabIndex', 1)

// 批量设置
store.setState({
  selectedTabIndex: 1,
  badgeCount: 5
})

// 持久化保存
storage.set('token', 'xxx')
storage.set('userInfo', { ... })

// 更新设置（同步到Store和Storage）
import { updateSetting } from './store/helper'
updateSetting('theme', 'dark')
updateSetting({ theme: 'dark', notification: false })
```

### 监听变化

```javascript
import store from './store/index'

// 监听
const unwatch = store.watch('selectedTabIndex', (newVal) => {
  console.log('Tab changed:', newVal)
})

// 取消监听
unwatch()
```

### 权限检查

```javascript
import { hasPermission, hasAllPermissions } from './store/helper'

// 检查单个权限
if (hasPermission('post:create')) {
  // 显示发布按钮
}

// 检查多个权限（OR逻辑）
if (hasPermission(['post:edit', 'post:delete'])) {
  // 显示编辑或删除按钮
}

// 检查所有权限（AND逻辑）
if (hasAllPermissions(['post:create', 'comment:create'])) {
  // 需要同时拥有两个权限
}
```

---

## 在页面中的使用

### pages/me/me.js - 用户个人页

```javascript
import store from '../../store/index'
import { getUserInfo, getUserId } from '../../store/helper'

Page({
  data: {
    userInfo: {},
    theme: 'light'
  },

  onLoad() {
    // 获取用户信息
    const userInfo = getUserInfo() || store.get('userInfo')
    
    // 获取用户设置
    const theme = store.get('settings')?.theme || 'light'
    
    this.setData({
      userInfo,
      theme,
      userId: getUserId()
    })
    
    // 监听用户信息变化
    this.unwatchUser = store.watch('userInfo', (newInfo) => {
      this.setData({ userInfo: newInfo })
    })
  },

  onUnload() {
    this.unwatchUser?.()
  }
})
```

### pages/index/index.js - 首页列表

```javascript
import store from '../../store/index'
import { saveScrollTop, getScrollTop } from '../../store/helper'

Page({
  data: {
    list: [],
    scrollTop: 0
  },

  onLoad() {
    // 恢复之前的滚动位置
    const savedTop = getScrollTop(this.route)
    if (savedTop > 0) {
      wx.pageScrollTo({ scrollTop: savedTop })
    }
  },

  onPageScroll(e) {
    // 保存滚动位置
    saveScrollTop(this.route, e.scrollTop)
  },

  async onPullDownRefresh() {
    // 刷新时重置滚动位置
    saveScrollTop(this.route, 0)
    await this.loadData()
  }
})
```

### subpkg_community/pages/post-edit/post-edit.js - 发布页面

```javascript
import store from '../../../store/index'
import { hasPermission } from '../../../store/helper'

Page({
  onLoad() {
    // 权限检查
    if (!hasPermission('post:create')) {
      wx.showToast({
        title: '您没有发布权限',
        icon: 'error'
      })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    
    // 获取用户信息用于显示
    const userInfo = store.get('userInfo')
    this.setData({
      author: userInfo.name,
      authorId: userInfo.id
    })
  }
})
```

### 登出示例

```javascript
import { clearAuth, logout } from './services/auth'

// 在设置页面或用户菜单中
async handleLogout() {
  wx.showModal({
    title: '确认登出',
    success: (res) => {
      if (res.confirm) {
        logout()  // 清空所有数据并跳转登录页
      }
    }
  })
}
```

---

## 后端对接示例

### 登录后端接口格式

```javascript
// 请求
POST /auth/login
{
  code: 'xxx'
}

// 响应
{
  code: 0,
  message: 'success',
  data: {
    token: 'eyJhbGc...',
    userInfo: {
      id: 123,
      name: '张三',
      avatar: 'https://...',
      bio: '个人签名'
    },
    permissions: [
      'post:create',
      'post:edit',
      'post:delete',
      'comment:create',
      'comment:delete'
    ],
    settings: {
      theme: 'light',
      notification: true,
      privacy: 'public'
    }
  }
}
```

### 获取用户信息端口（可选）

```javascript
// 服务器可以提供此接口供App启动时调用
GET /user/profile
Headers: { Authorization: 'Bearer token' }

// 响应格式同登录接口
{
  code: 0,
  data: {
    userInfo: { ... },
    permissions: [ ... ],
    settings: { ... }
  }
}
```

---

## 常见操作流程

### 流程1：用户登录

```
1. 用户点击登录按钮
   ↓
2. 调用 auth.ensureLogin()
   ↓
3. 后端返回 token + userInfo + permissions + settings
   ↓
4. 保存到 storage（持久化）
   ↓
5. 更新 store（运行时）
   ↓
6. 跳转到首页
```

### 流程2：App冷启动恢复登录状态

```
1. App.onLaunch() 触发
   ↓
2. 调用 auth.initUserInfo()
   ↓
3. 从 storage 读取 token、userInfo 等
   ↓
4. 同步到 store
   ↓
5. 已登录用户无需重新登录
```

### 流程3：用户登出

```
1. 用户点击登出按钮
   ↓
2. 调用 auth.logout()
   ↓
3. 清空 storage 中的认证数据
   ↓
4. 清空 store 中的用户状态
   ↓
5. 跳转登录页面
```

### 流程4：权限变更（后端更新）

```
1. 后端更新用户权限
   ↓
2. 前端调用 /user/profile 获取最新权限
   ↓
3. 更新 storage
   ↓
4. 更新 store
   ↓
5. 页面自动刷新权限相关UI
```

---

## 调试建议

### 查看Store状态

```javascript
// 在浏览器控制台
import store from './store/index'
console.log(store)  // 查看所有状态
console.log(store.get('userInfo'))  // 查看特定字段
```

### 查看Storage数据

```javascript
// 在微信开发者工具 Storage 标签页查看本地存储
// 或通过代码查看
import storage from './utils/storage'
console.log(storage.get('token'))
console.log(storage.get('userInfo'))
```

### 模拟登出测试

```javascript
// 在任何页面调试时快速清空登录状态
import { clearAuth } from './services/auth'
clearAuth()
// 然后手动导航回登录页测试登录流程
```

---

## 总结

- 🔑 **必须用Storage**：token、userInfo、permissions
- 💾 **可选用Storage**：settings、个人偏好
- ⚡ **必须用Store**：UI状态（selectedTabIndex、badgeCount）
- 📌 **助手方法**：优先使用 `store/helper.js` 中的工具方法

这样的架构保证了数据的清晰流向和易于维护！
