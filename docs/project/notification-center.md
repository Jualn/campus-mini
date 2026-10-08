# Notification / 消息中心客户端实现

2026-09-30。协议权威：[协调约定](../../../contracts/docs/coordination/notification-center.md)、[OpenAPI](../../../contracts/api/openapi.yaml)。本次只修改 mini-program；以下是客户端代码与本地检查的证据，不表示 provider 已部署或微信已真实送达。

## 文件与复用

| 归属 | 本轮文件 / 责任 |
|---|---|
| 原消息页 | [Page](../../pages/message/message.ts)、[WXML](../../pages/message/message.wxml)、[WXSS](../../pages/message/message.wxss)：保留顶部导航、卡片视觉、骨架、load-state 和分页反馈，切换结构化单条卡片 |
| 视图模型 | [message-model](../../pages/message/message-model.ts)：类别展示、服务端快照、ID 去重 |
| 会话协调 | [notification-center](../../actions/notification-center.ts)：轮询、Badge、串行已读、入口恢复、身份保护、session suppression |
| 原 Banner | [组件](../../components/in-app-banner/index.ts)：复用动画、自动关闭和手势；隐藏清理与 structured 点击 intent |
| 原网络边界 | [API](../../services/api.ts)、[request](../../utils/request.ts)、[error](../../utils/error.ts)：增加五个操作；私密 payload 不记录，HttpError 独立保留 problemType 识别失效 cursor |
| 协议消费 | [notification service](../../services/notification.ts)、[手维护类型](../../types/notification-contract.ts)：关键响应验证，拒绝错误 representation |
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
| ACTIVITY_DETAIL | subpkg_activity/pages/detail/detail?activityId=… |
| PUBLIC_EVENT_DETAIL | subpkg_public_event/pages/detail/detail?publicEventId=… |
| 缺失 / 未知 | 保留通知与已读能力，提示暂无可打开详情 |

Box、Banner、external 共用 mapping。主体撤下/删除由现有详情错误处理，不回滚 Notification 已读。读写失败不阻断可靠目标，重试只写同一 ID。外部仅送达而未点击不会已读。现有 comment-panel 没有按 ID 恢复/定位公共能力；本轮保留 commentId 而不新增评论查询协议，具体评论定位不属于已验证能力。

## 兼容、启用和验证

### 2026-09-30 Contract reconciliation 核对

已重读最新协调约定、[实施交接](../../../contracts/docs/coordination/notification-implementation-handoff.md)及 canonical 入口引用的 [paths](../../../contracts/api/paths/notification.yaml) / [schemas](../../../contracts/api/schemas/notification.yaml)。本轮四项核对未发现 structured consumer 的业务代码 drift，未改消息页、会话 owner、API、类型或 Like 实现；只补充本节记录和现有测试脚本断言。

| 核对项 | 现有客户端行为 / 结论 |
|---|---|
| duplicate batch IDs | helper 接受重复输入，在构造 HTTP 请求前按 ID 去重；实际提交数组限制 1–50，原 API 也不把重复 ID 当错误。Contract 的原始 50 项上限针对 HTTP notificationIds payload，provider 仍必须先去重再 ownership validation，不能接受原始 51 项请求。客户端本地收集/去重不代替服务端原子校验。无 drift。 |
| structured server ordering | service 保留 items 顺序，view model 仅按通知 ID 去重并顺序 append；不按 createdAt、公开 ID、未读状态重排。分类请求仍使用 boxCategory 与 opaque cursor，全局 headCursor 独立。无 drift。 |
| Like occurrence | Like UI 只执行已有 like/unlike 操作，不创建、撤销或重建 Notification；consumer 只按 Notification ID 去重，不推导 actor+subject+recipient occurrence。首次正向事实、unlike 不撤销、re-like 不新增由 provider 保证，不应由客户端追加规则。无 drift。 |
| historical SYSTEM fallback | category 与 type 独立；category=ACTIVITY、type=SYSTEM、无 changes/target 的历史项可读取、保留快照/readAt、显示为活动分类并调用同一 batch-read。视图空 changes 数组只表达无变更行，不伪造 before/after，也不根据标题还原 change type。无 drift。 |

专项断言覆盖允许重复请求、实际发送数组边界、与 createdAt/ID 相反的服务器顺序、续页去重保序、canonical 历史 fallback 样例及 Like identity 去重。执行 `node scripts/test-notification-center.mjs`、`pnpm typecheck` 和文档完整性检查通过。它们证明当前 consumer 行为；provider 对原始 51 项重复 payload 的拒绝、ownership/原子失败及 Like 首次 occurrence 没有在本轮进行真实 HTTP/数据库验证。

