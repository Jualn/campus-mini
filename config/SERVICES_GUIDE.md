# Services 使用指南

所有的API调用和业务逻辑已统一提取到 `services/` 目录，避免分散在各个页面中。

---

## 📂 服务结构

```
services/
├── index.js          # 统一导出入口
├── auth.js           # 认证服务
├── post.js           # 帖子服务
├── user.js           # 用户服务
├── activity.js       # 活动服务
├── exam.js           # 考试服务
└── message.js        # 消息服务
```

---

## 🎯 在页面中使用

### 导入方式

#### 方式1：按需导入单个方法
```javascript
import { publishPost, getPostDetail } from '../../services/post'

Page({
  async publishNewPost() {
    try {
      const result = await publishPost({
        content: '分享内容',
        images: ['url1', 'url2'],
        topics: ['话题1']
      })
      wx.showToast({ title: '发布成功' })
    } catch (err) {
      wx.showToast({ title: '发布失败' })
    }
  }
})
```

#### 方式2：导入整个服务对象
```javascript
import postService from '../../services/post'

Page({
  async publishNewPost() {
    const result = await postService.publishPost({
      content: '分享内容',
      images: ['url1', 'url2']
    })
  }
})
```

#### 方式3：从统一入口导入
```javascript
import { postService, userService } from '../../services'

Page({
  async loadData() {
    const posts = await postService.getUserPosts()
    const userInfo = await userService.getUserInfo()
  }
})
```

---

## 📚 各服务API文档

### 🔐 Auth Service - 认证服务

```javascript
import { ensureLogin, logout, isLoggedIn, getToken } from '../../services/auth'

// 确保已登录（如果未登录则自动跳转登录页）
await ensureLogin()

// 检查登录状态
const loggedIn = isLoggedIn()

// 获取token
const token = getToken()

// 登出
logout()
```

---

### 📝 Post Service - 帖子服务

```javascript
import postService from '../../services/post'

// 获取用户发布的帖子
const posts = await postService.getUserPosts('self', { page: 1, pageSize: 20 })

// 获取帖子详情
const post = await postService.getPostDetail('post_123')

// 获取帖子评论
const comments = await postService.getPostComments('post_123')

// 点赞/取消赞
await postService.togglePostLike('post_123', true)
await postService.togglePostLike('post_123', false)

// 发布新帖子
await postService.publishPost({
  content: '帖子内容',
  images: ['url1', 'url2'],
  topics: ['话题1', '话题2'],
  visibility: 'all'  // all/followers/self
})

// 编辑帖子
await postService.editPost('post_123', {
  content: '新的内容'
})

// 删除帖子
await postService.deletePost('post_123')

// 收藏/取消收藏
await postService.togglePostCollect('post_123', true)

// 发布评论
await postService.publishComment('post_123', {
  content: '评论内容',
  replyCommentId: null  // 如果是回复，填回复目标的ID
})
```

**在页面中使用示例：**

```javascript
// pages/me/me.js
import postService from '../../services/post'

Page({
  async onLoad() {
    try {
      const { data: posts } = await postService.getUserPosts('self')
      this.setData({ posts })
    } catch (err) {
      wx.showToast({ title: '加载失败' })
    }
  },

  async onPublish() {
    try {
      await postService.publishPost({
        content: this.data.content,
        images: this.data.images,
        topics: this.data.topics
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

### 👤 User Service - 用户服务

```javascript
import userService from '../../services/user'

// 获取用户信息
const user = await userService.getUserInfo('self')
const otherUser = await userService.getUserInfo('user_123')

// 获取用户关注列表
const following = await userService.getUserFollowing('user_123')

// 获取用户粉丝列表
const followers = await userService.getUserFollowers('user_123')

// 关注/取消关注用户
await userService.toggleFollowUser('user_123', true)
await userService.toggleFollowUser('user_123', false)

// 更新用户信息
await userService.updateUserInfo({
  nickname: '新昵称',
  avatar: 'https://...',
  bio: '个人签名'
})

// 更新用户设置
await userService.updateUserSettings({
  notification: true,
  privacy: 'public'
})

// 获取用户设置
const settings = await userService.getUserSettings()

