# 独立 Person 与当前绑定

本页维护当前人员主体及跨域消费边界。固定输入于 2026-10-25；文件完整性不表示运行验收。

## 固定输入、版本与兼容性

输入来自当前机器 sibling Contracts，不能假定其他机器存在该目录。三份 handoff 的 **135 项文件 path/SHA-256 清单完全一致且全部匹配**；固定于 [input-lock.json](../operations/independent-person-v1/input-lock.json)。锁还记录三份 handoff 自身 SHA。其他机器需另行提供这一份精确材料，用 `CONTRACTS_ROOT` 指向它；缺失或漂移时检查明确失败，不能自动下载最新材料、换修订或偷偷重锁。

| 版本维度 | 当前记录 |
| --- | --- |
| unified 契约修订 | unified-v1-r4 |
| Person 契约修订 | identity-organization-v1-r5 |
| Points 契约修订 | points-v1-r5 |
| RBAC 目录版本 | rbac-v1-unified-r2；25 Role、77 Permission；不据此扩权 |
| Duty 目录版本 | unified-duty-v1-r3；31 项；不据此扩权 |
| Person 目录版本 | identity-organization-v1-r4；不得用它替代 handoff r5 |
| Backend / Admin 端版本 | NOT VERIFIED；不能根据本地 Contract 材料推断另一机器版本或能力 |
| accepted compatibility baseline | 无；没有声称做过 accepted baseline 比较 |

**此基线为 breaking**：独立稳定 personId 为业务主体；User 为登录、操作、原投递账号及 RBAC 被授予者。名单正式提交建立/复用 Person 与领域事实，领取只建立账号绑定；Points 按 Person 归账；LearningTask 按 PERSON/ACCOUNT 与 assignmentId 寻址；通知目标改变。协调重构不是向后兼容。客户端不做旧 User 主体双读、不用 userId 伪造 personId，不回填或迁移账号历史。

静态输入复核命令：`node scripts/check-independent-person-input.mjs`（也可 `pnpm.cmd check:independent-person-input`）。这是文件完整性核对，不是测试、Provider 就绪或兼容性验收。

## 跨域消费边界

- [person-binding.ts](../../services/person-binding.ts) 使用当前 Mini Token 调用 `getMyPersonBinding`，每次读取权威当前绑定。UNBOUND 与故障分离；BOUND 保留 personId/bindingId/personStatus/version。只在内存保存观察指纹/代次以丢弃旧响应并通知多个消费方清理本地工作，不作为缓存授权或领域真值，不写 Storage，不修改账号 RBAC/通知。当前绑定前后不一致的领域读失败，不能把旧人员响应发布到新绑定。
- [党建身份与导师](people-qualification.md)分别消费当前绑定和领域资格。成功收据不能授予阶段，名单匹配只描述低强度绑定；当前来源不由领取方式覆盖。资格源不可确认不当成无绑定、无资格或零积分。正式回答前读当前绑定，服务端继续复验当前资格。
- [本人积分](points.md)按当前 Person 读取，保留发生时的提交/操作账号、绑定和受理依据；换绑不搬迁账务或草稿。另提供最小积分申请表单，沿用服务端资格/受理组织和私有上传，真实 Provider 验收仍单独处理。
- [学习任务](learning-task.md)区分 PERSON/ACCOUNT，以 assignmentId 寻址；人员源失败不隐藏账号任务，人员换号不移动 ACCOUNT 成果。
- LearningTask 通知目标必须有 assignmentId，不猜旧 taskId；原收件账号、已读与历史仍归 Notification/登录账号边界。不按 Person 合并通知、复制旧账号权限或复活旧绑定。

## 验证入口与待验

输入锁由既有脚本读取，记录三份 handoff 及 135 项摘要；本页不手工维护第二份清单。2026-10-25 只取得输入、类型/lint、源包审计等静态证据；Mock、真实 Backend、竞争/到期/撤销/重放、完整微信编译和设备均 NOT RUN。旧 r2/r3/r4 成绩不能作本 breaking 基线的 PASS。

真实验证应固定同一份输入及实际端版本，至少覆盖：两账号同时领取一人、同账号领取多人、同 key 响应丢失/重放与新 key 冲突；绑定结束/重新关联/档案归档；未生效/有效/右开期限到期/撤销；资格与绑定源503；导师正式回答/后续回复并发撤销；新账号按同 Person 读原积分，原提交/绑定证据不改；同 task 的 PERSON/ACCOUNT 分配并存、人员换号后 assignmentId 不变而 ACCOUNT 不移动；原账号通知已读及历史收件人不搬迁。Mock/浏览器不能证明上述真实事务和原生设备行为。私有文件 Provider 的原有未联调阻断继续保留，不回退公开附件。
