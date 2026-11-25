# Article 党建资讯 V1

## 归属与入口

Article 列表、详情、卡片、正文和评论适配归 `subpkg_red`，使用原生 Mini Program / WebView 能力，不增加分包、依赖、预加载或权限。首页六类固定场景进入同一 Article 列表/详情；红色书角探索项直达对应场景。原六型栏目、校园导航及 [OfficialContent M01](official-content.md) 入口继续保留。Article 不读取 Post 或 OfficialContent 集合，不迁移旧数据。

跨系统依据为 [Article 协调与实施交接](../../../contracts/docs/coordination/article.md)、[Article operations](../../../contracts/api/paths/article.yaml)、[Article schemas](../../../contracts/api/schemas/article.yaml)、[通用互动 operations](../../../contracts/api/paths/interaction.yaml)、[互动 schemas](../../../contracts/api/schemas/interaction.yaml)、[Attachment](../../../contracts/api/schemas/attachment.yaml)，从 [OpenAPI](../../../contracts/api/openapi.yaml) 解析。公开仍需登录，不开放管理草稿/预览入口。

## 内容 V1 输入与启用

本端按 `article-content-v1-r1` 消费 [Article 六类内容交接](../../../contracts/.validation/article-v1-mini-program-handoff.md)。固定 sourceRevisionSha256 为 `a123457ebbb882835ad04ffeb4006dd5266b2094b1fb9eb531e9f7fb058c4519`，ZIP SHA-256 为 `0bd9a42ba7f1d033b070f51a7b0c807f60a1536e9b96dcc7f7eaba0abd662c08`；`pnpm test:article` 校验 manifest、压缩包与当前 canonical 文件。此输入仅接受 Article 修订，不更新 independent-person 的既有消费锁；旧锁漂移仍单独告警，不能把本次校验当成跨域全量兼容证明。

[统一开关](../../subpkg_red/services/article-capabilities.ts) `contentV1` 按用户指示默认 true：六类场景、新增查询、收藏和文件入口统一启用，不等待外部联验。无场景旧列表链接仅兼容进入党建资讯，不提供跨场景汇总；Article 详情/互动兼容路径保留。客户端启用不代表目标 Provider 已支持该固定修订，也不代表设备验收或正式发布；真实 Provider、域名、文件打开与视频播放仍需实际环境验证。

场景对应一级栏目，栏目 ID 与主子关系来自 Provider 的 `sceneCodes` 和 `parentId`。场景内默认浏览整个栏目；只有存在可选子栏目时才显示分类栏。显式主栏目筛选包含直属子项，子栏目精确筛选；场景、分类和标题/正文关键词 AND。确认搜索后才应用关键词；搜索提交、分类切换、失效游标或映射丢失从首页读取。未配置场景保持空状态。

党建资讯和 E·安全使用资讯列表及展开式正文。红色书角和红色云课堂使用首篇导读与分区标题。竞赛资源库和学习资料优先展示标题与摘要，详情先展示可用附件，再呈现正文。详情从文章分类及其父栏目识别场景，目录不可用或没有场景时可以用通用阅读布局。

独立附件不进入 media；文件大小兼容 Provider 的十进制整数字符串，仍校验正整数和 10 MiB 上限。按真实 MIME 选择 PDF/DOC/DOCX，直接下载 Provider URL 后调用原生文档打开，检查下载 HTTP 状态及打开失败，提供再次点击重试。详情在有可用附件时显示附件区。来源名称独立展示，安全 HTTPS 原文链接经确认复制。下载任务由组件持有，隐藏/销毁停止下载及迟到打开；不缓存文章、文件 URL 或正文到 Storage。

收藏页面只读当前 User 的 Article 收藏。失效项只留下最小关系身份、时刻及不可用状态，可取消；不保留旧标题/署名/正文或删除原因。返回页面重新读取，重新公开是否可用交由 Provider。收藏写入失败禁用再次操作，先读回状态；取消结果未知重读列表，不自动重发。阅读、播放与收藏均不调用学习完成/提交或积分；LearningTask 原 AVAILABLE 门禁与返回 onShow 重读继续保持。

