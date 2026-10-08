# 项目设计与集成说明

这里保存通用工程模块无法替代的项目知识。文档来源于已有设计材料；2026-09-13 整理时只核对内容和文件存在性，未逐项核验实现。它们不是已验证的运行时快照，不据此把 Profile 改为 ACTIVE。

| 任务 | 文档 |
|---|---|
| 当前用户资料、缓存、跨页昵称头像同步 | [当前用户状态](current-user-state.md) |
| 服务与协议入口、通知集成注意事项 | [集成边界](integration-boundaries.md) |
| Structured 消息中心、前台会话、外部入口和已读 | [Notification 客户端](notification-center.md) |
| 管理后台 v2 小程序码入口、身份绑定、确认/拒绝与验证边界 | [Admin QR Login](admin-qr-login.md) |
| 评论面板参数、事件、父页面职责 | [comment-panel](../../components/comment-panel/README.md) |
| 画布任务、海报降级与分享 | [分享图片](../../utils/share_poster/README.md) |
| 发布排除、主包审计口径与最终编译体积 | [代码包交付](package-delivery.md) |
| UiIcon v1、semantic registry、P0 覆盖与静态验证 | [Icon System v1](icon-system-v1.md) |
| 图标形状、笔画、配色、选中态和业务语义 | [图标视觉语言](icon-visual-language.md) |

通用规则见[工程索引](../engineering/mini-program/README.md)，当前事实核验见[Profile](../engineering/mini-program/project-profile.md)。只有任务改变了相应项目决策，才维护这里的文档；不要复制一份新的工程规范、接口字段全集或每个服务的方法清单。

## 本轮整理结论

- 五份旧数据管理指南重复同一套 App/Store/Storage 结构，并把局部 UI 状态、滚动位置强制放进全局 Store。通用职责已由工程模块 02/04 覆盖，旧指南移除。
- 旧 Services 指南包含不存在的 JS 路径和续开发指引；保留分包边界提醒，移除旧服务方法与迁移清单。
- 旧 API 类型汇总是 2026-05-11 的 Swagger 快照，链接的生成文件不存在。移除字段副本，不将它迁入 Contracts。
- 当前用户同步与评论面板有独立的设计/集成价值，迁到各自归属；通知文档的中心文件已不存在，只保留边界与待核验点。
- 海报与图标说明保留在资源/工具旁，删去临时改稿叙述，修正图标目录。

旧文档已在项目外逐文件备份并校验，不保留一套仍会被误读的旧规范入口。此次整理不更改任何业务实现或发布流程。
