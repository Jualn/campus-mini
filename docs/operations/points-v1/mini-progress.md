# Mini Points V1 消费端与真实 HTTP 联调

历史记录：本页保留 2026-10-18 r2 的 31 请求/10 操作与 71 哈希证据；不证明后续修订或目标 Provider 就绪，不据此开放入口。当前 r5 基线见 [独立人员与绑定](../../project/independent-person-r5.md)，材料分类见 [输入与证据](../README.md)。

2026-10-18（Asia/Shanghai）。工作区是 Mini；保留现有10个本人操作，无新增正式页面/导航，无 Admin、Backend、Contracts 源码修改，无 commit/push/部署或生产数据操作。

```text
MINI_POINTS_V1_ADAPTER_READY = PASS
MINI_POINTS_V1_BACKEND_INTEGRATION = PASS（独占隔离 Backend HTTP；外部 Provider 为明确替身）
MINI_POINTS_V1_DEVICE_READY = NOT_RUN
MINI_POINTS_V1_PAGE_READY = NOT_RUN
MINI_POINTS_V1_RELEASE_READY = NOT_RUN
```

真实 COS/STS/材料检查供应商、微信登录/设备、常驻业务实例带凭据联调均 **NOT_RUN**。HTTP PASS 不等于真实文件端到端成功或正式人员授权。

## 基线复核

- Points `points-v1-r2`；Identity / Organization `identity-organization-v1-r1`。两个 handoff 各列出的 **71/71** 文件均读取实际字节校验SHA-256，一致；见 [核验快照](contract-verification.json)。Contracts 无Git metadata，不伪造commit revision。
- r2的Points paths/schema、Article COS wire、shared schema与本地r1快照哈希相同。10个operationId、请求/响应/分页未变，没有重新生成业务适配。
- 权威入口：[Points paths](../../../../contracts/api/paths/points.yaml)、[Points schema](../../../../contracts/api/schemas/points.yaml)、[Points handoff](../../../../contracts/docs/coordination/points-v1/handoff.json)、[Identity handoff](../../../../contracts/docs/coordination/identity-organization-v1/handoff.json)。当时 handoff 为 BLOCKED/PROPOSED 并保留旧 Provider NOT RUN；当前链接内容可能已更新，不复现 r2 快照。原记录引用的旧 Backend 隔离验收记录（原路径 `backend/docs/operations/points-v1/backend-progress.md` 已移除，不能重新核对该来源）曾记录 HTTP PASS；不以现有 Backend 文档替代丢失的旧来源。
- 正式政策、capability/人员批准、真实COS各有独立门禁。隔离验证只使用既有 `points-integration`、loopback新测试库和候选政策；Mini不硬编码阶段或以本地role/stage授予资格。
- 已复核工程Profile/routing、Network、Testing、Security及配置。沿用原生Mini Program、分包、认证Client、统一错误类和COS SDK，无新依赖/兼容基线调整。

## 实际消费端修复

1. Backend私有STS仅允许精确PutObject，并要求 `x-cos-acl: private`、`x-cos-forbid-overwrite: true`。原Mini缺第二个头，SDK uploadFile默认可能POST或超过1MiB后分片，与该授权不兼容。
2. [COS工具](../../../utils/cos.ts) 增可选 `singlePut`，仅 [Points操作](../../../subpkg_user/services/points-operation.ts) 显式启用；调用捆绑SDK putObject并传限定对象、STS和两个必需头。其他调用保持默认行为，无公开附件或LearningTask语义修改。单文件仍最多10MiB，ArrayBuffer一次PUT；设备内存/进度待微信验证。
3. PUT响应丢失后，保留原uploadId/index/登记key，下次先登记确认；网络/503等保持未知。仅明确400 points-file-unavailable允许原凭证key/原对象再PUT，不静默换key/对象。登记超时只重试登记。
4. 申请operationId、正文快照、原幂等key、重复点击合并和UNKNOWN恢复保留。已知applicationId先GET；无ID按Contract同key回放，不用标题/列表猜测。

## 真实 Backend HTTP

执行 `./scripts/run-points-backend-http.ps1` 返回 **exit0**。[PowerShell入口](../../../scripts/run-points-backend-http.ps1) 从既有Backend Surefire报告取得已编译classpath，在临时目录编译 [Java启动桥](../../../scripts/points/PointsMiniConsumerBackend.java)，直接调用既有 `PointsIntegrationHttpTest` 完整Spring fixture的启动和受控准备方法。没有伪造业务服务器、运行Backend全仓测试或写Backend target/源码。仅操作新建专属loopback MySQL8.4/Redis，真实V1–V51迁移、Sa/Redis、QR activation、RBAC source/Assignment治理、Person owner/Reader、Points Controller/Service/Mapper/事务和私有材料owner。

普通用户、审核者及独立初始控制都是fixture合成测试主体；不是正式人员授权。身份与完整成员集核实通过真实Person HTTP，再建立受控范围。测试成员集显式核实为空，未从UNKNOWN推导空集合。Node子进程仅经短期环境变量接收fixture会话，使用 [真实HTTP测试入口](../../../scripts/test-points-backend-http.mjs)、共享请求Client与 [Points consumer](../../../subpkg_user/services/points.ts)，wx平台边界转换为真实Node HTTP。凭证/token/签名/私有响应不写入证据。

