# 当前用户资料与跨页面展示同步

> 2026-10-07：canonical 读取、主页、作者展示和 POST 编辑已接入；本地受控 HTTP 链路通过。目标环境写能力、微信/COS 与终端展示尚未验收，不能报告为完整上线联调完成。本文不是 HTTP Contract。

协议权威：[coordination](../../../contracts/docs/coordination/user-profile-homepage.md)、[paths](../../../contracts/api/paths/profile.yaml)、[schemas](../../../contracts/api/schemas/profile.yaml)。按用户更新的 Contract 同步客户端和后端 POST 路由；没有证据证明部署环境已具备新接口。

## 模型、读取与缓存

- [消费类型](../../types/profile-contract.ts) 手工投影 canonical 六字段。avatarUrl / backgroundUrl 为正式头像与背景字段，允许 null；userId 为字符串身份，昵称允许重复；不消费 role、status、openid、加入时间。旧 Swagger 文件不是新协议权威，未手改历史生成类型。
- [API](../../services/api.ts) 仅用 GET /v1/users/me/profile、GET /v1/users/{userId}/profile、POST /v1/users/me/profile。没有 Profile legacy adapter 或回退。未上线时显示错误，不把旧表示冒充新模型。
- [Service](../../services/user.ts) 校验表示和目标身份，丢弃未知属性。资料请求设置 sensitive，日志不输出完整 Profile 或编辑 payload。
- [当前用户 Action](../../actions/current-user.ts) 管理五分钟登录期内存缓存、读取合并、保存版本和会话隔离。Store 不请求，完整资料不落盘；登录摘要仅同步昵称/头像，原有权限留在 Auth 边界，不由公开标志改写。
- App/me 前台命中缓存直接展示，过期可先显示再校验；编辑初始化等待读取，下拉刷新强制读取。订阅不发请求，销毁时解除。

## 编辑数据流与启用边界

[编辑页](../../subpkg_user/pages/edit-profile/edit-profile.ts) 保留本地草稿与既有媒体机制：

```text
有效 Profile → 草稿 → 仅计算改动字段
选头像/背景 → 编辑本地预览 → 现有 COS 上传 → avatarObjectKey/backgroundObjectKey
POST → 完整最终有效 Profile → currentProfile → 登录摘要/作者投影
```

只提交 nickname、bio、avatarObjectKey、backgroundObjectKey；省略保留，bio 空串清空；不发头像/背景 URL、userId、运营标志或只读字段。昵称 10、简介 200 按 Unicode code point 计数，不静默截断，不检查昵称唯一性。2026-10-07 Contract 补入背景后恢复编辑入口，本人和他人主页都展示最终有效背景；null 时保留渐变。候选背景仅在编辑页预览，失败不进入共享有效资料；本期不提供头像或背景删除。

共享错误映射区分 422 /problems/profile-content-rejected 和 503 /problems/profile-safety-check-unavailable。失败保留草稿和原有效资料，不把预览当成保存。传输失败/未知 5xx 不自动重试；下次显式提交前强制读取有效资料，读取失败阻止写入。失败不能证明服务端未保存。

**2026-10-07 方法同步**：当前 canonical 为 POST /v1/users/me/profile，仍是显式部分修改，不创建资源。API 使用既有 HTTP POST；本地编辑门禁已由现有工作移除，实际提交仍必须经过 provider 的全部安全检查。后端资料写入总开关已按用户要求移除；新旧写入口直接执行安全检查，实际检查不可用返回 503 时保留草稿与原有效资料。

原 typings 不支持 PATCH 的障碍已通过共同契约修订解决；不再要求原生 PATCH 方案。开启目标环境写能力前仍须验证头像检查、旧 writer / callback 安全切换、目标迁移与真实 HTTP/微信/COS；POST 类型及本地模拟不能代替真机联调。

## 主页和作者

- [主页组合](../../actions/user.ts) 分别读取 Profile 与已有 Post 作者查询；Post 失败显示列表错误，不伪装为空，不隐藏成功读取的资料。Profile 不聚合列表。本人公开入口复用本人缓存；公开页销毁丢弃迟到响应。
- 他人主页删除喜欢 tab、加载方法和请求，tab 事件也无法越过限制。本人旧入口保留，共享 Post Action 加本人 ID 检查；不据此声称后端 ownership 已保证。
- [共享小型图标](../../components/operator-badge/index.wxml) 只在 isPlatformOperator === true 时显示，用于本人/他人主页，以及本人 Profile 投影覆盖的帖子卡片、详情、评论、回复。
- [作者投影](../../utils/user-projection.ts) 仅覆盖匹配本人 userId 的昵称、头像和运营标志；复用帖子 Behavior、详情、评论订阅，保留内容/分页/点赞。没有逐作者 Profile 查询，没有新增 N+1。
- Post/Comment 作者摘要缺正式 isPlatformOperator，其他作者不显示标志；移除静态 verified=true。其他作者昵称/头像随领域列表刷新更新，不承诺跨用户实时同步。
- 帖子卡片、详情、评论、二级回复头像均以编码 userId 导航。空简介为 UI 空值，不写默认文案。

## Deferred

