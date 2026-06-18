# 通知 EventBus 说明

本文集中说明通知相关 EventBus 的事件定义、发送/接收方、payload 结构与使用约定。

---

## 事件一览

| 事件 | 说明 | emit 位置 | on 位置 | payload |
| --- | --- | --- | --- | --- |
| `NOTIFY_BANNER_SHOW` | 通知弹窗展示 | [services/notification-center.ts](services/notification-center.ts) | [components/in-app-banner/index.ts](components/in-app-banner/index.ts) | `NotificationBannerMessage[]` 或单条对象 |
| `NOTIFY_BANNER_TAP` | 通知弹窗点击 | [components/in-app-banner/index.ts](components/in-app-banner/index.ts) | [services/notification-center.ts](services/notification-center.ts) | 单条消息对象 |
| `NOTIFY_UNREAD_CHANGE` | 未读数变化 | [services/notification-center.ts](services/notification-center.ts) | 暂无默认监听 | `number` |
| `NOTIFY_LIST_REFRESH` | 通知列表刷新 | [services/notification-center.ts](services/notification-center.ts) | 暂无默认监听 | 无 |

> 事件常量定义在 [utils/event-bus.ts](utils/event-bus.ts)。

---

## payload 结构说明

### `NOTIFY_BANNER_SHOW`
- 来源：`messageService.getUnreadBannerMessages()`
- 结构：`NotificationBannerMessage`（定义在 [services/message.ts](services/message.ts)）
- 主要字段：
  - `id`：通知 ID（点击后标记已读用）
  - `type`：system/activity/exam/interaction
  - `title` / `content`
  - `targetType` / `targetId`
  - `notificationCount` / `isAggregate`
  - `routeUrl` / `routeMethod`

`in-app-banner` 内部消费字段见 [components/in-app-banner/index.ts](components/in-app-banner/index.ts) 的 `BannerMessage`。

### `NOTIFY_BANNER_TAP`
- 来源：`in-app-banner` 点击回调
- 结构：单条消息对象（同 `NotificationBannerMessage`）
- 约定：`isAggregate` 或缺失 `id` 时不执行标记已读

### `NOTIFY_UNREAD_CHANGE`
- 来源：轮询未读数后触发
- 结构：`number`（未读数）

### `NOTIFY_LIST_REFRESH`
- 来源：点击通知完成标记已读后触发
- 结构：无

---

## 订阅与解绑规范

- 页面/组件在 `attached/onLoad` 订阅，在 `detached/onUnload` 解绑。
- 必须保存引用，确保正确 `off`。
- 事件为“通知型”，不缓存历史状态。

示例：
```ts
const handler = (payload: unknown) => {
  // 处理逻辑
};

eventBus.on(EVENTS.NOTIFY_BANNER_SHOW, handler);
// 页面卸载或组件销毁时
// eventBus.off(EVENTS.NOTIFY_BANNER_SHOW, handler);
```

---

## 发送与接收链路（当前实现）

1. [app.ts](app.ts) 调用 `notificationCenter.start()`
2. [services/notification-center.ts](services/notification-center.ts) 轮询未读数
3. 未读 > 0 时拉取通知并 `emit` `NOTIFY_BANNER_SHOW`
4. [components/in-app-banner/index.ts](components/in-app-banner/index.ts) 接收并入队展示
5. 点击弹窗触发 `emit` `NOTIFY_BANNER_TAP`
6. [services/notification-center.ts](services/notification-center.ts) 标记已读后 `emit` `NOTIFY_LIST_REFRESH`

---

## 预览模式注意事项

`in-app-banner` 的 `previewMode` 开启时使用本地数据源，且会忽略 `NOTIFY_BANNER_SHOW`。
如需联调 EventBus，请关闭 `previewMode` 或使用真实通知数据。

---

## 建议补齐的监听方

- `NOTIFY_UNREAD_CHANGE`：可在消息页或自定义 tabbar 中监听以刷新 badge。
- `NOTIFY_LIST_REFRESH`：可在消息页监听以刷新消息列表。



| 事件 | 说明 | emit 位置 | on 位置 | payload |
| --- | --- | --- | --- | --- |
| `POST_UPDATED` | 帖子刷新 | [pages/index/index.ts](pages/index/index.ts) & [components/post-card/index.ts](components/post-card/index.ts) | [pages/index/index.ts](pages/index/index.ts) |  {postId: string; viewCount: number }|
| `POST_CREATED` | 帖子创建 | [pages/index/index.ts](pages/index/index.ts) |  |  PostCardItem|