[脱敏证据](backend-http-evidence.json)：**31个Mini请求**（200×18、201×7、401×1、404×3、409×1、503×1），另有实际管理审核200作闭环支撑。所有Mini响应检查no-store。

| 页面可直接使用的operationId | 真实验证 |
| --- | --- |
| getMyPointsEligibility | 本人true；另一未知事实用户503，不伪造资格 |
| createPointApplication | 201 PENDING；同key同ID、不同内容409；真实提交后故意丢失响应，operation进入UNKNOWN，原key恢复，列表仍仅两项申请 |
| listMyPointApplications | 默认空页、pageSize=1、第二页、APPROVED筛选与totalItems |
| getMyPointApplication | PENDING→APPROVED、跨用户404 |
| getMyPointSummary | 初始0，真实审核7分后余额7，未登录401 |
| listMyPointLedger | 初始空、GRANT筛选/分页，唯一7分流水 |
| createPointFileUploadCredentials | HTTP/owner与同key同uploadId通过；**外部STS替身** |
| registerPointFile | HTTP登记/回放、申请原子绑定通过；**对象/安全检查替身，无伪造PUT** |
| getMyPointFile | HTTP元数据、本人/他人隔离404 |
| getMyPointFileAccess | HTTP授权/404；**外部签名替身，不下载synthetic URL** |

审核支撑请求真实执行，申请POST201不当作计分。外部微信登录/二维码、COS对象/STS/安全由Backend fixture明确替换；真实COS PUT、ACL/CORS、内容供应商和下载可读性均NOT_RUN。进程与专属容器已关闭，数据/失败日志保留，见 [运行信息](backend-http-runtime.json)。

用户另行启动的localhost:8080已只读探测本人摘要，返回401 unauthorized；没有取得该常驻实例的测试会话/隔离数据证据，不对它写入。上述PASS仅属于明确独占fixture，不冒充常驻实例带凭据验收。

## 本轮验证

| 命令 | 结果 |
| --- | --- |
| `./scripts/run-points-backend-http.ps1` | PASS/exit0；真实Backend闭环 |
| `node scripts/test-points.mjs` | PASS；r2哈希、原适配/错误/分页/幂等、未知上传恢复；此套为合成HTTP |
| `node scripts/test-cos-single-put.mjs` | PASS；真实捆绑SDK+合成wx传输，100B、1MiB+1、10MiB均单PUT，STS认证和必需头；不是真实COS |
| `pnpm.cmd typecheck` | PASS；共享COS与Points改动后执行 |
| `pnpm.cmd exec eslint utils/cos.ts subpkg_user/services/points.ts subpkg_user/services/points-operation.ts scripts/test-points.mjs scripts/test-cos-single-put.mjs scripts/test-points-backend-http.mjs` | PASS；本轮问题修复后重跑 |
| PowerShell Parser / Java launcher编译 | PASS；Java在真实后端启动命令中执行 |
| `pnpm.cmd audit:packages` | PASS；无警告/错误，源码审计不代表最终编译体积 |
| `node docs/engineering/mini-program/scripts/check-docs.mjs` | PASS；文档治理，Profile仍TEMPLATE |
| 全仓lint/无变化业务套件 | NOT_RUN；r1已记录pnpm lint的文档mjs类型配置ERROR，本轮未改配置/重复运行或宣称修复 |
| 微信编译/设备/真实微信和COS/页面/发布 | NOT_RUN |

启动修复历史保留在临时目录：classpath末尾空项误判、MySQL临时socket就绪而TCP未就绪、审核前成员事实未核实的正确503、共享客户端线程导致独立JVM不退出。分别修复为过滤空项、等待专属TCP、真实Person核实、关闭Spring后退出自有JVM。最终exit0；未将这些fixture/启动问题称作Backend协议缺陷，未放宽断言。

## 接入与下一步

- **未发现需修改Contract的协议冲突。** 上传缺口已修复；未知成员503是正确fail-closed。正式政策/授权和外部依赖见 [待确认记录](contract-change-request.md)。
- 后续页面从points.ts使用上表10方法，申请/上传分别使用 `pointApplicationOperation` / `pointFileUploadOperation`。整个逻辑意图保留同一handle，不同明确新意图才新建。签名每次重新授权，不缓存/拼公开URL；未增加视频、LINK、第三方预览或Store。
- App重启未知操作恢复仍需另行确认最小持久化范围，不自动重建申请。真实微信/COS条件齐备后验证单PUT、10MiB内存/进度、域名/STS/CORS、私有ACL、内容检查、登记/访问。
- 重跑入口只创建新专属库/容器；需要现有Backend编译产物和匹配classpath、Java17、Docker镜像。不构建/写其他工作区、不复用业务MySQL/Redis、不删除旧证据或数据。
- revision/实际哈希/本地consumer均无变化且无新外部条件时复核no-op，不重生成Adapter/重复全仓测试/自动提交发布。同revision文件哈希漂移仍须复审。

历史：r1仅合成Adapter PASS，Backend/设备/页面/发布NOT_RUN；本轮明确隔离HTTP证据推进了Backend层，不回写历史验收。