| 领域 | 当前依赖与后续 |
|---|---|
| Post | 复用已有 /v1/post 的 userId 过滤；正式查询、公开可见性、author summary Contract 尚未完成，不增加私有主页接口 |
| Like | 本人旧入口保留；provider 需验证本人 ownership、内容可见性和分页，客户端限制不替代授权 |
| Activity | 缺 publisher 归属/过滤，不展示主页活动模块，不根据活动推断身份 |
| Media | 保留现有 COS/objectKey；canonical 媒体与头像检查未正式衔接，开启写入前需证据 |
| Auth/legacy | 权限继续归 Auth。Profile 无 legacy adapter；后端旧路径移除需另轮确认全部消费者和匿名政策 |

## 验证与交付文件

本地命令：pnpm.cmd typecheck；node scripts/test-profile-contract.mjs；node scripts/test-current-user.mjs；node scripts/test-comment-composer.mjs；针对修改 TS 的 ESLint；pnpm.cmd audit:packages；node docs/engineering/mini-program/scripts/check-docs.mjs；git diff --check。本轮上述检查全部通过：定向 ESLint 零错误/警告，三个回归脚本通过，原始包审计无警告/错误，文档检查 29 篇通过，diff whitespace 检查通过。包审计不是 DevTools 编译体积。

[Profile 回归](../../scripts/test-profile-contract.mjs) 用 VM/mock 验证 canonical 路径和表示、白名单、单字段/头像引用、重复昵称、失败草稿、错误区分、公开喜欢隔离。VM/mock 验证不证明真实 POST/provider 合规。[当前用户回归](../../scripts/test-current-user.mjs) 验证缓存、旧响应、账号隔离、作者投影、标志、注销订阅及未知结果再次提交前读取；[评论回归](../../scripts/test-comment-composer.mjs) 验证既有输入逻辑。

修改文件（不包含用户先前未提交改动）：

- types/profile-contract.ts、types/business.ts
- services/api.ts、services/user.ts、services/post.ts
- actions/current-user.ts、actions/user.ts、actions/post.ts
- utils/request.ts、utils/error.ts、utils/user-projection.ts
- components/operator-badge/index.{ts,json,wxml,wxss}
- components/user-profile/index.{ts,json,wxml}
- components/post-card/index.{ts,json,wxml}
- components/comment-panel/index.{ts,json,wxml}
- components/profile-feed-skeleton/index.wxml
- pages/me/me.{ts,wxml}
- subpkg_user/pages/user/user.{ts,wxml}
- subpkg_user/pages/edit-profile/edit-profile.{ts,wxml,wxss}
- subpkg_community/pages/detail/detail.{ts,json,wxml}
- scripts/test-current-user.mjs、scripts/test-profile-contract.mjs、scripts/test-profile-http-flow.mjs
- docs/project/current-user-state.md

**运行缺口**：DevTools CLI 自动化启动返回 IDE service port disabled，未完成微信编译/自动化或真机验证。没有带凭证 provider 联调或真实 COS 上传；实际安全检查、回调时延、头像导航和图标渲染仍待验收。当前不能宣称目标环境 canonical Profile 已可上线。没有执行 git commit。

回到[项目文档](README.md)。

2026-10-07 方法同步验证：Profile 回归、当前用户回归及 pnpm typecheck PASS；定向 lint 和包审计 PASS。后端 ProfileConsumerHttpTest 启动临时 loopback HTTP 服务，并运行 [消费者 HTTP 回归](../../scripts/test-profile-http-flow.mjs)：实际编辑 Page → Action/Store → Service/API → request → HTTP → Spring MVC/Jackson/Advice，验证部分更新、头像 objectKey、重复点击、422/503 保留旧资料/草稿、成功用最终响应同步而不再 GET。平台、鉴权、媒体上传和后端 UserService 是替身，不证明数据库持久化或微信/COS 接受。与 EffectiveProfileMvcTest、ProfileSafetyCheckTest、ProfileCallbackIsolationTest 合计 13 项，0 failures/errors/skipped（2026-10-07 17:26:35）。单独运行此脚本需要该测试提供的 loopback endpoint；独立后端仓库缺消费者时会跳过此项。

## 2026-10-07 背景能力同步

Profile 响应必须提供 backgroundUrl（无值 null），缺字段按无效响应处理，不能视为用户清空。更新白名单增加 backgroundObjectKey；编辑页恢复背景选择、上传和草稿预览，头像/背景混合上传分别提交引用。失败保持草稿与原有效资料，成功由最终响应同步 currentProfile；共享 user-profile 组件显示当前有效背景，null 使用原渐变底图。保留既有媒体能力，不新增删除背景或裁剪规则。

两组回归验证背景字段/白名单、背景上传失败草稿、头像背景组合提交和共享状态中的最终背景；typecheck 与定向 ESLint PASS。没有运行 DevTools/真机，图片实际布局与真实微信/COS 尚未验证。

背景加入本地 HTTP 回归后，ProfileConsumerHttpTest 经真实编辑页、共享状态、请求层和 Spring MVC 验证背景单改、头像/背景/昵称组合提交、422/503 保留全部旧有效资料及候选背景；成功同步最终 backgroundUrl，不追加 GET。另验证缺失 backgroundUrl 的旧响应不能被误解释成清空。与 EffectiveProfileMvcTest、ProfileSafetyCheckTest、ProfileCallbackIsolationTest 合计 15 项、0 failures/errors/skipped（2026-10-07）。平台、鉴权、上传和 UserService 仍为替身，不是微信/COS/数据库或部署验收。