E·安全新场景与原 OfficialContent 完全独立；首页和场景页始终保留“历史官方内容”入口。未完成旧数据盘点，不能当成已证实空集移除。旧详情、分享和通知路径不改写，不迁移、复制或双写旧数据。

## 组织发布署名

客户端消费 [Article Organization Publisher 交接](../../../contracts/docs/coordination/article-organization-publisher.md) 的公开读表示；保持既有请求路径、路由、正文、媒体、评论、点赞、浏览、分享和通知流程。不增加发布主体/组织管理、权限判断或功能启用入口。Article 专属收藏与 Post 收藏独立，启用边界见下节。

统一由 `mapArticle` 解析署名，ArticleCard 和详情只显示 UI 投影 `publisherDisplayName`：

- 有 `publisherOrgId`：校验不透明组织 ID 和非空、最多 120 Unicode code point 的 `publisherNameSnapshot`，展示快照原文。即使同时返回旧 Publisher 或旧对象无效，也以新表示为准，不拿当前组织名覆盖历史署名。
- 无 `publisherOrgId`：保留旧 `publisher.id/displayName` 只读标签，不推导组织；即使旧对象附带 organizationId，或有未绑定组织的孤立快照字段，也不能据此认领组织。
- 组织 ID 存在但快照缺失/null/空白/无效：明确报错，绝不回退旧标签、默认组织或静默丢掉单条文章。两种表示均缺失或旧表示无效也沿用列表/详情错误与重试状态。
- 组织停用不改变已发布文章可见性或冻结署名；不查询组织目录或根据组织状态过滤公开文章。可见性仍由既有公开 Article API 决定。

新增消费者类型为组织/旧 Publisher 的可区分联合投影，不把旧 Publisher ID 当组织 ID，不将 UI 展示字段写回服务端。历史未映射文章保持旧标签，既不伪造组织归属，也不将旧标签称为可信发布时快照。

组织署名的目标部署修订、历史映射可信来源和全消费者兼容仍需真实后端确认。

## 页面及组件

- [列表](../../subpkg_red/pages/article-list/list.ts)：固定单场景查询，只展示当前场景根栏目及其直属子栏目；“全部”仅表示当前场景全部内容。支持历史 categoryId 直达、cursor 翻页、下拉刷新、重复条目去重、错误重试；分类切换与卸载隔离迟到响应。分页错误保留已加载内容及失败游标，invalid-cursor 可刷新从头读取。
- [ArticleCard](../../subpkg_red/components/article-card/index.ts)：标题、可空摘要、按布局展示的封面、发布署名与首次发布时间。浏览整个栏目时，当前子栏目可作为上下文显示；封面失败时回到文字布局。语义 open 事件由 Page 导航。
- [详情](../../subpkg_red/pages/article-detail/detail.ts)：仅通过公开 getArticle 读取，分享直达不依赖 opener；每次前台重读并清除旧正文，404 清除内容并提示不存在或下架。详情读取成功后单次显式浏览 POST；后台 GET 不当浏览。
- [正文](../../subpkg_red/components/article-body/index.ts)：按规范节点顺序渲染，初始 20 节点，继续阅读/触底每次增加 20 节点；后台映射保留完整顺序，只有已展开正文送到渲染层。
- [评论](../../subpkg_red/components/article-comments/index.ts)：与帖子详情复用操作栏及评论展示样式，保留独立的 Article 纯文本发布、分页和删除流程。回复在所属根评论下展开，使用 parentId 和 replyToCommentId，不传任意收件用户。关闭评论隐藏新增和回复入口，历史点赞与本人删除继续可用。删除根评论扣除线程数量，再重读 Article 统计校准。

评论 404 可能指向被删除的评论，不直接当成文章下架；由详情重新检查 Article 可见性。评论通知入口携带 commentId，在已加载条目中高亮；无法在当前页定位时提示定位暂不可用，用户可加载更多或展开线程，本期没有不存在的单评论查询 API 或自动遍历全部评论。

