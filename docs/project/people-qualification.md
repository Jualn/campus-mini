# 党建身份认证与导师展示

协议权威为 [operations](../../../contracts/api/paths/people-qualification.yaml)、[schemas](../../../contracts/api/schemas/people-qualification.yaml) 和 [跨仓交接](../../../contracts/docs/coordination/party-roster-mentor-management.md)。当前主体与来源语义遵循 [独立人员与绑定](independent-person-r5.md)：名单提交建立/复用 Person，领取只绑定账号；历史成功收据不是当前身份或资格。

## 名单领取与本人身份

“我的”进入 User 分包的 [认证页](../../subpkg_user/pages/party-identity/index.ts)。只填写姓名和文本学号，不选择组织、不加载组织候选、不收集额外证明。请求只含 realName、studentNumber，只去首尾空白，保留内部字符、大小写和前导零。成功绑定正常使用本人党建、积分和 PERSON 任务，关联方式不增加能力门禁；各业务仍复核当前绑定、ACTIVE Person 及自身资格。

[请求适配](../../subpkg_user/services/people-qualification.ts)使用当前 Mini Token 和共享 HTTP；本人成功记录与当前身份分别读取。匹配失败、歧义、占用等 409 roster-state-conflict 使用统一核对或联系管理员提示，不披露候选、占用者或具体匹配原因；503/网络失败保留不可确认状态。

[逻辑申请](../../subpkg_user/services/party-identity-operation.ts)保留姓名/学号、原正文与幂等 key。未知结果先读当前绑定、领域事实及可靠成功记录，再用原 key 恢复；成功后重读失败保留成功收据及“当前事实不可确认”，只恢复读取，不另造申请。跨账号/退出清理，不把私密草稿写 Storage；进程重启先查当前状态和历史。

当前身份独立呈现无绑定、人员不可用、未知/争议、已核实无阶段、未生效/有效/过期/停用/撤销。只有服务端 ACTIVE 且尚在本次期限内才显示有效标识；前台恢复及期限到达重读，旧响应不能恢复有效标识。当前阶段来源取领域投影，ROSTER_EXACT_MATCH 只描述名单绑定方法。姓名学号和组织关系没有当前接口来源时，不从候选或历史申请补造；党建身份不进入公开社区作者标识。

## 导师与答疑

「我的」与他人主页都在昵称后显示导师图标，点击查看认证姓名、职务和单位。正式回答仅在内嵌的 `currentCertification` 为 `VALID` 时显示导师图标，弹层使用原回答发布时的资料。普通帖子和普通评论的作者响应尚未投影导师认证。完整的认证状态与查询操作由身份认证页展示。

「我的」、他人主页和身份认证页复用 [导师认证卡片](../../components/mentor-certification/index.ts)。卡片的 refreshRevision 数字属性变化时重新读取独立导师资格（默认 0）；认证页刷新及提交恢复后递增该值，不从绑定收据推导导师资格。绑定变化立即清理旧党建投影并重读，导师卡片沿用绑定订阅清理旧资格。当前认证投影需有 personId、bindingId、qualificationId，且 certified、完整资料和期限符合服务端表示才显示。进入/恢复前台重新读取，隐藏移除旧标识，绑定变化清草稿；404 表示无有效认证，可提示联系管理员核实人员关联及导师资格；503/网络失败表示不可确认，不猜测资格已撤销。当前认证的管理员确认绑定由服务端方案 A 核验，客户端不从 BOUND、导师资格或自助申请 APPROVED 推导。

历史正式回答只用 Comment 内嵌的原人员姓名、职务、单位及 currentCertification，不由当前账号导师接口覆盖或重定向；普通讨论可独立查看当前账号资料，这不改变历史归属。返回前台重新读 Post/Comment 动态权限，刷新期间按权限保留草稿。认证卡片、历史回答、Role 和旧作者身份均不授正式回答权；一级正式回答由后端复验当前可信绑定、导师资格及问题版本，二级普通讨论仅验正常发言与目标权限，不要求 Person/导师身份。开放控制与 PATCH 阻断见 [Post 与导师答疑](post-mentor-qa.md)。

## 验证入口与待验

[认证专项](../../scripts/test-people-qualification.mjs)和 [答疑专项](../../scripts/test-post-mentor-qa.mjs)是替身层回归入口，运行前核对当前 r5 样本。2026-10-24 旧世代模拟和单文件模板编译不证明 2026-10-25 breaking 输入通过；r5 测试、真实 Backend/DB、微信与设备仍未由这次整理补验。

真实链路需覆盖名单提交后领取、并发唯一性/原 key 恢复、当前绑定权威重读、有效期与撤销、来源不可用、导师动态权限及旧请求隔离；原生页面栈、长文本、键盘和安全区单独验收。不能把 Contract 完整或卡片可展示当作正式身份、答疑写入或发布就绪。
