# 项目数据管理规范 📚

## 📖 文档导航

本项目采用**三层数据管理架构**，以下文档详细说明了整个体系：

### 🚀 快速开始

**第一次接触？从这里开始：**

1. **[INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)** - 5分钟快速上手
   - 已完成的改动清单
   - 后端API接口规范
   - 5个立即可用的代码示例
   - 常见问题排查

2. **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - 日常工作参考
   - 一览表：数据应该放在哪里
   - 快速代码片段
   - 常见操作流程

### 📚 深入学习

**需要理解架构细节？**

3. **[DATA_STORAGE.md](./DATA_STORAGE.md)** - 完整设计文档
   - 三层架构详解
   - 具体分层说明
   - 数据流转过程
   - 在页面中的使用案例
   - 后端API响应格式

4. **[ARCHITECTURE_DIAGRAM.md](./ARCHITECTURE_DIAGRAM.md)** - 可视化架构
   - ASCII架构图
   - 完整数据流转流程
   - 性能对比
   - 决策树

5. **[NOTIFY_EVENTBUS.md](./NOTIFY_EVENTBUS.md)** - 通知 EventBus 说明
  - 事件定义与 payload 结构
  - emit/on/off 规范
  - 当前发送与接收位置

---

## 🎯 文档选择指南

| 情景 | 推荐阅读 | 目的 |
|------|---------|------|
| 我是新手，需要快速了解 | INTEGRATION_GUIDE | 了解项目改动和快速上手 |
| 我需要日常参考代码 | QUICK_REFERENCE | 快速查阅如何使用 |
| 我需要深入理解架构 | DATA_STORAGE | 完整理解设计思想 |
| 我需要看可视化图表 | ARCHITECTURE_DIAGRAM | 理解数据流转过程 |
| 我需要集成到页面中 | INTEGRATION_GUIDE | 获取代码示例和最佳实践 |
| 我在排查问题 | QUICK_REFERENCE/INTEGRATION_GUIDE | 参考常见问题部分 |

---

## 🏗️ 架构概览

```
┌─────────────────────────────────────────┐
│           App 常量层                    │
│  BASE_URL, examTimelines, ...          │
└─────────────────────────────────────────┘
                    ↕️
┌─────────────────────────────────────────┐
│         Store 运行时状态                 │
│  userInfo, permissions, settings       │
│  selectedTabIndex, scrollTops, ...      │
│  ✅ 响应式 ⏱️ 页面刷新丢失              │
└─────────────────────────────────────────┘
                    ↕️
┌─────────────────────────────────────────┐
│        Storage 持久化存储                │
│  token, userInfo, permissions, settings │
│  ❌ 不响应式 ⏱️ 跨会话保存              │
└─────────────────────────────────────────┘
```

---

## ✨ 核心改动

### 1. Store 扩充（store/index.js）
```javascript
{
  token,              // 认证凭证
  userInfo,           // 用户信息
  permissions,        // 权限列表 ✨ NEW
  settings,           // 用户设置 ✨ NEW
  selectedTabIndex,   // 当前tab ✨ NEW
  scrollTops,         // 滚动位置 ✨ NEW
  badgeCount          // 消息计数 ✨ NEW
}
```

### 2. Auth 完善（services/auth.js）
```javascript
// ✨ 新增方法
initUserInfo()        // 恢复登录状态
clearAuth()          // 完整清理

// ✨ 改进登录流程
// 同时保存: token, userInfo, permissions, settings
```

### 3. App 初始化（app.js）
```javascript
onLaunch() {
  initUserInfo()     // ✨ 恢复登录状态
  // ...
}
```

### 4. Helper 库（store/helper.js）✨ NEW
```javascript
hasPermission()      // 权限检查
getUserInfo()        // 获取用户信息
getSetting()         // 获取设置
updateSetting()      // 更新设置
saveScrollTop()      // 保存滚动位置
getScrollTop()       // 恢复滚动位置
isLoggedIn()         // 检查登录状态
```

---

## 🔑 关键概念

### 何时使用各层

| 数据类型 | App | Store | Storage |
|---------|-----|-------|---------|
| 常量配置 | ✅ | ❌ | ❌ |
| 认证信息 | ❌ | ✅ | ✅ |
| 用户设置 | ❌ | ✅ | ✅ |
| 权限信息 | ❌ | ✅ | ✅ |
| UI状态 | ❌ | ✅ | ❌ |
| 滚动位置 | ❌ | ✅ | ❌ |

### 数据流转

```
用户登录
  ↓
后端返回 token + userInfo + permissions + settings
  ↓
保存到 Storage（持久化）
  ↓
同步到 Store（运行时）
  ↓
页面获取 Store 数据并展示
  ↓
App 关闭
  ↓
App 重启 → 从 Storage 恢复 → 同步到 Store → 无缝继续使用
```

---

## 💻 代码使用示例

### 检查权限
```javascript
import { hasPermission } from './store/helper'

if (hasPermission('post:create')) {
  // 显示发布按钮
}
```

### 获取用户信息
```javascript
import { getUserInfo, getUserId } from './store/helper'

const userId = getUserId()
const userName = getUserInfo('name')
```

### 更新用户设置
```javascript
import { updateSetting } from './store/helper'

updateSetting('theme', 'dark')
// 自动同步到 store 和 storage
```

### 监听状态变化
```javascript
import store from './store/index'

const unwatch = store.watch('selectedTabIndex', (newVal) => {
  console.log('Tab changed:', newVal)
})

// 页面卸载时取消监听
onUnload() {
  unwatch?.()
}
```

---

