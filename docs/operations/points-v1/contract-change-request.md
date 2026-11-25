# Points r2 历史依赖说明

以下仅保留 2026-10-18 的历史判断，不是当前待实施清单。当前基线见 [独立人员与绑定](../../project/independent-person-r5.md)。当时 Mini 只读复核 `points-v1-r2` / `identity-organization-v1-r1`。本轮未发现需要修改请求/响应/operationId的明确协议冲突，未跨仓库写入或新造接口。

来源：[Points handoff](../../../../contracts/docs/coordination/points-v1/handoff.json)、[Identity handoff](../../../../contracts/docs/coordination/identity-organization-v1/handoff.json)、旧 Backend 隔离验收记录（原路径 `backend/docs/operations/points-v1/backend-progress.md` 已移除，来源无法重新核对）。

## B01 / B02 当时解释

当时 handoff 有 BLOCKED/PROPOSED及旧provider NOT RUN快照；当时记录 Backend 已有真实 Person/Reader/范围及隔离 HTTP PASS，不能再描述为“没有接口/Provider”，也不能据此宣称正式政策/人员授权已批准。正式阶段、有效性和准入确认及人员初始控制批准由各owner处理。Mini只消费服务端资格，不从stage/role、RBAC、ID排序推导。候选政策和合成测试授权不移植为正式授权。

## 已修复，无需改Contract

- 私有STS要求单PutObject与private/forbid-overwrite两头。原Mini SDK默认POST/分片和缺头问题已修复；捆绑SDK合成传输验证通过，真实COS NOT_RUN。
- 未知PUT先按原uploadId/index/key登记恢复；既有契约够用，不新增状态接口。
- 无按key查申请接口，但真实提交后丢失响应仍能同key恢复同资源，不用标题/列表猜测，不申请临时查询接口。
- 未知成员导致审核503，补齐真实完整核实后通过；是正确fail-closed，不请求放宽Person规则。

## 外部条件

真实私有桶/STS/ACL/CORS/内容检查、微信运行时/设备、正式政策/capability/人员批准按owner流程验收。材料仍限IMAGE/PDF/WORD、单件10MiB、最多9件，不借用Post/Article/LearningTask材料语义。本工作区不接管理端16个Person操作、不扩展管理员流水分页或正式页面。