保留 [legacy action](../../actions/message.ts)、[legacy service](../../services/message.ts) 及 API 旧表示、unread-count、read-state、deprecated mark-all client；新消息页和前台 owner 不调用它们。六组偏好/渠道能力与三类 Box filter 独立。

仍按现有 ENV/baseURL 选环境，不增加自动协议探测或伪造 fallback。本地 backend 有新操作和 structured 代码，但不证明目标环境已部署。发布消费者前核对整组操作、历史 readAt 投影和新旧阅读一致性。不支持 structured 时页面保留错误态，轮询失败保留最近可信 count，不切回旧无边界全部已读。

本轮已执行：

- pnpm typecheck、受影响 TypeScript 文件 ESLint。
- node scripts/test-notification-center.mjs：HTTP 映射、可省略 actor、快照/未知类型、分页/分类晚返回、empty/error/loading、viewport 批量读、重复响应、全局 read-through、baseline/增量/隐藏/重启、Banner 非阅读关闭、外部恢复/suppression、失败只重试 read、账号切换、三个目标/未知目标、关键协议响应拒绝。
- pnpm audit:packages：原始文件审计，非最终压缩体积。
- 本机开发者工具 wcc.exe / wcsc.exe 对消息页、Banner、load-state WXML/WXSS 与 skeleton import 本地编译；产物在临时目录，无 preview/upload/发布。
- 文档完整性及本轮文件 diff 检查。

未验证：真实 HTTP/provider 部署与迁移、开发者工具完整项目编译和实际渲染、真机前后台/可视区/手势、微信外部参数与真实点击、具体 comment 定位、最终压缩包大小。VM 模拟和 WXML/WXSS 编译不替代这些证据。

### 2026-09-30 消息页生命周期修复

针对开发者工具报告的 Free data Set 深拷贝警告及 `.notification-card` 未挂载警告：三个运行时 Set 改为在 `onLoad` 按页面实例创建；`useListLoad` 的结束方法支持可选渲染完成回调，消息页等骨架退出并完成 `setData` 后才观察卡片。隐藏时若首屏尚未退出，重新进入会恢复加载。通知协议和阅读业务规则不变。

回归模拟使用真实加载 Behavior，覆盖骨架最短展示时间、渲染完成回调、实例隔离及隐藏后恢复；通过类型检查和业务 TypeScript ESLint。仍需开发者工具实际重新编译并进入消息页，确认原始警告消失及可视区阅读行为。

### 2026-10-07 消息页阅读层级

顶部只保留一次未读数量及分类入口，刷新时显示同步提示。通知标题允许两行，短内容完整展示；较长标题、正文或上下文可以在卡片内展开，即使没有跳转目标也能读取完整冻结快照。标题已经包含昵称时不重复显示昵称；否则保留 actor 展示。

存在可靠 `presentation.changes` 的通知突出变更后值，明确标记“原 / 现”，保留所有变更项；互动上下文使用引用样式。历史 SYSTEM fallback 不按文字推测变更结构。客户端展开状态只用于渲染，不改变 Notification ID、服务端顺序、readAt、target 或已读请求；几何变化后重新观察可视区。

本轮验证：类型检查、消息页 TypeScript ESLint、模型和 Page 回归模拟、WXML/WXSS 本地编译及文档完整性。实际开发者工具视觉、长文本排版与可视区阅读体验仍待运行时确认。

### 2026-10-07 明确展示字段消费

按最新 NotificationPresentation 约定消费可选纯文本 `subjectTitle` / `quote`：主体标题独立显示在通知标题下，原文使用引用样式，本次回复仍显示 `body`。只有两个明确字段均省略时才回退旧 `context`；存在任意一个字段时不重复展示 context，也不据其补造另一个字段。完整快照仍保留在模型中，长主体标题或引用支持原地展开。列表与单条恢复共用新字段类型检查，不接受 null 或非字符串。

actor/头像仍使用响应中的已有冻结快照；缺失头像时显示类别图标，不查询当前用户资料。Contract 交接中的评论/回复头像来源及 provider 新字段生产属于后端待办，本轮未验证实际 HTTP 响应。

类型检查、受影响 TypeScript ESLint、回归模拟和 WXML/WXSS 本地编译通过；测试覆盖双字段、单字段、context-only、空字符串、非法新字段类型及完整长文保留。实际开发者工具渲染、图片加载和 provider 联调未验证。

返回[项目文档](README.md)。
