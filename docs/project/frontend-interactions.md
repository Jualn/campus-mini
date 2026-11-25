# 基础交互与状态恢复

本文维护当前公共能力及页面接入边界。源码与 Node/VM 模拟证据不代表微信运行时、Provider 或发布验收；协议仍以 Contracts 为准。交互规则见 [Engineering 11](../engineering/mini-program/11-ui-interaction-accessibility.md#project-interaction-rules)。

## 公共能力及使用契约

| 能力 | 归属与使用边界 |
|---|---|
| 请求、错误、提示 | [request](../../utils/request.ts) 不展示 Toast；[error](../../utils/error.ts) 的 isReadAccessError 标识认证、403、404 等读取失效；[notify](../../utils/notify.ts) 负责短提示。保留读取与写入不同的认证重放规则，不自动重发结果未知的写入 |
| 当前资料与账号 | [current-user](../../actions/current-user.ts) 的 watchCurrentIdentity 包括昵称/头像变化，用于展示同步；watchCurrentAccount 仅观察账号 ID 转换，用于编辑会话隔离。订阅不发请求，Page 卸载必须解除。Person 变化继续由 [person-binding](../../services/person-binding.ts) 失效，不从资料展示或组织名称推断资格 |
| 登录意图 | [auth](../../actions/auth.ts) 的 ensureLogin 默认是被动消费，尊重退出标记；只有明确用户操作可传 interactive:true。原 token 尚未确认退出时仍不允许新登录。消息提供主动微信登录，不因进入 Tab 自动撤销退出意图 |
| 加载与列表 | [useListLoad](../../behaviors/useListLoad.ts)、分包 useAsyncLoad、[load-state](../../components/load-state/index.ts) 负责展示阶段；请求代次、游标、筛选和授权由 Page/领域操作拥有。首屏、刷新、更多必须分开，失败重试原阶段 |
| 未保存离开 | [leave-guard](../../utils/leave-guard.ts) 的 createLeaveGuard 为每个编辑 Page 创建实例，返回函数接受 dirty:boolean，Page 在 onShow 调用其 resume()；后台完成不得修改另一 Page 的提醒，仅在状态转换时调用受能力检测保护的原生离开提醒。不存储草稿；隐藏不销毁，用户确认放弃或业务受理后清提醒。不能替代幂等和未知结果恢复 |
| 文件与媒体 | 普通媒体继续走 [media](../../actions/media.ts)/[cos](../../utils/cos.ts)；学习、积分、成长保留专用登记、访问和恢复语义。取消选择是无变化，真实失败应反馈；上传成功不是业务受理 |
| UI | 复用 [UiIcon](../../components/ui-icon/index.ts)、[全局变量](../../app.wxss)、卡片、骨架、原生选择器和评论半屏。反馈行为统一，不要求页面外观完全相同 |
| 标题栏 | 继承应用 `navigationStyle: custom` 的页面可在顶部使用 [page-navigation](../../components/page-navigation/index.ts)。传入 `title`，组件处理状态栏高度、胶囊避让及 [back-button](../../components/back-button/index.ts) 返回。默认随页面滚动，`fixed` 固定在顶部并自动占位，`surface="page"` 使背景跟随页面底色。`background-color` 可指定与深色标题搭配的浅色背景，`surface="brand"` 将品牌红铺满标题栏及状态栏区域，并设置浅色前景。需要自定义返回时传入 `auto-back="{{false}}"` 并监听 `back`；悬浮和行内返回可直接使用 `back-button` |

## 页面接入与恢复

- 资讯与官方内容列表：同条件刷新保留最后成功的 items、游标和 hasMore，成功后替换；筛选/身份变化清理旧查询，旧响应不落地。分页失败显式重试原游标。官方内容 WXML 状态采用表达式绑定。
- 资讯详情：刷新不先销毁正文/评论组件，保留已渲染正文范围；互动状态重新确认，404/失权仍清除正文并通知来源列表。文章收藏共用项目标题栏；隐藏后仍重新读取本人关系。
- 学习详情：重读状态时清除旧 ETag 并禁用提交，不清空输入与附件；选择/上传/提交期间不启动冲突刷新，原生选择返回后再确认版本。保留 assignment 主体、私有成果及同一 operation 恢复。
- 活动报名：再次显示与普通重查保留 dirty 答案，并更新服务端基线/资格；412 与未知结果读回保留独立处理。原生离开保护与自有“查看活动安排”确认配合使用。
- 资料编辑：账号转换推进编辑代次、清草稿与选图，迟到选择/上传不能提交到新账号；同账号资料显示更新不丢草稿。读取新基线不直接覆盖未保存输入。
- 成长：昵称/头像变化不清草稿，账号/绑定变化仍清理。原生离开提醒覆盖输入、媒体修改及未确认提交；新建沿原 key 恢复。详情互动状态读服务端，更多菜单收纳管理操作；受控媒体继续每次授权和清理。
- 积分：刷新资格按稳定组织 ID 保留仍有效选择；申请草稿离开有提醒，UNKNOWN 继续锁原操作。可见状态的刷新/分页失败保留可用快照，认证或访问否定则清理。
- 校园与我的：帖子请求成功和失败均须对应当前代次；校园账号变化清理旧帖子和游标。首页区分“查看介绍”与“进入功能”，我的入口按参与学习、身份积分、内容互动组织。
- 公共事项：列表返回按短时效读取，不每次显示都重新截回首批；账号切换失效，分页失败保留旧记录并重试原分页。

## 安全清理与局部连续性的边界

消息的隐藏清理及再次显示服务端核对，保留删除、到期、跨设备、404 和未知已读/删除结果规则，不恢复旧卡片作为后台事实。成长和积分的私有页面隐藏清理也继续保留；不能为了保存滚动位置绕过当前授权。可见页面的同查询刷新与失权清理是不同操作，不应都实现成清空后首屏加载。

通知资格、业务 ETag、私有签名与临时媒体不是普通缓存；视觉改版应保留 Page/领域操作以及组件语义事件，避免把请求和授权逻辑移入样式组件。无全站轮询、全局页面缓存或新的 Store。

## 验证入口与未决边界

- [连续性回归](../../scripts/test-uiux-continuity.mjs)：账号/展示变化、原生提醒、资料选图与上传竞争、官方列表刷新与分页、选择失败、模板和导航配置。
- [基础交互](../../scripts/test-frontend-interactions.mjs)、[退出安全](../../scripts/test-security-foundation.mjs)、[报名](../../scripts/test-activity-registration.mjs)、[Article](../../scripts/test-article.mjs)、[学习](../../scripts/test-learning-task.mjs)、[消息](../../scripts/test-notification-center.mjs)、[积分申请](../../scripts/test-points-apply-page.mjs)与[记录](../../scripts/test-points-record-pages.mjs)继续验证原边界。
- TypeScript、定向 ESLint、源码包审计及本地 wcc/wcsc 编译是不同证据。模板/样式编译不等同完整开发者工具运行、真机或真实 Backend/COS 联验。
- Post/成长编辑使用正式 POST :edit 兼容入口，见 [Post 说明](post-mentor-qa.md#原生编辑兼容)。Provider 先提供入口，再发布客户端；不自行改写其他 PATCH 或增加 method override。
- 原生离开提醒对手势/系统退出的实际覆盖、键盘、半屏背景滚动、媒体预览返回、大字号、长内容和辅助技术仍需微信设备验收。不承诺进程退出后恢复私有草稿。

## 设计参考

保持微信原生交互及现有浅色蓝黄识别，参考 [微信设计入口](https://developers.weixin.qq.com/miniprogram/design/)及[微信官方设计团队的 WeUI WXSS](https://github.com/Tencent/weui-wxss)的按钮、列表、反馈、阅读和 ActionSheet 分工；不引入其运行时依赖。官方设计站点当前抓取不可用，不把未读取内容或类型声明当作新平台能力的运行证明。
