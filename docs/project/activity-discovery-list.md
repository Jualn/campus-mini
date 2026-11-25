# 活动发现列表实现与启用

2026-10-08：消费者源码已实现，用户确认后端已支持后启用主动受众查询。提供方符合性、历史部门 ID 核查、真实 HTTP、微信编译及设备验收未由本次客户端工作独立验证。

## 协议与启用边界

以 [跨端协调](../../../contracts/docs/coordination/activity-discovery-list.md)、[用户端操作](../../../contracts/api/paths/user.yaml) 和 [活动 Schema](../../../contracts/api/schemas/activity.yaml) 为权威。客户端调用与投影见 [Activity API](../../subpkg_activity/services/event-api.ts)。协议来源与提供方符合性分别核验，不在这里维护摘要副本。

用户确认后端已实现支持后，消费者直接使用主动受众查询，旧支持判断开关已移除。发现页默认显式 ALL + ACTIVE，范围控件包含全部范围、全院和五个固定学科部。仍需进行受控联调，核对所需历史部门映射与提供方行为；不得通过 HTTP 成功推断过滤生效，也不得失败后静默降级。

## 所有权与交互

- [发现 Page](../../subpkg_activity/pages/list/list.ts) 持有关键词、单选分类、生命周期、学科部、列表及 cursor。搜索和普通列表走同一查询逻辑；切换条件清空结果/cursor，不在首批数据上筛选或重排。
- [共享筛选组件](../../components/filter-bar/index.ts) 在搜索区下方展示一行状态、分类和学科部入口，用两列点选面板替代原生 picker 与横向状态滚动。组件只拥有面板开合与展示，通过语义事件提交单选结果；选完或点击遮罩收起，页面隐藏时关闭，重复选择不重新请求。组件提供蓝、红、绿、琥珀四种色调，活动使用默认蓝色；实际遮罩、触摸和键盘表现仍待微信运行时验收。
- 原生下拉刷新保留条件，从第一页替换结果；失败保留内容。首屏、刷新、续页错误分别呈现；续页错误保留 cursor，无效 cursor 提供第一页恢复。所有刷新结束及查询/身份取消路径停止指示。
- 追加按活动 ID 去重并保留服务端次序；以 nextCursor 判断是否还有下一页，搜索计数只标为已加载。
- 请求代次、账号订阅和卸载保护阻止旧查询/身份结果写入。Page 内存保留结果，不新增全局列表缓存。读取有效期在 [Activity 配置](../../subpkg_activity/config/activity-list.ts) 与 [Community 配置](../../subpkg_community/config/activity-list.ts) 中统一为 60 秒，包审计校验副本一致性，是客户端刷新策略，不是 HTTP 保证。
- 报名提交/修改/取消成功通过报名 Page → 详情 Page 的 EventChannel，再通过卡片的 `changed` 事件通知发现 Page。返回时刷新受影响列表；直接进入详情或报名页没有 opener 时仍可运行。
- [结构化范围目录](../../utils/activity-audience.ts) 同时供固定筛选项和共享卡片使用，不从 audienceSummary、位掩码、当前结果或缓存推断部门。卡片最多显示两个部门及数量，优先显示所选部门；未知 ID 明确待确认。详情完整展示范围、参与对象说明及有序 Section，不解析资格规则。
- [社区活动搜索](../../subpkg_community/services/search.ts) 使用同一 canonical DTO/卡片含义，默认显式 ALL + ACTIVE。帖子搜索保持既有接口。旧 `/v1/search/activities` 客户端入口及无消费者的旧数值映射退出，未删除提供方接口。

## 分包与验证

活动卡片映射归属 Activity/Community 分包；event-api、时间线工具和列表有效期策略按普通分包规则保留本地副本，[包审计](../../scripts/audit-packages.mjs) 校验一致性。共享组件所需的小型范围目录保留在主包；未把活动 Service 搬入主包。

验证入口：`pnpm.cmd test:activity-discovery` 及受影响的详情、搜索、订阅回归。脚本中的 wx/HTTP 替身可检查筛选组合、分页、失败保留、旧响应隔离和报名后的失效传播，不证明服务端完整集合过滤、受众组合或 cursor 绑定。

历史报名测试曾存在学号文案断言失败；本文档整理未运行或修复该测试，不将历史状态报成当前结果。完整微信编译、遮罩/触摸/键盘、真实账号 HTTP、历史部门映射、最终包体积与设备仍需独立验收。

## Activity V1 阶段与本人历史

阶段与历史基于 [Activity V1 交接](../../../contracts/.validation/activity-v1-handoff.md)，本人取消来源与作废恢复边界按 [unified-v1-r6 交接](../../../contracts/.validation/unified-v1-final-handoff.md) 更新。客户端类型为本地维护，协议权威仍为 Contracts；`pnpm.cmd test:activity-v1` 核对当前 unified-v1-r6 机器清单内文件哈希，漂移时应重新核对接受的修订，不静默更新目标。

活动和社区搜索卡片、活动详情的阶段仅展示服务端 `stage`，缺少或 UNKNOWN 显示“阶段待确认”，不由 availability、运营 ACTIVE 或 cardTimeline 猜测。发现过滤与完整分页保持原行为。报名及预约成功拥有有效平台名额，混合模式独立提示后续外部步骤；订阅仍不替代报名。本人修改和取消读取服务端 canModify/canCancel；取消 409 刷新最新记录与能力，不重发取消请求。

[我的报名与预约](../../subpkg_activity/pages/my-registrations/list.ts) 归属 Activity 分包，以本人记录 ID 去重、按服务端 cursor 续页；刷新失败保留当前结果，身份变化清空并隔离旧响应，不持久化本人答案。入口位于“我的”及公开详情 404 提示。历史摘要 publicAccess 不可用时不提供公开安排入口，查看本人记录使用单场 GET me 并跳过公开详情；不请求管理预览、不凭通知推定本人关系、不修改原通知。

报名历史不设功能开关，“我的”及公开详情 404 提示提供本人历史入口；读取失败按页面错误状态呈现，不静默降级。既有报名写入不在客户端推算时间或随机选择新旧语义，仍需按 Contracts 兼容切换安排固定 Provider 与受支持客户端。启用不代表 Provider 已完成联验；客户端实现和模拟回归不证明真实 HTTP、时间准入事务、通知 Worker、微信编译或设备验收。

本人记录与历史仅在 cancellationOrigin=ADMIN 时显示管理员作废，展示可选 cancellationReason 并禁止重新提交；SELF 保留原恢复规则，来源缺失或 UNKNOWN 仅显示已取消，不推断操作者。提交返回 registration-invalidated 后只读回当前记录，当前页面保持禁止恢复，即使旧响应缺少来源也不重发或改用其他报名请求；身份变化清除此页面判断。服务端仍负责最终授权与不可恢复约束。
