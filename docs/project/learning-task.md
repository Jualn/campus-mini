# 本人学习任务

协议以 [协调说明](../../../contracts/docs/coordination/learning-task.md)、[operations](../../../contracts/api/paths/learning-task.yaml)、[schemas](../../../contracts/api/schemas/learning-task.yaml) 为准。当前 PERSON/ACCOUNT 主体与 assignmentId 寻址使用 [独立人员固定输入](independent-person-r5.md)，旧 taskId 路由及旧模拟成绩不适用于此基线。

## 页面与归属

“我的学习任务”列表与详情归 `subpkg_user`，复用原生表单、load-state、登录和共享请求边界。列表按 progress 筛选全部、未开始、待审核、已完成及驳回，筛选切换重置游标并隔离旧响应；使用服务端个人 displayStatus，独立呈现任务生命周期及分配撤销；支持游标、刷新、空态及失败重试，不自行推算完成状态。

同一任务的不同责任按 assignmentId 区分。ACCOUNT 核对当前账号，PERSON 核对当前人员绑定；人员源失败时保留账号任务，明确提示人员任务不可确认，不伪装为空列表。详情、确认、成果历史/详情和私有文件均按 assignmentId 寻址，不合并为 taskId。

详情展示要求、审核与截止、确认/完成事实、Article 可用性、当前审核结果及成果历史。最新审核结果单独读取，不能因历史分页隐藏驳回原因。Article 阅读复用已有详情，返回时重读任务；无关联或文章不可读不妨碍展示任务。

## 提交与恢复

[API 消费](../../subpkg_user/services/learning-task.ts)保留强 ETag；确认/提交发送 If-Match 和 Idempotency-Key，禁用认证恢复自动重放，私有请求隐藏敏感日志。纯确认不造空成果，组合要求按 Contract 提交，补交建立新历史。

[逻辑操作](../../subpkg_user/services/learning-task-operation.ts)保留原 key、ETag、正文和未确认结果；先权威对账，再按原意图恢复。成功后重新读取服务端进度，不能把受理当完成。412/428、处理中或窗口冲突不能通过换 key、换 ETag 自动绕过。

Page 代次阻止旧响应。绑定变化清除旧 PERSON 草稿与未决意图；账号不变时不移动或重置 ACCOUNT 成果。隐藏清理截止计时器，前台到期收紧动作并重读；客户端时间只收紧入口，服务端裁决窗口。会话内未确认操作可保留，进程重启不恢复正文，须先 GET 对账；跨进程恢复仍待验收。

## 私有文件与通知

客户端按 [LearningTask V1 冻结交接](../../../contracts/.validation/learning-task-v1-business-handoff.md) 的 `sha256:30d07f91c7a59f9575a54aae8f7061cfca9e8d1e544f5786071ae8ee5c0c30ee` 消费私有文件；这不代表实际 Provider 或发布版本已就绪。图片（JPEG/PNG/WebP）、PDF、DOC/DOCX 每文件不超过 10MiB，MP4 不超过 200MiB，至多 9 个且受任务允许类型/数量限制。聊天文件选择后须显式上传并登记；minimumTextLength=0 时可仅提交附件。后端拒绝/依赖未就绪如实反馈，不回退公开 Attachment 或公共链接。

凭证和上传恢复状态只在 Page 实例内存中保留，不进入 data、Storage 或日志。普通文件复用禁止覆盖 PUT；视频由专用文件模块调用现有打包 SDK 的显式分片接口，每片最多 5MiB，初始化/分片/完成均携带禁止覆盖头，不改动通用上传策略。传输结果未知不登记对象，下次显式重试申请新对象；登记结果未知保留原 uploadId/fileIndex/key 重试，不重传字节。候选到期须重新选择，旧 Provider 省略 unboundExpiresAt 不代表无限期，最终提交仍由服务端重验与接管。正式提交未知结果继续使用原正文、fileIds、ETag 和 key。

历次成果可独立打开原文件，始终沿 assignmentId 查询元数据与 access 重新鉴权。图片使用原生预览，文档私有下载后原生查看（关闭转发菜单，返回/切号/离页清理临时副本），视频使用原生 video 和短期 HTTPS 地址；签名到期、播放错误或隐藏页面清空视频地址，重新打开重新取签名。Range/206、编码、安全核验、不可变对象、清理竞态及私有域名配置仍需 Provider 与真机验证。换账号/换绑隔离旧异步结果及私有草稿，不把 URL 当长期权限。

通知复用账号收件箱与冻结展示，`LEARNING_TASK_DETAIL` 必须携带 assignmentId；未知或缺失目标不跳转，不猜 taskId，不把人员换号用于转移原账号通知。

## 验证入口与待验

[专项脚本](../../scripts/test-learning-task.mjs)覆盖 PERSON/ACCOUNT 样本、页面/HTTP 替身、强版本、同 key 恢复、进度筛选、仅视频成果、候选到期、历史签名重取、失权及换绑；[私有视频上传脚本](../../scripts/test-learning-task-files.mjs)通过实际打包 SDK 与模拟 wx 传输，检查 11/200MiB 分片、5MiB 内存上限、禁止覆盖头和完成后登记。运行命令为 `node scripts/test-learning-task.mjs` 和 `node scripts/test-learning-task-files.mjs`；这些证据不等同于真实服务或微信运行时验收。

真实联调需验证本人授权/隐藏 404、强 ETag、幂等回放与未知结果、确认/补交窗口、撤销/取消/审核并发、PERSON 与 ACCOUNT 并存及换绑隔离、私有文件归属和通知路由。完整微信编译、键盘/页面栈/安全区、设备和 Provider 均需独立证据。
