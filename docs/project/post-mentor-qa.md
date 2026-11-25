# Post 内容组织与导师答疑

协议权威为 [Mentor QA V1](../../../contracts/docs/coordination/post-organization-mentor-qa.md)、[Post 共用生命周期](../../../contracts/docs/coordination/post-community.md)、[Post schemas](../../../contracts/api/schemas/post.yaml)及 [OpenAPI](../../../contracts/api/openapi.yaml)。人员资格仍归[独立人员与绑定](independent-person-r5.md)和[党建身份与导师认证](people-qualification.md)。此文维护客户端责任，不表示 Provider 已部署或真实资格来源已验收。

## 页面与类型隔离

普通列表、公开个人主页和旧喜欢入口保持 NORMAL，不提高本人可见性。校园首页普通发帖使用 `post-edit-panel` 在首页 `page-container` 内承载，保留 WXS 跟手关闭与草稿关闭确认；独立路由编辑器继续服务答疑、列表入口和已有内容编辑，二者使用同一创建受理边界，首页不再从正文生成标题。答疑复用 Community 分包的 Post 列表、发布、详情和评论面板，显式 MENTOR_QA；未知响应类型不回退成普通帖子。提问与编辑路由采用自定义导航底部面板，顶部按微信胶囊实际底边额外留 16px，不使用固定视口百分比猜测安全间距。旧 NORMAL-only Provider 缺省类型兼容只适用于原受控世代，不能用来证明新能力可用。

答疑按 answerState、分类、话题组合筛选，服务端完整筛选后返回 cursor。换条件重置游标并废弃旧响应；稀疏空页仍消费 hasMore，分页去重、失败可按原游标重试。状态、公开正式回答数、questionVersion、contentLocked 只读 qaSummary；缺失或不一致显示不可确认，不从 commentCount、时间或编辑 ETag 推算。

答疑列表以问题标题、正文预览和正式回答状态为主。回答状态、分类和话题复用[共享筛选组件](../../components/filter-bar/index.ts)的同栏入口与两列点选面板；分类和话题的加载、失败重试及继续分页仍由列表 Page 负责。提问和本人记录入口位于列表上方。

正常可发言用户可以提问，无客户端 Person、组织或导师门槛；QA 必须有正文及适用分类，图片不能替代正文，可选标题用于列表和详情的独立识别。普通 Post 新建不再提供标题输入，可以纯文字、纯图或图文混合；分类/话题来自既有分页字典并作为编辑辅助信息，保留禁用历史引用，不硬编码分类 ID 或创建自由话题。标题与正文相同或仅为正文开头时，列表和详情只展示正文，避免把自动摘要重复渲染成独立标题。

## 受理与本人记录

「我的 → 社区记录」集中查看帖子、评论、收藏、浏览和举报，在页内切换。发帖、评论或举报后的定向链接可直接打开对应记录类型。

Post 创建成功的 submission 表示受理，不向公开流广播候选卡片。生命周期已允许公开阅读时进入正常帖子/答疑详情；尚未公开时关闭编辑器并返回原信息流，提示公开后查看，不强制进入本人管理详情。普通和 QA 复用同一创建键、收据及账号隔离恢复流程。发送前保留原键，未知结果、缺失 submission 或收据未找到不自动改键重建；本人列表提供原键查询。Storage 只保存恢复键及归属，不保存正文或媒体快照。

本人 Post、评论/回答、收藏、最近浏览使用既有私有资源与显式类型筛选，默认 NORMAL，QA/ALL 仅在对应能力开放后请求。公开个人主页不代替私有结果；原 User 归属不随 Person 重绑迁移。最新受理内容与旧安全公开版分开解释，候选不能替代公开事实。

收藏使用正式状态/分页关系，失效目标不展示原文快照；清空覆盖本人全部 Post 浏览历史，不撤销公开统计或重置去重。已启用的 Post 有效打开后报告浏览并重读计数，分享只报告实际原生回调或海报保存成功的 action/eventId，不把菜单、绘图或发起当送达人数。

## 正式回答与普通讨论

Post.commentPermission 只用于一级正式回答；根/具体回复的 replyPermission 用于二级普通讨论。正常用户讨论不查 Person、不限制提问者与导师之间的方向，也不受 mentorAnswers 关闭或导师资格源故障误阻断。任何二级节点始终是 DISCUSSION，不因为作者是导师而升级。

一级正式回答入口与提示只依据服务端 commentPermission，不通过 BOUND、导师档案或自助申请 APPROVED 推导权限，也不增加客户端绑定读取门槛。服务端按方案 A 核验管理员确认的当前有效 ADMIN_MANUAL 绑定、资格、账号及问题状态；绑定确认不替代其余条件。发送所读 qaSummary.questionVersion，不提交人员、资格、kind 或证据字段。Role、后台身份及静态开关都不授导师资格。绑定变化不能把旧草稿伪装成新人的历史证明。

DENIED/MENTOR_REQUIRED 或提交 403 mentor-answer-forbidden 提示联系管理员核实人员关联及导师资格；BLOCKED/QUALIFICATION_UNAVAILABLE 或 503 mentor-qualification-unavailable 表示暂不可确认，不显示已撤销。提交拒绝保留草稿并触发问题权限重读；未知提交结果仍先查本人结果和收据。绑定在上传期间变化也保留草稿并要求重读，不误报问题改版。

版本在草稿期间变化或收到 mentor-question-version-stale 时保留草稿、阻断直接再发，要求父页面重读问题；新版本读取后仍需用户明确核对。不能自动把旧回答挂到新版。重读应保留评论组件实例，避免销毁草稿；权威 404 则移除失效公开内容并明确反馈。