// 获取用户统计数据
const stats = await userService.getUserStats('user_123')

// 搜索用户
const results = await userService.searchUsers('搜索关键词')
```

---

### 🎉 Activity Service - 活动服务

```javascript
import activityService from '../../services/activity'

// 获取活动列表
const activities = await activityService.getActivityList({ 
  page: 1, 
  pageSize: 20,
  status: 'ongoing'  // ongoing/upcoming/finished
})

// 获取活动详情
const activity = await activityService.getActivityDetail('activity_123')

// 获取活动参与者
const participants = await activityService.getActivityParticipants('activity_123')

// 报名活动
await activityService.joinActivity('activity_123', {
  nickname: '张三',
  phone: '13800138000'
})

// 取消报名
await activityService.cancelActivityRegistration('activity_123')

// 收藏/取消收藏活动
await activityService.toggleActivityCollect('activity_123', true)

// 点赞/取消赞活动
await activityService.toggleActivityLike('activity_123', true)

// 搜索活动
const results = await activityService.searchActivities('搜索关键词')
```

---

### 📚 Exam Service - 考试服务

```javascript
import examService from '../../services/exam'

// 获取所有考试的时间表
const timelines = await examService.getExamTimelines()

// 获取单个考试的时间表
const cet4Timeline = await examService.getExamTimeline('cet4')

// 获取考试列表
const exams = await examService.getExamList()

// 获取考试详情
const exam = await examService.getExamDetail('cet4')

// 获取用户关注的考试
const followingExams = await examService.getUserFollowingExams()

// 关注/取消关注考试
await examService.toggleFollowExam('cet4', true)
```

---

### 📧 Message Service - 消息服务

```javascript
import messageService from '../../services/message'

// 获取未读消息列表
const messages = await messageService.getUnreadMessages({
  page: 1,
  pageSize: 20,
  types: ['system', 'activity', 'exam']
})

// 获取消息列表
const allMessages = await messageService.getMessageList({
  page: 1,
  pageSize: 20,
  type: 'system'  // system/activity/exam/interaction/all
})

// 获取消息详情
const message = await messageService.getMessageDetail('msg_123')

// 标记消息为已读
await messageService.markMessageAsRead('msg_123')
await messageService.markMessageAsRead(['msg_123', 'msg_456'])  // 批量

// 标记所有消息为已读
await messageService.markAllMessagesAsRead()

// 删除消息
await messageService.deleteMessage('msg_123')

// 获取未读消息计数
const count = await messageService.getUnreadCount()

// 获取消息统计
const stats = await messageService.getMessageStats()

// 获取通知设置
const settings = await messageService.getNotificationSettings()

// 更新通知设置
await messageService.updateNotificationSettings({
  system: true,
  activity: false,
  exam: true,
  interaction: true
})
```

---

## 🎨 常见页面改造示例

### 1. 社区详情页 (subpkg_community/pages/detail/detail.js)

**改造前：**
```javascript
_loadPost(id) {
  // 真实场景：wx.request({ url: `/api/post/detail/${id}` })
  const post = MOCK_POST
  this.setData({ post })
}
```

**改造后：**
```javascript
import postService from '../../../services/post'

_loadPost(id) {
  postService.getPostDetail(id)
    .then(post => {
      this.setData({ post })
    })
    .catch(err => {
      wx.showToast({ title: '加载失败' })
    })
}

// 点赞操作
async handleLike(e) {
  const { postId } = e.currentTarget.dataset
  try {
    await postService.togglePostLike(postId)
    this.setData({ 'post.isLiked': true })
  } catch (err) {
    wx.showToast({ title: '操作失败' })
  }
}
```

### 2. 发布页面 (subpkg_community/pages/post-edit/post-edit.js)

**改造后：**
```javascript
import postService from '../../../services/post'

// 发布帖子
async handleSubmit() {
  const { content, images, topics, visibility } = this.data
  
  try {
    await postService.publishPost({
      content,
      images,
      topics,
      visibility
    })
    wx.showToast({ title: '发布成功' })
    wx.navigateBack()
  } catch (err) {
    wx.showToast({ title: '发布失败' })
  }
}
```

### 3. 个人页面 (pages/me/me.js)

**改造后：**
```javascript
import postService from '../../services/post'
import userService from '../../services/user'

