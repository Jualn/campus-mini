# Notification / 消息中心客户端实现

协议权威：[协调约定](../../../contracts/docs/coordination/notification-center.md)、[OpenAPI](../../../contracts/api/openapi.yaml)。本页维护客户端责任与交互边界，不表示 Provider 已部署或微信已真实送达。

## 文件与复用

| 归属 | 文件 / 责任 |
|---|---|
| 原消息页 | [Page](../../pages/message/message.ts)、[WXML](../../pages/message/message.wxml)、[WXSS](../../pages/message/message.wxss)：保留顶部导航、卡片视觉、骨架、load-state 和分页反馈，切换结构化单条卡片 |
| 视图模型 | [message-model](../../pages/message/message-model.ts)：类别展示、服务端快照、ID 去重 |
| 会话协调 | [notification-center](../../actions/notification-center.ts)：轮询、Badge、串行已读、入口恢复、身份保护、session suppression |
| 原 Banner | [组件](../../components/in-app-banner/index.ts)：复用动画、自动关闭和手势；隐藏清理与 structured 点击 intent |
| 原网络边界 | [API](../../services/api.ts)、[request](../../utils/request.ts)、[error](../../utils/error.ts)：共享操作入口；私密 payload 不记录，HttpError 独立保留 problemType 识别失效 cursor |
| 协议消费 | [notification service](../../services/notification.ts)、[手维护类型](../../types/notification-contract.ts)：校验首版 NotificationItem / NotificationListResponse，列表不发送或依赖 representation |
| 导航 | [notification-target](../../utils/notification-target.ts)：复用 routes 和 wxNavigateTo，只接受已知 semantic target |
| App / 配置 | [App](../../app.ts) 读取 onShow.query.notificationId；[环境配置](../../config/index.ts) 集中维护轮询间隔 |
| 原事件 / 类型 | [event-bus](../../utils/event-bus.ts)、[business](../../types/business.ts)：沿用通知事件，添加 Banner 清理、semanticTarget，列表失效事件可携带确认已读 IDs |
| 验证 | [测试脚本](../../scripts/test-notification-center.mjs)：真实模块 HTTP 映射、状态逻辑及 Page/Component 模拟 |

继续使用原 authReady / ensureLogin / token 恢复与 HTTP 错误处理。自定义 tabBar 仍通过 getUnreadCount 和 NOTIFY_UNREAD_CHANGE 更新；不增加另一套 Store、请求层、路由体系或持久 Storage。

## 消息页与阅读

页面为顶部全局 Badge / 全部已读、全部 / INTERACTION / ACTIVITY / SYSTEM tabs、按服务端顺序的独立通知卡片、分页 footer、empty/error/loading、已读重试提示。ACTIVITY 包括活动与公共事项。筛选提交 boxCategory 并重置分页，不对已加载数组做全量分类假设。headCursor 与 nextCursor 分开，前者始终为全分类边界。

卡片展示可选 actor 的真实头像/昵称、presentation.title/body/context/thumbnailUrl/changes、createdAt 与未读标记。无 actor 时使用类别图标，不伪造系统用户。subject 原样保留；上下文用 presentation，导航只用 target。未知 type/category 保留快照，未知目标仍可已读。取消旧的客户端互动合并和文案语义猜测。

有效展示标准：页面可见、视图 ready，卡片在避开 sticky header 和底部 tabBar 的可视区域内至少显示一半，经过短延迟仍在区域内。IntersectionObserver 收集 IDs，350ms 合并提交，单批最多 50 个；离开/换分类/卸载取消 observer 和待提交 timer。请求返回 / setData 本身不读。长卡片未达标准仍可主动点击。

POST batch-read 服务有效展示与单条点击。重复 changedCount=0 正常；unreadCount 是权威计数，不按数组长度或 changedCount 扣减。成功事件按 IDs 更新布尔展示，不伪造 readAt。展示写失败保留未读、显式重试；Banner/外部点击失败在当前账号保存待重试 IDs，消息页只重试已读写，不重复导航。

