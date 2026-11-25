# 当前用户资料与跨页面展示同步

协议权威：[coordination](../../../contracts/docs/coordination/user-profile-homepage.md)、[paths](../../../contracts/api/paths/profile.yaml)、[schemas](../../../contracts/api/schemas/profile.yaml)。本页维护客户端展示与恢复责任，不表示目标环境接口已验收。

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

只提交 nickname、bio、avatarObjectKey、backgroundObjectKey；省略保留，bio 空串清空；不发头像/背景 URL、userId、运营标志或只读字段。昵称 10、简介 200 按 Unicode code point 计数，不静默截断，不检查昵称唯一性。本人和他人主页都展示最终有效背景；null 时保留渐变。候选背景仅在编辑页预览，失败不进入共享有效资料；本期不提供头像或背景删除。

共享错误映射区分 422 /problems/profile-content-rejected 和 503 /problems/profile-safety-check-unavailable。失败保留草稿和原有效资料，不把预览当成保存。传输失败/未知 5xx 不自动重试；下次显式提交前强制读取有效资料，读取失败阻止写入。失败不能证明服务端未保存。

当前 canonical 更新方法为 POST，仍为显式部分修改；失败保持草稿与原有效资料。目标环境的内容安全、媒体检查和旧 writer/callback 切换需独立验收。

## 主页和作者

- [主页组合](../../actions/user.ts) 分别读取 Profile 与已有 Post 作者查询；Post 失败显示列表错误，不伪装为空，不隐藏成功读取的资料。Profile 不聚合列表。本人公开入口复用本人缓存；公开页销毁丢弃迟到响应。
- 他人主页删除喜欢 tab、加载方法和请求，tab 事件也无法越过限制。本人旧入口保留，共享 Post Action 加本人 ID 检查；不据此声称后端 ownership 已保证。
- [共享身份标识](../../components/operator-badge/index.wxml) 的运营图标只在 isPlatformOperator === true 时显示，用于本人/他人主页，以及本人 Profile 投影覆盖的帖子卡片、详情、评论、回复。组件可按已确认的展示数据呈现运营或导师图标，点击打开对应详情；组件本身不读取接口。
- [作者投影](../../utils/user-projection.ts) 仅覆盖匹配本人 userId 的昵称、头像和运营标志；复用帖子 Behavior、详情、评论订阅，保留内容/分页/点赞。没有逐作者 Profile 查询，没有新增 N+1。
- Post/Comment 作者摘要缺正式 isPlatformOperator，其他作者不显示标志；移除静态 verified=true。其他作者昵称/头像随领域列表刷新更新，不承诺跨用户实时同步。
- 帖子卡片、详情、评论、二级回复头像均以编码 userId 导航。空简介为 UI 空值，不写默认文案。

## 关联领域的验收边界

| 领域 | 当前依赖与后续 |
|---|---|
| Post | 本人/他人列表复用 Post 查询；公开可见性与作者摘要按当前 Post Contract 核对，不由 Profile 定义或增加私有主页接口 |
| Like | 本人旧入口保留；provider 需验证本人 ownership、内容可见性和分页，客户端限制不替代授权 |
| Activity | 当前主页不展示活动模块；如需新增，先确认发布归属/过滤契约，不根据活动推断身份 |
| Media | 保留现有 COS/objectKey；真实媒体、头像背景检查与回调隔离需目标环境证据 |
| Auth/legacy | 权限继续归 Auth。Profile 无 legacy adapter；后端旧路径移除需另轮确认全部消费者和匿名政策 |

## 验证入口与待验

[Profile 回归](../../scripts/test-profile-contract.mjs)和 [当前用户回归](../../scripts/test-current-user.mjs)分别检查消费表示/表单恢复，以及缓存/会话隔离/本人作者投影。它们使用 VM/mock，不证明真实持久化、内容安全或微信/COS。

[消费者 HTTP 脚本](../../scripts/test-profile-http-flow.mjs)需要后端受控测试提供 loopback endpoint，不能单独运行后把前置失败称为 HTTP 结果。既有链路中的平台、鉴权、媒体和 UserService 为替身，不能代表数据库或部署验收。目标环境写入、媒体检查/回调隔离、实际头像背景渲染和设备交互仍须验证。

## 当前会话退出

设置页调用普通POST /v1/auth/logout，只发送退出时捕获的原Token，禁止自动刷新/重放。明确成功才清理本地账号状态；网络或存储未知保留原Token供显式重试，不显示退出成功。退出等待在途登录完成，迟到登录结果先注销其候选Token再丢弃，不能回写账号。退出开始即保存退出标记，阻止启动、普通认证传输和401后台重新登录；未知结果保留原Token但不恢复认证业务，设置页显式重试后结束旧会话，后续主动登录成功才清除标记。登录/退出请求和响应均按敏感内容隐藏日志。这里不处理其他设备或独立Admin会话。