async onLoad() {
  // 并行加载用户信息和帖子列表
  try {
    const [userInfo, { data: posts }] = await Promise.all([
      userService.getUserInfo('self'),
      postService.getUserPosts('self')
    ])
    
    this.setData({ userInfo, posts })
  } catch (err) {
    wx.showToast({ title: '加载失败' })
  }
}
```

### 4. 用户资料页 (subpkg_user/pages/user/user.js)

**改造后：**
```javascript
import userService from '../../../services/user'

async onLoad(options) {
  const { userId } = options
  
  try {
    const userInfo = await userService.getUserInfo(userId)
    this.setData({ userInfo })
  } catch (err) {
    wx.showToast({ title: '加载失败' })
  }
}

async handleFollow(e) {
  const { userId } = this.data.userInfo
  try {
    await userService.toggleFollowUser(userId, true)
    this.setData({ 'userInfo.isFollowing': true })
  } catch (err) {
    wx.showToast({ title: '操作失败' })
  }
}
```

---

## ✅ 最佳实践

### 1️⃣ 错误处理

```javascript
try {
  const result = await postService.publishPost(data)
  wx.showToast({ title: '成功' })
} catch (err) {
  // 处理错误
  if (err.code === 'AUTH_ERROR') {
    // 未授权，跳转登录
  } else {
    wx.showToast({ title: err.message || '操作失败' })
  }
}
```

### 2️⃣ 加载状态

```javascript
async loadData() {
  this.setData({ loading: true })
  try {
    const data = await postService.getPostDetail('post_123')
    this.setData({ data })
  } finally {
    this.setData({ loading: false })
  }
}
```

### 3️⃣ 并行请求

```javascript
// ✅ 正确：并行加载多个数据源
const [posts, activities, exams] = await Promise.all([
  postService.getUserPosts(),
  activityService.getActivityList(),
  examService.getExamTimelines()
])

// ❌ 错误：串行加载（浪费时间）
const posts = await postService.getUserPosts()
const activities = await activityService.getActivityList()
const exams = await examService.getExamTimelines()
```

### 4️⃣ 缓存优化

某些数据可以缓存在store中避免重复请求：
```javascript
import store from '../../store/index'

async getUserInfo(userId) {
  // 检查cache
  if (this.userCache?.[userId]) {
    return this.userCache[userId]
  }
  
  // 请求数据
  const user = await userService.getUserInfo(userId)
  
  // 缓存结果
  this.userCache = this.userCache || {}
  this.userCache[userId] = user
  
  return user
}
```

---

## 📋 迁移清单

如果你需要将现有的页面改造为使用services：

- [ ] pages/me/me.js - 使用 postService
- [ ] pages/message/message.js - 使用 messageService
- [ ] subpkg_community/pages/detail/detail.js - 使用 postService
- [ ] subpkg_community/pages/post-edit/post-edit.js - 使用 postService
- [ ] subpkg_user/pages/user/user.js - 使用 userService
- [ ] subpkg_user/pages/edit-profile/edit-profile.js - 使用 userService
- [ ] subpkg_activity/pages/detail/detail.js - 使用 activityService
- [ ] subpkg_activity/pages/list/list.js - 使用 activityService
- [ ] subpkg_exam/pages/detail/detail.js - 使用 examService
- [ ] subpkg_exam/pages/list/list.js - 使用 examService
- [ ] subpkg_setting/pages/setting/setting.js - 使用 userService, messageService

---

## 🚀 下一步

所有API调用已经统一到services中，现在你可以：

1. 【立即可用】在各页面中导入并使用services API
2. 【逐步改造】一个页面一个页面地迁移到新的services架构
3. 【后续增强】如有新的API需求，直接在对应service中添加方法

这样做的好处：
- ✅ 代码更清晰，业务逻辑集中管理
- ✅ API调用可复用，避免重复代码
- ✅ 便于测试和维护
- ✅ 错误处理统一
- ✅ 日志记录完整