正式回答和普通讨论都复用私有受理及收据。发送时在当前组件立即展示内容与讨论计数，失败撤回本地内容并保留输入。刷新按评论 ID 合并，公开确认后本地增量只消费一次，发送前发起的旧统计请求不能覆盖新展示。正式回答数仍取 qaSummary，审核及通知沿用服务端规则。

## 历史身份、线程与通知

公开正式根必须有 kind=MENTOR_ANSWER、完整 mentorAnswer 历史投影及首次公开事实。评论区展示历史认证名、「导师正式回答」标识和内容。原账号与原人员的当前认证有效时，姓名旁展示可点击的导师标识，打开回答时的导师资料。头像取公开作者投影，可用时显示图片，缺失或加载失败时按认证名生成。该答主在同一线程的二级回复沿用这组姓名和头像，发言者可显示「答主」或「提问人」标识。详情确认一级回答权限后自动用现有导师资料接口读取当前认证名并直接显示输入框，不自动弹键盘，失败可在原位重试；一级输入框不显示额外姓名横条，二级回复仍显示对象提示。权限仍取问题详情。

NORMAL/QA 启用后显式读取 thread。删除/隐藏根只保留有合法公开回复的占位，投影移除旧作者、导师资料、正文、图片和点赞信息；不可直接回复占位，可回复同根具体公开节点。占位不算正式回答或公开评论。删除后重读线程与权威计数，不连带扣除保留的回复。

通知仍复用 POST_DETAIL+commentId，context API 一次定位根与具体回复，按返回的根内游标续页，不逐页扫描。目标 UNAVAILABLE 保留可访问帖子并提示，帖子 404 移除旧内容，未知通知目标保留文本与已读。客户端不新增答疑通知类型、微信模板或成功审核提醒。

## 编辑与恢复

view=edit 的强 ETag 覆盖完整编辑表示；动态可编辑动作和 QA 内容锁从本人资源读取，不能从 ETag 或回答数推断。首次正式回答公开后，即使当前回答数回到零，也不能据此解除标题/正文/图片保护；分类话题仍可按动作与当前字典维护。未知锁状态先禁用正文修改，不猜可编辑。

412 保留输入并展示最新编辑表示，需明确核对合并；409 mentor-question-content-locked 保留草稿并禁用原题改写。用户可明确核对并恢复服务器原题字段，同时保留分类话题输入，再维护标签；补充原题通过普通讨论。已观察到的内容锁不被迟到的旧观察解除；管理隐藏的本人内容可回看，但编辑入口不自行复活它。

## 能力与验证边界

[POST_CAPABILITIES](../../config/post-capabilities.ts) 当前开启 communityV1、organization、mentorQa、mentorAnswers，关闭 legacyNormalProvider，启用社区、分类话题、答疑提问和正式回答入口。未知或缺失类型不再按旧 NORMAL-only Provider 回退。mentorAnswers 只控制一级正式回答，不控制普通二级讨论。客户端启用不代表 Provider 运行验收，不绕过可信绑定、服务端授权、问题版本或内容保护；历史身份与公开资格仍由 Provider 裁决，不能自动重建历史身份或公开旧回复。

普通帖子与导师问题编辑消费 canonical `editPostViaPost`：POST /v1/post/{postId}:edit，保持原 GET view=edit、If-Match、无包装响应及新 ETag。共享请求边界仍拒绝不受支持的原生 PATCH，不做全局方法改写。Provider 提供兼容入口须先于客户端发布；本地实现/模拟不代表部署或真机验收。

`pnpm test:mentor-qa-v1` 检查新答疑边界；`pnpm test:post-community` 和 `pnpm test:post-mentor-qa` 保留共用流程及旧/新兼容回归。它们使用 HTTP/wx/资格替身，只证明客户端反应。真实 Provider 的最终资格与版本竞争、历史来源、文件可见性、统计/通知收敛、完整微信编译及真机键盘/图片/页面栈仍需独立证据；没有执行远程预览、上传或发布。

## 原生编辑兼容

[Post Contract](../../../contracts/api/paths/post.yaml) 的 editPostViaPost 是明确、范围受限的 POST /v1/post/{postId}:edit；[Backend Controller](../../../backend/src/main/java/cn/jualn/miniapp/module/post/controller/PostController.java) 直接复用 editPost 原处理链。普通 Post、QA 分类话题维护和成长编辑共用此入口，PATCH 原路径为其他客户端保留；旧 POST 同资源路径仍405。请求、字段省略/null、返回表示、错误、原作者和 Person/组织/资格、原题保护及内容检查均不变，两入口共享同一强 ETag 版本域。

消费者使用已有 httpWithMeta.post，不增加传输框架或 Method Override。401、冲突、5xx或网络结果未知均不自动重放/切换路径，草稿与重新读取核对策略不变；不把 POST 解释为可无条件覆盖或新增幂等保证。当前小程序调用扫描只有普通/QA和成长两处受阻编辑；通知偏好已有独立正式 :batch-update，管理端字典/人员/学习草稿 PATCH 无小程序消费者，不机械增加别名。

[原生编辑回归](../../scripts/test-native-edit.mjs)覆盖真实领域 Service→API→request→合成 wx 的普通/QA与成长调用，验证正式路径、If-Match、字段存在性、返回 ETag 和失败不重放/不回退；它不替代 Backend MVC、服务端安全并发或部署/真机验收。
