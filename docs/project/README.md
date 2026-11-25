# 项目说明

这里维护工程模块无法替代的项目交互、责任归属和恢复边界。协议来源是 Contracts，当前实现及 Component 公共 API 以源码为准；这里不复制接口全集或逐次交付日志。各页的限制与待验范围也不是生产就绪结论。

## 文件访问与环境切换

COS 公开/私有用途、URL 归属及迁移以 [Backend COS 架构](../../../backend/docs/architecture.md#22-cos-环境与访问类别隔离) 为共同入口。普通读取用后端 URL；公开上传地址由 utils/cos.ts 消费凭证构建；私有材料按业务 access 接口短期授权。静态分享图集中在 config/index.ts 的 defaultShareImageUrl，随环境域名切换，不在页面替换业务 URL。

小程序 config/index.ts 中 develop（开发版）与 trial（体验版）连接 https://test.jualn.cn，release（正式版）连接 https://api.jualn.cn。这里只选择 API 环境与公共静态分享图；不在客户端配置 COS 长期密钥或按环境写死四个桶。公开/私有上传均使用对应后端凭证返回的 bucket/region/objectKeys，普通展示 URL 由业务接口返回，私有读取由 access 接口临时签名。测试 API 本身仍须部署测试 COS 配置；仅客户端 envVersion 不足以证明存储隔离。

填写位置：后端 .env.dev / .env.prod 内的 COS_PUBLIC_URL_PREFIX（完整 HTTPS 前缀）、COS_CUSTOM_DOMAIN（主机名）以及各自 COS_BUCKET / COS_PRIVATE_BUCKET；COS 与其他服务配置放在同一环境文件中，旧桶配置注释保留，由启动器加载对应环境变量。静态分享图在 config/index.ts 的 shareImages.test / shareImages.production 填写完整图片 URL。当前分享图仍使用旧地址，待域名验证后按切换清单更新。

微信后台还须按实际传输方式配置服务器域名：共享 COS 上传统一使用 PUT（wx.request），须将实际 COS 原生桶端点加入 request 合法域名；wx.downloadFile 私有下载须配置对应 downloadFile 合法域名。仅配置公开展示域名不覆盖私有桶下载或原生桶上传端点。完整规则见 [腾讯云小程序 SDK](https://cloud.tencent.cn/document/product/436/31953)，平台白名单不替代 STS/业务授权。

共享上传按 [文件地基 V1](../../../contracts/docs/coordination/file-foundation.md) 的 `file-foundation-v1-r2` 消费（制品 SHA-256：`d24c9cb3f5f85f17719041b61b63c7132b19a31f076920db218d14432267d57f`）。`uploadCosFile` 的默认路径和批量路径均使用单次 PUT，强制携带 `x-cos-forbid-overwrite: true`，调用者不能覆盖；不进入 PostObject 或 SDK 自动分片。批量逐文件上传以限制文件缓冲内存，任一失败使整批失败，不返回部分成功作为可保存引用。`singlePut` 仅保留调用兼容性，传 false 也不能退出安全路径。当前普通文件选择边界为图片 10MB、文档 20MB；专用材料继续遵守各自限制。

SDK 对网络失败可能进行有限 PUT 重试，每次仍带禁止覆盖头；丢失成功响应后的 COS 冲突仍按失败处理，不能凭 URL 或冲突推断就绪。普通上传重试由原业务重新申请对象，不在工具内删除、覆盖或自动改走旧协议。COS 成功仅表示传输完成，原业务保存成功才正式保留；普通媒体、头像不新增管理端 Attachment 登记/候选期限，积分和学习材料保留专用身份与恢复流程。业务写入结果未知不自动重发 POST，也不删除对象；按原业务读取恢复，无法确认时需保留未知结果。

[上传回归脚本](../../scripts/test-file-foundation.mjs)使用仓库实际打包 SDK 与模拟 wx 传输验证这些客户端路径，不能证明 COS 精确对象授权、版本控制下不可变、服务端接管/清理或真机域名配置。启用新保证前还需 Provider 联验，并确认旧宽权限凭证退出、旧客户端升级/停用上传；客户端适配本身不代表生产已切换。

## 人员、账号与本人业务

人员业务使用 unified r4 / Person r5 breaking 输入；积分消费者按 [Points r6 交接](points.md)调整，既有跨域 r5 输入锁不自动重锁；先看独立人员说明，再读领域文档。旧 User 主体、taskId 寻址和 r2/r3 验证不能作为当前实现基线。

| 任务 | 说明 |
|---|---|
| 当前 Person 绑定、跨域主体和固定输入 | [独立人员与绑定](independent-person-r5.md) |
| 只读人员积分、申报/结束门禁与私有上传恢复 | [本人积分](points.md) |
| 名单领取、当前党建身份、导师认证展示 | [党建身份与导师认证](people-qualification.md) |
| PERSON/ACCOUNT 学习分配、成果和私有文件 | [LearningTask](learning-task.md) |
| 本人成长历史、组织内分享与专属图片/视频 | [成长档案](growth-record.md) |
| Profile 编辑、缓存与昵称头像跨页同步 | [当前用户状态](current-user-state.md) |
| 普通身份与管理身份、关闭的活动发布入口 | [RBAC 边界](rbac-v1.md) |
| 微信小程序码确认后台登录 | [Admin QR Login](admin-qr-login.md) |

## 内容与活动

| 任务 | 说明 |
|---|---|
| 主首页与校园辅助页 | [栏目首页](red-home-layout.md) |
| 六型分类与栏目名称（不接入首页） | [党建栏目清单](party-columns.md) |
| 宣传内容列表、详情与历史内容入口 | [官方宣传内容](official-content.md) |
| 资讯阅读、组织署名、正文媒体与互动 | [Article](article.md) |
| Post 社区、导师答疑、问题保护及开放控制 | [Post 与导师答疑](post-mentor-qa.md) |
| 活动筛选、分页、受众范围及刷新 | [活动发现列表](activity-discovery-list.md) |

## 通知与共享 UI

| 任务 | 说明 |
|---|---|
| 基础交互现状、代表接入与逐步迁移 | [基础能力审计与迁移](frontend-interactions.md)；稳定规则见 Engineering 11 |
| 消息列表、Badge、阅读、Banner 与外部入口 | [消息中心](notification-center.md) |
| 接收意愿、站内消息、服务号绑定与订阅 | [通知偏好与渠道](notification-preferences.md) |
| 通用图标接口、资源归属与维护 | [Icon System](icon-system-v1.md) |
| 图标形状、配色与场景规则 | [图标视觉语言](icon-visual-language.md) |
| 评论面板参数、事件及父页面责任 | [comment-panel](../../components/comment-panel/README.md) |
| 海报画布任务、降级和分享 | [分享图片](../../utils/share_poster/README.md) |
| 发布排除和包体积审计口径 | [代码包交付](package-delivery.md) |

工程规则见 [Engineering](../engineering/mini-program/README.md)，仓库事实见 [Profile](../engineering/mini-program/project-profile.md)，固定输入和旧版验证记录见 [输入与证据](../operations/README.md)。旧记录不参与当前业务规则维护。
