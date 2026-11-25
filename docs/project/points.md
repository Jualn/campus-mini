# 本人积分

协议权威为 [Points operations](../../../contracts/api/paths/points.yaml)、[schemas](../../../contracts/api/schemas/points.yaml)及 [Points r6 交接](../../../contracts/.validation/points-v1-r6-handoff.md)（`points-v1-r6`，未上线直接替换）；人员/绑定沿用 [固定 r5 输入](independent-person-r5.md)。User 是操作与提交账号，账务主体为当前绑定的 Person；旧 User 双读和 LEGACY_UNRESOLVED 兼容不属于当前基线。

## 页面与状态

“我的”进入 [人员积分页](../../subpkg_user/pages/person-points/index.ts)，当前提供只读汇总与流水。无绑定、档案不可用、依赖故障和真实空账本分开；响应按当前 personId 校验，绑定变化立即移除旧账。不能把旧历史提交账号当作当前访问主体。

“我的积分”提供 [积分申请](../../subpkg_user/pages/points-apply/index.ts) 和「我的申请」入口。表单包含事项、说明、服务端受理组织和私有证明材料。唯一受理组织预选，多项需选择；资格不足或依赖失败不允许新提交。四个积分页面统一使用现有自定义导航与底部安全区，不混用原生红色导航。申请表单按字段显示必填与长度错误，材料错误与提交错误分区反馈；提交未知结果锁定原表单，用原操作恢复；成功后可进入详情，不把提交成功当作积分到账。

[我的积分申请](../../subpkg_user/pages/points-applications/index.ts) 提供全部/待审核/已通过/已驳回/已结束筛选、一基分页、失败重试和刷新。翻页失败保留已读记录，筛选/刷新丢弃旧响应；详情和已有积分流水页之间有正常Page导航。历史读取不以当前仍有申请资格为前提，最终人员归属由现有consumer和Backend校验。

[申请详情](../../subpkg_user/pages/points-application/index.ts) 展示事项、说明、真实审核/结束状态与备注；通过后仍引导查看实际积分与冲正流水。驳回/结束可进入新申请，不能沿用旧材料自动重交。PENDING 本人申请提供结束入口，理由必填；首次结束需原生二次确认，取消保留理由且不发起操作，未知结果恢复沿用原操作且不重复确认；原受理周期失效后仍可结束，旧申请不转交、不重开。结束结果未知时锁定原理由并复用原操作，先读取终态，再决定是否按原 key 重放；管理员先完成审核时展示真实审核结果，不宣称结束成功。结束意图只在当前 Page 实例保留，不新增跨页面持久化。材料元数据逐件读取且关联原申请，单件失败不隐藏审核结果；每次预览重新授权获取短签名，使用无Bearer的签名下载，不把签名放进render data/Storage或日志，不走公共预览服务。仅使用临时文件，文档关闭菜单，图片菜单在平台支持时关闭；返回、页面销毁/普通后台隐藏、绑定变化后尽力清理。原生查看器临时隐藏与销毁分开；已下载或打开的副本不能靠后续撤权追溯收回。

[展示状态](../../subpkg_user/services/points-state.ts)中的 submissionReady 表示客户端申请流程可用，closeReady 为 true；这些本地标志不表示真实 Provider/发布就绪。新增页面使用现有申请和上传操作，不改服务器资格、材料权限或幂等语义；换账号/人员绑定清空本地草稿。文件选择器临时隐藏页面不当作销毁。

受理候选必须是服务端完整合法集合；唯一候选可预选，多项明确选择，消失的选项不保留，缺失/失败不是无组织。原组织消失或同组织新周期不能沿用原受理依据；候选失败时显示不可确认，不宣称已失效。申请与历史展示按服务端状态，不伪造审核字段或凭客户端阶段授权。

## 逻辑意图与材料

