# 数据管理与存储指南

## 概览

项目采用 **三层存储架构**，清晰划分数据职责：

```
┌─────────────────────────────────────────────┐
│         App.js (常量)                        │
│  - BASE_URL, examTimelines, 等常量          │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│         Store (内存，运行时)                 │
│  - userInfo, permissions, settings          │
│  - UI状态: selectedTabIndex, scrollTops     │
│  - 页面刷新丢失，需配合storage恢复          │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│      Storage (持久化，本地存储)              │
│  - token (必须持久化)                       │
│  - userInfo, permissions, settings          │
│  - 小程序卸载时才清空                       │
└─────────────────────────────────────────────┘
```

---

## 具体分层

### 1️⃣ 常量 (App.js)

**用途**：应用启动需要的配置、常量数据

**示例**：
```javascript
globalData: {
  BASE_URL: 'https://your-api.com',
  examTimelines: { cet4: [...], cet6: [...] }
}
```

**访问方式**：
```javascript
const app = getApp()
const baseUrl = app.BASE_URL
const timelines = app.globalData.examTimelines
```

---

### 2️⃣ Store (store/index.js)

**用途**：应用运行时的全局共享状态，支持响应式订阅

**特点**：
- ✅ 只在内存，页面刷新会丢失
- ✅ 支持订阅监听变化
- ✅ 适合频繁变化的UI状态

**数据类型**：

#### 认证信息
```javascript
store.get('token')          // 当前token
store.get('userInfo')       // { id, name, avatar, bio, ... }
```

#### 权限与设置
```javascript
store.get('permissions')    // ['post:create', 'comment:delete', ...]
store.get('settings')       // { theme: 'dark', notification: true, ... }
```

#### UI 状态
```javascript
store.get('selectedTabIndex')  // 当前选中tab: 0, 1, 2, 3
store.get('scrollTops')        // { 'pages/index': 120, 'pages/me': 0 }
store.get('badgeCount')        // 消息角标数
```

**使用示例**：

```javascript
// 获取
const userInfo = store.get('userInfo')

// 设置
store.set('selectedTabIndex', 1)

// 批量设置
store.setState({
  selectedTabIndex: 1,
  badgeCount: 5
})

// 监听变化
const unwatch = store.watch('selectedTabIndex', (newVal) => {
  console.log('Tab changed to:', newVal)
})

// 取消监听
unwatch()
```

---

### 3️⃣ Storage (utils/storage.js)

**用途**：需要持久化的数据（跨会话保存）

**特点**：
- ✅ 持久化存储，小程序卸载才清空
- ✅ 无响应式能力（需要手动同步到store）
- ✅ 容量有限（通常MB级别）

**关键数据**：

```javascript
// 认证凭证（必须持久化）
storage.get('token')              // 登录token
storage.get('userInfo')           // 用户基础信息
storage.get('permissions')        // 用户权限列表
storage.get('settings')           // 用户设置

// 其他可选
storage.get('theme')              // 用户主题偏好
storage.get('lastViewedExam')     // 缓存数据
```

**使用示例**：

```javascript
// 读取
const token = storage.get('token')
const userInfo = storage.get('userInfo', {})  // 带默认值

// 保存
storage.set('token', 'abc123')
storage.set('userInfo', { id: 1, name: 'John' })

// 删除
storage.remove('token')

// 清空全部（⚠️ 谨慎使用）
storage.clear()
```

---

## 数据流转过程

### 登录流程

```javascript
// services/auth.js
const _doLogin = async () => {
  const { code } = await wxLogin()
  const response = await post('/auth/login', { code })
  
  // 后端返回结构
  // {
  //   token: 'xxx',
  //   userInfo: { id, name, avatar, ... },
  //   permissions: ['post:create', ...],
  //   settings: { theme, notification, ... }
  // }
  
  // ① 持久化到storage
  storage.set('token', response.token)
  storage.set('userInfo', response.userInfo)
  storage.set('permissions', response.permissions)
  storage.set('settings', response.settings)
  
  // ② 同步到store（运行时用）
  store.setState({
    token: response.token,
    userInfo: response.userInfo,
    permissions: response.permissions,
    settings: response.settings
  })
}
```

### App启动恢复登录状态

