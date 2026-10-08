# 服务、协议与通知集成边界

## 证据范围

本文件承接旧指南中仍有价值的边界提醒。2026-09-13 只审查了文档和路径存在性；未核验服务签名、端点、事件常量、发送接收方或实际轮询行为。实现与协议未定位前，不照抄旧示例。

## 服务与分包

旧 Services 指南顶部已有提醒：早期 JS 示例不是当前活动分包路径清单。其链接的续开发指引也不存在，因此不再保留该跳转和旧方法清单。

活动、公共事项及其他分包开发先识别功能归属、对外入口与依赖方向，再确定调用链。不要为复用方便把分包代码搬入主包，也不要按旧示例强制从一个根级 services 聚合入口导入。Action、Service、API 的名称不自动证明责任；按[架构模块](../engineering/mini-program/02-architecture.md)保留有独立职责的层。

## API 与类型

旧类型汇总来自 2026-05-11 的本地 Swagger，提及的 services/api-types.ts 不存在。它不能继续作为字段、枚举、分页、登录返回或代码生成来源。旧数据管理指南内要求后端返回 permissions/settings 的示例同样不构成协议要求。

跨端变更先定位项目指定的协议来源，确认它覆盖所改端点及版本；已有客户端类型只说明客户端当前理解，不能反过来定义后端协议。如果该端点缺少契约，应在实现前明确双方需要共同遵守的字段和语义。当前 canonical 协议位置已记录在 [Profile](../engineering/mini-program/project-profile.md)，为同级 contracts/api/openapi.yaml；客户端手维护的消费类型不成为协议权威。

## 通知与事件

2026-09-30 消息中心整组切换 structured representation / summary / batch-read / read-through，复用原 App、Banner、tabBar、认证、HTTP 与路由；新的责任链、会话生命周期和验证缺口见 [Notification 客户端](notification-center.md)。下文 2026-09-27 的消息消费链是旧实现历史，当前以该客户端说明和最新 Contract 为准；偏好/渠道边界继续有效。

2026-09-27 已核验当前责任链：`App` 在前台启动 `actions/notification-center.ts`，该 owner 轮询服务端未读总数并通过 `NOTIFY_UNREAD_CHANGE` 同步 tabBar；横幅只消费未读列表的展示模型。消息页通过 `actions/message.ts` 调用 `services/message.ts`，再由 `services/api.ts` 访问 canonical `/v1/users/me/notifications...` 操作。列表使用不透明 `cursor` 和 `items/nextCursor`，未读数始终使用独立总数响应，不用当前页推算。

Activity/PublicEvent 六组偏好与能力快照由 `subpkg_setting/actions/notification-preferences.ts` 持有当前登录期的内存快照，退出登录清空；`subpkg_setting/services/notification-preferences.ts` 负责 canonical 响应到设置页行模型的映射。2026-10-07 核对引用后，两者移入唯一使用方设置分包；会话与退出登录语义保持不变。服务端返回的偏好与 capability/permission 分开展示，未知值不提升为可发送或已授权。互动/系统设置仍属于旧 `/v1/setting` owner，本轮不扩张新偏好产品。

2026-09-28 canonical 修订后，偏好读取的 `503 /problems/notification-preferences-unavailable` 是明确的迁移门槛，不是六组偏好全部关闭。设置页有本次登录期快照时保留已有展示，无快照时展示暂不可用态；只允许用户显式重试 GET，不回退旧设置、不循环重试。`LEGACY_MIGRATION` 仅显示为“沿用旧设置”，不表示微信身份或授权。D1 已确认为最小改动：关闭 IN_APP 只影响之后的规划，客户端不清除历史消息、不重置已读，重开也不补发。

2026-09-29 Contracts 新增 `POST /v1/users/me/notification-preferences:batch-update`，作为原生客户端对既有 PATCH 的兼容写入入口；两者共用同一偏好事实、请求、校验、原子性、503 门槛和完整成功表示。设置页六组偏好均可修改，保存期间串行化以避免完整响应乱序覆盖；成功直接使用返回表示更新登录期快照，不额外 GET。渠道 unavailable 只影响实际送达资格，不阻止保存意愿，也不能显示为已授权。

同日能力原因展示进一步对齐：微信渠道尚无 Adapter/模板 mapping 时，设置页优先显示“通知通道尚未配置”，不把 `permission=UNKNOWN` 单独解释成用户授权异常。服务号绑定入口使用当前环境的 API baseURL，开发版不再跳转生产入口；从 H5 返回设置页后显式重读偏好与能力，不能把进入 H5 前的快照继续显示为最新事实。

服务号 `ACTIVITY_START_REMINDER` 完成 canonical 代码串联后，Contracts 增加 `PROVIDER_VERIFIED_AT_SEND`：它只表示服务端已具备该类型的模板/Adapter，并在实际发送时由微信权威校验本次订阅资格，不等于“已授权”或保证送达。设置页把这一状态计入可投递能力，并在聚合文案中显示“发送时由微信校验”；仍要求 `unavailableReasons` 为空，缺少服务号身份时不会误报可发送。其余服务号类型和全部小程序通知仍未接通，不复用这一状态或模板。

设置页中的渠道开关只表达应用层接收意愿：站内消息由应用直接控制；服务号还需独立完成身份绑定和微信侧订阅。开启服务号开关前用简短弹窗说明该边界。小程序绑定入口先通过带应用登录态的 `GET /v1/wx/bind/oauth-url` 获取后端生成的一次性 OAuth URL，再交给 WebView；绑定完成后，用户仍需从服务号菜单的 `/third/wx/mp-oauth/subscribe/start` 流程单独开启通知，客户端不得自行拼接 token 或混用两种 state。当前小程序订阅消息没有模板/Adapter/授权动作，因此保留后端偏好与 capability 契约但不在设置页展示该渠道；不能用应用开关替代 `wx.requestSubscribeMessage` 或服务号订阅。

保留的设计边界：

- 横幅展示、用户点击、未读数变化和列表失效是不同含义；事件只通知变化，不替代持久状态或后端事实。
- 接入前核对事件常量、payload、唯一发送方、实际消费者与生命周期。页面/组件退出时释放自己的订阅；不要因为旧文档建议“补监听”就重复接入。
- 点击后的导航与标记已读属于应用协调；聚合通知、缺失消息身份及失败重试应按当前业务语义处理。
- 预览数据和真实通知需要明确区分，预览成功不能证明真实消息链路可用。
- 不把帖子创建/更新事件混入通知契约，也不把已有 EventBus 推广为所有跨页状态的默认实现。

若后续修改通知功能，应在这里用核验后的责任和契约替换待核验描述；不要恢复旧文件中的“当前实现”声明。通用资源生命周期与状态边界见[运行时模块](../engineering/mini-program/04-runtime-lifecycle-state.md)。

返回[项目文档](README.md)。