## 📋 后端接口规范

### 登录接口
```javascript
POST /auth/login
Body: { code: 'xxx' }

Response: {
  code: 0,
  data: {
    token: 'eyJ...',
    userInfo: { id, name, avatar, ... },
    permissions: ['post:create', 'post:edit', ...],
    settings: { theme: 'light', notification: true, ... }
  }
}
```

---

## 🚀 使用流程

### 首次集成（30分钟）
1. 阅读 INTEGRATION_GUIDE.md 的"已更新的文件"部分 (5min)
2. 查看 5 个代码示例 (10min)
3. 将示例代码集成到 2-3 个页面 (10min)
4. 测试登录、登出、权限检查 (5min)

### 日常开发（参考）
1. 需要权限检查 → 查看 QUICK_REFERENCE 中的"权限检查"例子
2. 需要获取用户信息 → 查看 "获取用户信息"例子
3. 需要管理滚动位置 → 查看 "保存滚动位置"例子
4. 不确定数据放哪里 → 查看 "数据分类表"

---

## ✅ 最佳实践

### DO ✅
- 使用 helper 方法进行权限检查和数据获取
- 在 onLoad 中监听需要的状态
- 在 onUnload 中取消监听
- 使用 updateSetting 同步更新设置
- 定期查看 QUICK_REFERENCE 作为工作参考

### DON'T ❌
- 直接访问 store._state 的内部数据
- 分别调用 store.set 和 storage.set（容易遗漏同步）
- 在循环或条件中重复添加监听（导致内存泄漏）
- 将 UI 状态存储到 storage（会污染本地存储）
- 忘记在 onUnload 中取消监听

---

## 🔄 完整工作流示例

```javascript
// pages/community/post-edit/post-edit.js
import store from '../../../store/index'
import { hasPermission, getUserId } from '../../../store/helper'

Page({
  data: {
    canPost: false,
    userId: null,
    title: '',
    content: ''
  },

  onLoad() {
    // 权限检查
    const canPost = hasPermission('post:create')
    if (!canPost) {
      wx.showToast({ title: '您没有发布权限', icon: 'error' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    // 获取用户信息
    const userId = getUserId()
    
    this.setData({ canPost, userId })
  },

  async submitPost() {
    const { title, content } = this.data
    
    // 提交前最后检查一次权限
    if (!hasPermission('post:create')) {
      wx.showToast({ title: '权限已失效，请重新登录' })
      return
    }

    try {
      await wx.request({
        url: '/api/posts',
        method: 'POST',
        data: { title, content }
      })
      wx.showToast({ title: '发布成功' })
      wx.navigateBack()
    } catch (err) {
      wx.showToast({ title: '发布失败' })
    }
  }
})
```

---

## 📞 快速参考链接

- 📖 [数据管理完整指南](./DATA_STORAGE.md)
- 🎯 [快速参考表](./QUICK_REFERENCE.md)  
- 🚀 [集成指南](./INTEGRATION_GUIDE.md)
- 🏗️ [架构设计图](./ARCHITECTURE_DIAGRAM.md)
- 🛠️ [Store Helper库](../store/helper.js)
- 🔐 [Auth服务](../services/auth.js)

---

## 📊 项目统计

- 📝 文档总数: 5份
- 📦 新建文件: 1个(store/helper.js)
- ✏️ 修改文件: 4个(app.js, store/index.js, services/auth.js, utils/storage.js)
- 🎯 代码示例: 15+个
- 📖 文档字数: 10000+

---

## 🎓 学习路径建议

### 完全新手（1小时）
1. 阅读本README的"架构概览"部分 (5min)
2. 阅读INTEGRATION_GUIDE的前两部分 (10min)
3. 查看5个代码示例 (15min)
4. 实践：复制一个示例到页面中 (20min)
5. 查看QUICK_REFERENCE深化理解 (10min)

### 有基础的开发者（30分钟）
1. 快速浏览INTEGRATION_GUIDE (10min)
2. 查看代码示例和最佳实践部分 (10min)
3. 参考QUICK_REFERENCE集成 (10min)

### 架构师/技术负责人（1小时）
1. 阅读DATA_STORAGE.md完整理解设计 (30min)
2. 查看ARCHITECTURE_DIAGRAM理解数据流 (20min)
3. 审查store/helper.js实现 (10min)

---

## 🆘 常见问题速查

| 问题 | 答案 | 文档 |
|------|------|------|
| 数据应该放在哪里？ | 查看"数据分类表" | QUICK_REFERENCE |
| 如何检查权限？ | 使用 hasPermission() | INTEGRATION_GUIDE |
| 如何保存滚动位置？ | 使用 saveScrollTop() | QUICK_REFERENCE |
| 如何恢复登录状态？ | initUserInfo() 在 onLaunch 调用 | DATA_STORAGE |
| 页面刷新后滚动丢失？ | 正常，scrollTops 只在 store 中 | FAQ部分 |

---

## 📈 下一步行动

1. **立即**（5分钟）
   - 阅读本README的"架构概览"
   - 打开INTEGRATION_GUIDE查看改动清单

2. **今天**（30分钟）
   - 选择2-3个页面集成代码示例
   - 测试权限检查功能

3. **本周**（2小时）
   - 完整测试登录→使用→登出全流程
   - 测试App关闭重启后的状态恢复
   - 实现权限变更时的动态更新

4. **进行中**
   - 根据业务需求扩展permissions类型
   - 根据需要添加custom settings字段
   - 优化权限检查的性能

---

**最后更新**: 2026年5月7日  
**维护者**: 项目团队  
**版本**: 1.0
