# 固定输入与保留证据

这里区分可复核的输入锁与历史验证证据，不提供第二套业务规则。新任务的临时报告、Prompt、截图及日志放在任务专属临时目录，不因已有记录而继续追加逐次报告。

## 当前固定输入

| 材料 | 用途 |
|---|---|
| [独立 Person 输入锁](independent-person-v1/input-lock.json) | unified-v1-r4 / identity-organization-v1-r5 / points-v1-r5，135 项文件 SHA 及 handoff 摘要；由既有输入检查脚本消费 |

输入复核使用 [check-independent-person-input.mjs](../../scripts/check-independent-person-input.mjs)，缺失或漂移应失败；不要为了通过检查手动改锁或重新固定最新材料。消费影响见 [独立人员与绑定](../project/independent-person-r5.md)。锁匹配不证明 Provider、迁移、兼容性或运行验收。

## 历史 Points r2 证据

以下材料属于 2026-10-18 的 points-v1-r2 / identity-organization-v1-r1，不适用于当前 r5 Person/Binding/Subject，也不表示目标部署环境就绪。

| 材料 | 证据边界 |
|---|---|
| [Mini 历史联调记录](points-v1/mini-progress.md) | 隔离 Backend HTTP；外部 Provider 明确为替身；不是微信/COS/生产 E2E |
| [历史依赖说明](points-v1/contract-change-request.md) | 当时的外部条件及消费端问题，不是当前协议变更请求 |
| [Contract 核验快照](points-v1/contract-verification.json) | 当时的输入摘要 |
| [HTTP 脱敏证据](points-v1/backend-http-evidence.json) | 当次请求与结果 |
| [运行信息](points-v1/backend-http-runtime.json) | 当次隔离运行的定位信息，不保证临时路径或容器仍存在 |

既有运行脚本引用这些 JSON 路径，因此保留位置和原始证据内容。重新运行需先确认脚本适配当前修订、隔离环境归属和证据输出位置，不能把旧脚本直接视为 r5 验收入口。