[申请/结束/上传操作](../../subpkg_user/services/points-operation.ts)保留原正文和幂等 key。申请响应丢失时，有已知 ID 则先 GET，无 ID 按原 key 恢复，不用标题或列表猜测。结束未知结果先重读原申请，仍 PENDING 才按原意图重放；审核竞争获胜返回真实终态，不能称结束成功。不删除、不转交旧申请、不自动重新申报。

历史 applicantUserId、submittedBindingId、operatorUserId、acceptanceBasis 与材料原 ownerUserId 不随换绑改写；当前 Person 的历史访问不等于迁移原账号草稿或所有私有文件。新临时材料仍须属于当前账号，已结束申请的材料不自动复用于新申请。

私有上传保留 POINTS 用途，按 [COS 工具](../../utils/cos.ts)的单 PutObject 与限定头策略发送；未知 PUT 先用原 uploadId/index/key 登记恢复，不静默换对象/换 key。签名按每次授权获取，不缓存为公开 URL，不借用 Article/Post/LearningTask 的媒体语义。

## 验证入口与待验

[Points 脚本](../../scripts/test-points.mjs)及 [单 PUT 脚本](../../scripts/test-cos-single-put.mjs)分别是消费与合成平台边界检查入口；脚本核对 r6 handoff 的修订与 SHA 清单，样本按 Person 主体及 r6 accounting/流水消费。历史 r2 隔离 HTTP 证据见 [输入与证据](../operations/README.md)，不能作为当前 r6 Provider 或页面通过证据。

新增表单的 [Page定向测试](../../scripts/test-points-apply-page.mjs) 使用 Node 模拟验证入口、资格/组织、材料映射、上传失败、重复提交、UNKNOWN恢复与账号/绑定变化清理；不是微信运行时或真实Backend证据。当前 r6 基线的真实绑定/换号、受理周期、终审竞争/幂等、人员账务归属、材料授权、真实 COS/STS/ACL/CORS/内容检查和微信内存/进度仍需独立验收，不能用旧r2成绩证明r6端到端可用。

[记录页定向测试](../../scripts/test-points-record-pages.mjs) 使用Node替身验证列表分页/筛选竞争、失败保留、状态、路由编码、详情权限错误、私有签名不进data、不发Bearer、临时文件清理及绑定切换后的晚到下载不打开。单页wcc/wcsc只证明模板/样式可编译，不证明全项目微信运行时、真实签名下载或预览/设备通过。既有独立人员 r5 输入锁保留，不自动重锁；积分消费者按 r6 交接及其 handoff 清单验证，不能将其视为整个跨域锁已更新或真实 Provider 验收。

积分材料新增 VIDEO/video/mp4，沿用每文件10MiB、本人私有上传/登记与未知结果恢复；图片走微信安全检查，PDF/Word/视频暂不做自动内容审核。聊天文件选择可选MP4；详情经授权签名下载到临时文件后用原生 previewMedia 播放，不保存签名URL；返回、切换人员或卸载时清理临时文件。后端至少检查 MP4 文件头，当前深度格式检查可停用，不保证编码、时长或可解码性已验证；真机播放与真实Provider仍须另验。

申请详情/列表消费服务端最小姓名、原组织名称及 accounting，同屏区分原审核积分与当前有效核发；REVOKED 显示已撤销及 0 分，不覆盖原审核历史。审核说明及原始 GRANT 的 reason 可缺省。详情可进入按 applicationId 筛选的本人账务链，显示原审核核发、每次 REVERSAL 和 CORRECTION_GRANT 的金额/原因/依据，分页不漏掉纠错正向流水；当前有效金额以服务端 accounting 为准，不从未读完的分页推断。全账本汇总继续使用服务端余额/累计口径。

POINT_GRANT_CORRECTED 复用消息中心的 SYSTEM 文字快照及普通已读流程，无详情目标时不猜跳转，不迁移旧账号通知/草稿，不新增微信渠道。视频继续沿用已有 VIDEO/video/mp4 私有上传、登记、授权下载和原生预览；客户端测试不表示 Provider 的 VIDEO 解析与实际 COS/设备链路已通过。