全部已读用 POST mark-read-through，携带当前列表全局 headCursor，任何分类下均覆盖全部分类。成功直接更新 Badge，并重读列表核对边界之后的新项。invalid-cursor 只重新展示新边界、提示用户再次点击；不自动用新范围重放旧操作。未读数可以仍大于零。

## 前台、Banner 和身份

App.onShow 启动 owner；登录后首次 summary 不带 afterCursor，只建立 baseline/Badge，忽略历史 Banner。单个在途 summary，完成后按当前环境 notificationPollIntervalMs（20 秒）安排下一次 GET；后续带 cursor，提示 latestNewNotification 并推进 headCursor。newCount 不转换为 suppression 后的可弹数量。cursor 失效时下一次重新 baseline。

App.onHide 清 timer、丢弃 cursor、清 Banner；旧 session 返回不能更新 Badge、推进 cursor 或弹 Banner。重新进入前台重建 baseline。临时后台保留当前登录会话 suppression，退出/身份改变清空。状态只在内存，不上传、不持久化、不作为已读事实。

Banner 只展示增量最新项；出现/自动消失/关闭/swipe 均不读。structured 点击由 owner batch-read，再复用 semantic router。隐藏 Page 不排队，App/登录清理同步清队列。摘要与已读写串行，防止旧 count 覆盖新 count；账号 revision 阻断旧身份结果与跳转。首次 count 未取得时不宣称没有未读。

## 外部入口与导航

App.onShow.query.notificationId 作为不透明身份解析；先 suppress，再等待原登录流程，GET 本人 Notification、单项 batch-read、semantic target 导航。不从微信 page path 或主体 ID 猜 Notification，不要求它属于 Box。404 给友好错误，GET 不读。

| target | 真实页面参数 |
|---|---|
| POST_DETAIL | subpkg_community/pages/detail/detail?postId=…；可选 commentId 编码透传 |
| MY_POST_DETAIL | Community 本人帖子结果；仅用 postId 私有读取 |
| MY_POST_COMMENT_DETAIL | Community 本人评论结果；仅用 commentId 私有读取 |
| MY_REPORT_DETAIL | 本人举报脱敏结果；仅用 reportId 读取 |
| ACTIVITY_DETAIL | subpkg_activity/pages/detail/detail?activityId=… |
| PUBLIC_EVENT_DETAIL | subpkg_public_event/pages/detail/detail?publicEventId=… |
| ARTICLE_DETAIL | subpkg_red/pages/article-detail/detail?articleId=…；可选 commentId |
| LEARNING_TASK_DETAIL | subpkg_user/pages/learning-task-detail/detail?assignmentId=…；不猜旧 taskId |
| 缺失 / 未知 | 保留通知与已读能力，提示暂无可打开详情 |

Box、Banner、external 共用 mapping。主体撤下/删除由现有详情错误处理，不回滚 Notification 已读。通知 batch-read 的 404 阻断旧目标导航、触发列表和 summary 重取，不恢复旧接口、不假装成功。其他网络读取写入失败保留既有可靠目标导航与待重试已读提示，重试只写同一 ID。外部仅送达而未点击不会已读。NORMAL/QA Post 详情向 comment-panel 传 focus-comment-id，通过普通社区 context API 直接定位根和具体回复；目标失效提示但保留可访问帖子，未知目标继续保留文本与已读。具体微信页面定位仍需运行时验收。

通知导航同时传递资源与可选 commentId，不先打开普通详情再追加定位页。微信外部通知成功解析、通过身份及可用性检查后，统一重建“首页 → 目标详情”，覆盖冷启动直接详情和后台旧页面栈；返回详情上一层为首页。消息中心和 Banner 保留点击前的返回路径；当前页已经是同一资源时替换当前详情并传入新的定位参数，不增加一层。导航串行执行，新的导航意图替代尚未执行的旧意图；外部入口被新入口替代、切换账号或进入后台时，不继续打开旧目标。这里统一的是入口与页面栈；具体评论可定位范围仍取决于各详情的实现及已接受的 API，Article 现有首屏匹配不等于跨分页／回复精确定位。

## 个人删除与到期同步

