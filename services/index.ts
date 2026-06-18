// index.ts
/**
 * Services 统一导出
 *
 * 所有业务逻辑和API调用都应该通过services进行
 */

// 认证相关
export * as authService from './auth';

// 帖子相关
export { default as postService } from './post';

// 评论相关
export { default as commentService } from './comment';

// 交互相关
export { default as interactService } from './interact';

// 媒体相关
export { default as mediaService } from './media';

// 用户相关
export { default as userService } from './user';

// 活动相关
export { default as activityService } from './activity';

// 考试相关
export { default as examService } from './exam';

// 消息相关
export { default as messageService } from './message';

// 通知轮询调度
export { default as notificationCenter } from './notification-center';

export { default as reportService } from './report';

export { default as searchService } from './search';

/**
 * 使用示例：
 *
 * // 单个导入
 * import postService from './services/post'
 * import { userService } from './services'
 *
 * // 或者在需要时导入特定方法
 * import { publishPost, getPostDetail } from './services/post'
 * import { getUserInfo, updateUserInfo } from './services/user'
 */
