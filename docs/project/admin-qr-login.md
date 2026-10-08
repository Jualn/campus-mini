# 管理后台扫码登录（小程序端）

协议权威是 [Admin QR Login v2 协调文档](../../../contracts/docs/coordination/admin-qr-login.md)及其引用的 OpenAPI，本文只记录客户端责任和实施证据。

## 入口与责任

确认页为 `subpkg_setting/pages/admin-login-confirm/index`，已注册于 `app.json` 的设置分包。只读取 `onLoad(options).scene`，执行一次 URI decode 后校验 canonical sceneCode。微信数字启动场景值不是凭证；无效入口不发送请求。当前原生 page 入口无需 App 转交 query。

Page 拥有展示、明确确认/拒绝、期限提示、请求代次和生命周期；[分包 API](../../subpkg_setting/services/admin-qr-login.ts)拥有手机端 scan/confirm/reject 操作和响应展示字段投影；共享 request 负责普通小程序 bearerAuth、直接成功对象和 Problem Details。旧流程从未上线，已按 2026-10-07 用户决定删除设置页扫码入口及其 Action/Service/API/类型。使用微信扫一扫直接进入新确认页，唯一协议为 v2。

scan 不自动 confirm。只有最新 scan 返回 SCANNED 且客户端期限尚未结束时展示可用操作；服务端期限和授权始终权威。用户明确确认或取消，经对应操作返回成功状态后自动回退；扫码直达没有上一页时重建首页，原生导航触发页面卸载并释放订阅。scan 读到既有终态时保留结果和返回按钮，不自动退出。CONSUMED/EXPIRED/REJECTED/CANCELLED 禁用操作。手机端不请求 Web 状态、图像或 consume，不持有 Admin token/pollSecret，也不上传 userId/role/permissions。

确认页使用白色原生导航栏和黑色文字，登录目标、有效时间、操作区分开排版。有效时间按设备当地时间显式格式化为“今天 HH:mm”或带日期的易读时间，倒计时按分/秒显示，不使用带时区后缀的 locale 输出。状态栏外观、真实设备上的排版和自动回退效果仍需真机验证。

普通身份稳定后才 scan；订阅现有 Store 的 userInfo 身份变化，清除旧绑定及展示并重新 scan。Page unload 释放订阅和计时器、清空 scene；hide 只暂停展示计时，重新 show 用 scan 核对当前状态。迟到请求用代次与 subject 检查丢弃。scene 仅存在当前 Page 内存和 HTTP 请求体，不落 Storage、不进入请求日志。

## 认证与失败恢复

共享 request 新增可选 `retryAuth: false`，默认行为保持既有认证恢复。该模式要求等待身份稳定期间凭证不变，并且 401 不自动恢复或重放请求；v2 使用此模式，Page 恢复普通认证后只重新 scan，要求用户再次确认。连续 401 只自动恢复一次，随后提供用户重试，避免循环认证。避免确认动作在新身份下自动继续执行。

HttpError 保留解析后的 `retryAfterMs`（支持 Retry-After 秒数或 HTTP 日期），429 在冷却期限前禁止重新发起操作，冷却结束后允许用户重新 scan。无自动轮询或密集重试。网络中断/500 等不证明确认失败，页面禁用原操作并提供重新 scan，读取服务器最新状态后再决定是否可以确认。错误根据 `problem.type` 展示无权限、他人占用、非法 scene 和终态；invalid-state 等顺序冲突重新 scan，不直接重试原 mutation。

## 验证与交付边界

2026-10-07 实施；本地验证命令：`pnpm typecheck`、修改文件的 ESLint、`node scripts/test-admin-qr-login.mjs`、`pnpm audit:packages`、`node docs/engineering/mini-program/scripts/check-docs.mjs`。

Node/VM 回归覆盖真实 Page → 分包 API → request，网络和微信平台为 Mock；覆盖合法/非法及一次 decode 的 scene、认证等待、不自动确认、重复点击、确认/拒绝、终态/期限、Problem Details、401 重新 scan、429 冷却、Unknown Outcome、身份变化和卸载后的迟到响应、日志隐藏、默认 legacy 401 恢复。它不证明微信编译、扫码跳转或真实服务端原子绑定。

使用本机开发者工具附带的 wcc/wcsc 对新增页 WXML、页面 WXSS 及 app.wxss 做本地编译，均退出 0；这是文件编译证据，不是开发者工具完整项目编译或运行证据。

微信开发者工具完整项目编译、冷启动/前后台切换、真实微信小程序码进入分包、同 AppID/环境的三端联调和真机验证仍待执行。发布顺序遵守 Contracts：先发布确认页，再由 Backend 验证目标环境可达性并启用 v2 小程序码。本次不执行远程预览、上传或发布。