## 网络与状态

请求和响应以开头链接的 canonical operations/schemas 为准，调用映射见 [Article Service](../../subpkg_red/services/article.ts)。 当前 Provider 将 Java `long` 互动计数序列化为十进制字符串。小程序在 Article 统计、点赞和评论响应边界兼容这类值，并转成非负安全整数供页面使用。契约仍规定整数字段。

Article ID 为最长 128 的不透明字符串，路由和路径编码；不猜数字目标编码。新增消费者类型为手工维护的 Contract 投影，不修改生成产物。所有请求走 [共享 request](../../utils/request.ts)，敏感正文/评论响应和写入禁止完整日志。写操作设置 retryAuth=false，未知 POST 不自动重发；点赞写入失败先禁用并重读本人状态，再允许再次操作。

列表/详情直接导航使用 EventChannel 回传统计、点赞事实和文章不可用；不引入全局 Store 或持久 Article 缓存。评论成功先更新计数，再重读服务端最终一致统计。各异步读取有 Page/Component 生命周期保护；读响应不能覆盖新分类/新线程或销毁后的页面。视图、点赞、评论及分享的统计分别更新，避免一个迟到统计快照覆盖其他操作。

复用 UiIcon、时间格式化、Post skeleton、comment-model 的头像投影及本人判断、当前身份入口、共享 HTTP/鉴权/ProblemDetails 和既有通知路由机制。未改 PostCard、PostDetail、Post Action、旧 Comment/Interact API 或图片评论。旧评论面板绑定旧 wire 表示和图片能力，新 canonical 协议局部适配，不强制改旧组件。

## 富文本与媒体

正文先验证 ARTICLE_RICH_TEXT/version=1、封闭节点/属性和文本样式。PARAGRAPH、HEADING(1–3)、QUOTE、单层 LIST、IMAGE、VIDEO、DIVIDER 分别渲染；正文以可选中的原生 text 容器显示片段，保留换行。BOLD、ITALIC、UNDERLINE、STRIKE、CODE 使用固定样式类，可叠加。链接自带下划线，与删除线同时保留。原文中的 HTML 字符仅显示文字。不接收任意 HTML/CSS/脚本，未知版本/节点/属性显示“不支持此内容版本”。

图片和视频引用详情 media 的 Attachment 身份，类型不匹配或缺失明确拒绝不完整阅读。图片 widthFix/lazy-load、原生预览、失败占位和重试；视频为原生 video，使用已验证 URL、MP4 playback 和可选 IMAGE 海报；深度检查未启用时宽高及时长缺省，使用默认展示比例，交由原生播放器读取文件元数据，无 autoplay，Page 隐藏时暂停。URL 不成为跳转路径。HTTPS 文本链接检查后提供确认复制，不启用 web-view 任意外链或自动抓取。

微信域名、视频编码、资源可达性、全屏播放与预览返回的阅读位置需要真实运行/设备验证。重新进入前台会重读正文，长文展开位置会重置，这是当前行为。

## 验证入口与待验

[Article 专项](../../scripts/test-article.mjs)使用实际 TS 模块与 wx/HTTP 替身；支持组织署名、正文节点、分页、互动与通知消费的本地检查，不证明真实 Provider 或设备。受影响 UI 还需本地微信编译、实际渲染与设备验证。

待验边界包括混合新旧署名、组织改名/停用后快照保持、已发布/下架可见性、评论开关竞态、浏览去重、计数与通知、媒体授权/合法域名、真机播放、长文性能、原生分享及最终编译包体积。旧单文件 wcc/wcsc 编译与 CLI 启动结果不作为完整项目或运行证据。

资讯评论组件的 writeReady（默认 true）仅表示当前详情已重新确认、可尝试操作；不是服务端授权。详情刷新期间传 false，阻止评论、点赞和删除，保留输入及回复对象；commentsEnabled 仍表达服务端评论开关，不拿临时刷新代替业务关闭。