消费 Contracts 的 `notification-inbox-lifecycle-2026-10-29` 工作树修订，期限及可见性仍归服务端。卡片删除使用个人 DELETE；204 后立即移除内存卡片、清理待重试已读与 Banner，再重读列表和 summary，不写已读、不按本地数量扣减。重复点击在途受保护，重复 DELETE 的 204 同样按服务端计数收敛。删除响应丢失时显示结果未确认并只做读取核对，不自动重发删除。

列表、summary、删除与已读沿用同一会话串行队列；所有列表读取同时读取 summary。前台轮询成功后重新核对可见列表，覆盖跨设备删除和无其他写请求的自然到期；分页不推进首屏的固定全局 head。隐藏时清除 Page 列表快照，再次显示必须从服务端重取。没有新增持久通知缓存，也不按设备时间自行计算服务端 90 天边界。

确认 DELETE 或单 ID 已读/恢复 404 的 ID 在当前登录身份内禁止恢复，列表、迟到响应、分页、Banner 和外部单条恢复均受保护。混合 batch 404 不能识别哪个成员无效，因此整体不写已读、不逐项探测后自动重放，只重取服务端事实。身份变更清除这些内存状态。可见性重取失败时清除旧卡片并展示加载恢复；删除已确认而 summary 暂不可用时隐藏未知 Badge，后续成功读取恢复。

## 展示与兼容

顶部保留全局未读数量与分类入口，刷新展示同步提示。长标题、正文、上下文可原地展开；有可靠 changes 时显示“原 / 现”，不根据历史 SYSTEM 文案猜结构。展开仅是渲染状态，几何变化后重新观察可视区，不改变服务端顺序或阅读事实。

可选纯文本 subjectTitle / quote 分别展示主体标题与原文；只有二者均省略时回退旧 context，不能用 context 补造另一字段。actor 与头像使用响应冻结快照，缺头像用类别图标，不逐人读取当前 Profile。

客户端提交前去重已读 ID，保留服务端 items 顺序，不按时间、ID 或未读状态重排。历史 SYSTEM fallback 保留 category、快照与已读能力；Like 发生及通知去重归 Provider，客户端不创建、撤销或重建通知。

只消费首版 NotificationItem / NotificationListResponse；列表不传 representation，也不要求响应提供该标记。旧消息 Action/Service、InboxNotification/isRead 响应类型和旧列表/无边界全部已读封装已移除，页面的 isRead 仅由 readAt 派生或已确认的已读响应更新。Provider 响应缺少必要字段时保持错误态，不回退旧接口；全部已读始终提交固定全局 throughCursor。轮询失败保留最近可信 count，发布前核对整组操作和阅读事实。

## 实例与验证边界

运行时 Set 在 onLoad 按 Page 实例创建。骨架退出并完成 setData 后才观察通知卡片，隐藏取消 observer/timer，首屏尚未结束就隐藏时重新进入应恢复加载。通用生命周期规则见 Engineering，不在这里建立新 Store 或事件模型。

[专项脚本](../../scripts/test-notification-center.mjs)是 HTTP 映射与 Page/Component 模拟入口；类型检查、模拟和单文件模板编译不能证明 Provider 的原子已读/ownership、Like occurrence、微信外部参数或设备可视区行为。真实 HTTP/迁移、完整编译与渲染、前后台/手势/长文本、具体评论定位、真实点击和最终包体积均需单独证据。

[HTTP 联调脚本](../../scripts/test-notification-backend-http.mjs)使用首版列表、单条恢复、批量已读和有界全部已读，不再验收旧通知接口或旧记录兼容。它需要配套隔离启动器提供独占 MySQL/Redis、登录会话和 fixture；只接受显式提供的 loopback 地址，无默认业务地址或凭据。当前 Backend 已移除原 NotificationCrossEndHttpTest 启动器，此脚本尚需与当前隔离 fixture 对接，不能将语法检查视为真实联调通过。Backend 现有专项验证及各自替身边界见[通知首版验证](../../../backend/governance/commands.md#通知首版验证)；这些机制不能证明微信开发者工具、双设备或真实订阅消息投递。

偏好和渠道见 [通知偏好](notification-preferences.md)，当前学习任务目标见 [LearningTask](learning-task.md)。
