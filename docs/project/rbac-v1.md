# 小程序 RBAC 与身份边界

当前范围是普通业务、关闭的旧活动发布和既有扫码确认。协议见 [canonical OpenAPI](../../../contracts/api/openapi.yaml)、[RBAC operations](../../../contracts/api/paths/rbac.yaml)及 [Mini 能力评审](../../../contracts/docs/reviews/rbac-v1-mini-program-capability-review.md)。评审的 CONTRACT READY 仅针对该范围，不代表运行、设备或发布就绪。

## 普通身份与管理身份

普通 Mini Token 不调用 adminBearerAuth 的 `getMyAdminCapabilities`，不持有 Admin token，不建立第二套管理权限缓存。当前范围没有依赖普通 Token 通用管理能力读取的正式业务；不能把未读取伪装为已读到空权限，也不因此增加接口。

role、登录摘要、历史 capabilities、公开 Profile 或通知渠道能力均不能推导操作权限。Profile 缓存只服务展示，认证会话归 Auth，Person 绑定与业务资格另有权威来源。党建身份、导师资格和本人业务遵守各领域规则，不由管理角色代替。

## 旧活动写入退出

Activity 管理写入归独立管理端。校园发布入口、深链接路由和 API 创建/旧 AI 上传/流写入均关闭，不因账号 role 或未来能力读取而恢复。既有普通活动浏览、报名、订阅及普通 Post 发布继续沿 owning API。

[活动写入边界](../../utils/activity-publishing.ts)在网络前拒绝旧调用；[API](../../services/api.ts)不重定向到 admin API。未来若产品确认手机管理需求，再评审操作、身份和最小契约，不将旧入口作为当前待接入清单。

## 扫码登录

[确认页](admin-qr-login.md)只使用普通身份调用 scan/confirm/reject。scan 不授予管理权，confirm/consume 由服务端重新裁决。正式准入仅使用 ASSIGNMENT，残留 LEGACY 和旧 scalar 角色不产生准入；客户端不与旧 role 做 OR、不发送 userId/role/permissions。账号或同账号 Token 变化后清旧状态并重新 scan，禁止旧会话迟到确认触发返回。

## 验证入口与待验

`pnpm.cmd test:rbac` 包含本范围和既有消费者/扫码回归；Node/VM 与 Mock 网络不证明 Provider 的实时授权。真实账号授权/撤权、绕过 UI 的服务端拒绝、同环境微信扫码、完整编译、设备与发布须单独验收。独立业务门禁（导师资格、原生 PATCH、私有 Provider）不因 RBAC 范围评审通过而解除。