```javascript
// app.js onLaunch
import { initUserInfo } from './services/auth'

onLaunch() {
  initUserInfo()  // 从storage恢复登录状态到store
}

// services/auth.js initUserInfo()
export const initUserInfo = () => {
  const token = storage.get('token')
  const userInfo = storage.get('userInfo')
  const permissions = storage.get('permissions', [])
  const settings = storage.get('settings', {})
  
  if (token && userInfo) {
    store.setState({ token, userInfo, permissions, settings })
  }
}
```

### 登出流程

```javascript
export const logout = () => {
  // 清空所有认证数据
  storage.remove('token')
  storage.remove('userInfo')
  storage.remove('permissions')
  storage.remove('settings')
  
  // 清空store
  store.setState({
    token: '',
    userInfo: null,
    permissions: [],
    settings: {}
  })
  
  // 跳转登录页
  wx.reLaunch({ url: '/pages/login/login' })
}
```

---

## 在页面中的使用

### 案例1：获取当前用户权限

```javascript
// pages/community/post-edit/post-edit.js
import store from '../../../store/index'

Page({
  onLoad() {
    const permissions = store.get('permissions')
    const canCreatePost = permissions.includes('post:create')
    
    if (!canCreatePost) {
      wx.showToast({ title: '您没有发布权限' })
      return
    }
    
    // 展示发布表单
  }
})
```

### 案例2：监听tab变化

```javascript
// pages/index/index.js
import store from '../../../store/index'

Page({
  onShow() {
    // 当tab变化时触发
    this.unwatch = store.watch('selectedTabIndex', (tabIndex) => {
      console.log('当前tab:', tabIndex)
      this.setData({ selectedTab: tabIndex })
    })
  },
  
  onUnload() {
    this.unwatch?.()  // 取消监听
  }
})
```

### 案例3：保存滚动位置

```javascript
// 任意页面
import store from '../../../store'

Page({
  onPageScroll(e) {
    const scrollTops = store.get('scrollTops') || {}
    scrollTops[this.route] = e.scrollTop
    store.set('scrollTops', scrollTops)
  },
  
  onLoad() {
    const scrollTops = store.get('scrollTops') || {}
    const savedTop = scrollTops[this.route] || 0
    wx.pageScrollTo({ scrollTop: savedTop })
  }
})
```

---

## 后端API响应格式规范

### 登录接口 `/auth/login`

```javascript
POST /auth/login
Body: { code: 'xxx' }

Response: {
  code: 0,
  message: 'success',
  data: {
    token: 'eyJxxx',           // JWT或其他token格式
    userInfo: {
      id: 123,
      name: 'John',
      avatar: 'https://...',
      bio: 'xxx',
      // 其他用户字段
    },
    permissions: [             // 权限列表
      'post:create',
      'post:edit',
      'comment:create',
      'comment:delete',
      // ...
    ],
    settings: {                // 用户设置
      theme: 'light',          // light | dark
      notification: true,      // 是否启用通知
      privacy: 'public',       // public | private
      // ...其他设置
    }
  }
}
```

### 用户资料接口 `/user/profile` (可选)

```javascript
GET /user/profile

Response: {
  code: 0,
  data: {
    userInfo: { ... },         // 同上
    permissions: [ ... ],
    settings: { ... }
  }
}
```

---

## 常见问题

**Q: 为什么token要同时在store和storage中？**
- Store：运行时快速访问
- Storage：小程序重启后恢复登录状态

**Q: scrollTops放在store为什么不会丢失？**
- onPageScroll每次滚动都会更新
- 用户滚动时store中的数据总是最新的

**Q: 可以在store中存复杂对象吗？**
- 可以，但不支持深层响应式
- 修改对象属性不会触发watch回调
- 建议整个替换：`store.set('settings', { ...settings, theme: 'dark' })`

**Q: Storage和缓存有什么区别？**
- Storage：由开发者控制的持久化数据
- 缓存：请求结果的临时存储，建议单独管理

---

## 总结

| 层级 | 位置 | 生命周期 | 响应式 | 场景 |
|-----|------|--------|------|------|
| 常量 | app.js | 应用级 | ❌ | API地址、考试时间表 |
| Store | 内存 | 运行时 | ✅ | userInfo、UI状态 |
| Storage | 本地磁盘 | 持久化 | ❌ | token、用户配置 |

遵循这个架构能保证数据管理清晰、易于扩展！
