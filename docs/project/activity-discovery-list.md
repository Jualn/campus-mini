# 活动发现列表实现与启用

2026-10-08：消费者源码已实现，用户确认后端已支持后启用主动受众查询。提供方符合性、历史部门 ID 核查、真实 HTTP、微信编译及设备验收未由本次客户端工作独立验证。

## 协议与启用边界

以 [跨端协调](../../../contracts/docs/coordination/activity-discovery-list.md)、[用户端操作](../../../contracts/api/paths/user.yaml) 和 [活动 Schema](../../../contracts/api/schemas/activity.yaml) 为权威。此次读取的 SHA-256 快照：

| 文件 | SHA-256 |
| --- | --- |
| api/openapi.yaml | EF5350DBC7386DAA3D202E480181C0EED970187256D63AD6304814ADC831C939 |
| api/paths/user.yaml | 1A6D9B7B5D3A0D43BC8392F6AD955E002A39251564F21EAF9A1FE6BE06E8C020 |
| api/schemas/activity.yaml | 401C9202A76704EE8079AE75E056B742ABA45AB91E07977C6667DE173DD6B81D |

这些摘要只定位消费者采用的文件，不证明后端运行版本。

用户确认后端已实现支持后，消费者直接使用主动受众查询，旧支持判断开关已移除。发现页默认显式 ALL + ACTIVE，范围控件包含全部范围、全院和五个固定学科部。仍需进行受控联调，核对所需历史部门映射与提供方行为；不得通过 HTTP 成功推断过滤生效，也不得失败后静默降级。

## 所有权与交互

- [发现 Page](../../subpkg_activity/pages/list/list.ts) 持有关键词、单选分类、生命周期、学科部、列表及 cursor。搜索和普通列表走同一查询逻辑；切换条件清空结果/cursor，不在首批数据上筛选或重排。
- [活动筛选组件](../../subpkg_activity/components/activity-filter/index.ts) 在搜索区下方展示一行状态、分类和学科部入口，用两列点选面板替代原生 picker 与横向状态滚动。组件只拥有面板开合与展示，通过语义事件提交单选结果；选完或点击遮罩收起，页面隐藏时关闭，重复选择不重新请求。实际遮罩、触摸和键盘表现仍待微信运行时验收。
- 原生下拉刷新保留条件，从第一页替换结果；失败保留内容。首屏、刷新、续页错误分别呈现；续页错误保留 cursor，无效 cursor 提供第一页恢复。所有刷新结束及查询/身份取消路径停止指示。
- 追加按活动 ID 去重并保留服务端次序；以 nextCursor 判断是否还有下一页，搜索计数只标为已加载。
- 请求代次、账号订阅和卸载保护阻止旧查询/身份结果写入。Page 内存保留结果，不新增全局列表缓存。读取有效期在 [Activity 配置](../../subpkg_activity/config/activity-list.ts) 与 [Community 配置](../../subpkg_community/config/activity-list.ts) 中统一为 60 秒，包审计校验副本一致性，是客户端刷新策略，不是 HTTP 保证。
- 报名提交/修改/取消成功通过报名 Page → 详情 Page 的 EventChannel，再通过卡片的 `changed` 事件通知发现 Page。返回时刷新受影响列表；直接进入详情或报名页没有 opener 时仍可运行。
- [结构化范围目录](../../utils/activity-audience.ts) 同时供固定筛选项和共享卡片使用，不从 audienceSummary、位掩码、当前结果或缓存推断部门。卡片最多显示两个部门及数量，优先显示所选部门；未知 ID 明确待确认。详情完整展示范围、参与对象说明及有序 Section，不解析资格规则。
- [社区活动搜索](../../subpkg_community/services/search.ts) 使用同一 canonical DTO/卡片含义，默认显式 ALL + ACTIVE。帖子搜索保持既有接口。旧 `/v1/search/activities` 客户端入口及无消费者的旧数值映射退出，未删除提供方接口。

## 分包与验证

活动卡片映射归属 Activity/Community 分包；event-api、时间线工具和列表有效期策略按普通分包规则保留本地副本，[包审计](../../scripts/audit-packages.mjs) 校验一致性。共享组件所需的小型范围目录保留在主包；未把活动 Service 搬入主包。

已运行 `pnpm typecheck`、变更文件 ESLint、`pnpm test:activity-discovery`、活动详情、社区搜索与订阅回归、包审计及发布排除回归。新增测试验证组合查询、分页/去重、失败保留/重试、刷新、迟到响应、账号变化、卸载、范围映射、社区协议映射、报名成功失效通知及无 opener 入口；属于模拟/静态证据。

已有 `test-activity-registration.mjs` 在学号错误文案断言处失败：期待“学号应为 7 开头的 10 位数字”，当前未修改的 Service 返回“请输入正确的学号”。本次未更改该断言或报名校验规则；新增失效通知另有通过的模拟测试。

未取得微信开发者工具编译、WXML/WXSS 渲染、原生下拉与键盘、真实账号/HTTP、最终编译包大小及设备证据。启用前按跨端协调验收表验证服务端完整集合过滤、受众组合及 cursor 绑定；模拟测试不能证明这些提供方行为。
