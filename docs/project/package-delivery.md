# 代码包交付与体积证据

## 当前配置与静态证据

2026-10-07 核对 `app.json` 页面/组件入口及 TypeScript 编译后的运行时依赖。主包保留首页、个人页、消息页和实际共享依赖；六个普通分包保持既有归属。

发布排除由 [project.config.json](../../project.config.json) 的 `packOptions.ignore` 管理：文档目录、Markdown、MJS 开发脚本、YAML、类型声明、TS 编译配置不进入发布包。旧考试 Action/Service/静态库及专属图标、旧消息 Action/Service、两个未被运行时引用的聚合入口也被显式排除；源码仍保留，不删除用户工作。当前消息页面使用 structured notification owner，未使用旧消息调用链。

重新使用上述旧模块时，必须重新确认归属、协议和发布排除，不能只新增 import。COS SDK 仍被主包评论上传流程使用，不因文档整理改变上传协议。

仅供活动报名与资讯响应映射使用的 `response-integer` 分别保留在 `subpkg_activity/utils` 和 `subpkg_red/utils`，主包不再保留共享副本；包审计同时检查主包回退和两份实现的一致性。

## 审计口径

2026-10-17：退出 `subpkg_activity/pages/publish/publish` 的路由注册，旧源码保留但不提供运行入口；活动创建与旧 AI 写入在 API 边界拒绝。普通浏览、报名和订阅路由保留，详见 [RBAC V1 迁移](rbac-v1.md)。

运行 `pnpm.cmd audit:packages`：

- `size`：未排除的运行相关原始文件大小，包括 TypeScript 源码。
- `allIncluded`：所有未显式排除的原始文件大小，覆盖过去被运行扩展名筛选遗漏的文档和开发文件；工具可能另有隐式排除，因此它不是最终编译大小。
- 1.5 MiB 预警线、2 MiB 审计线按 `allIncluded` 检查，未提高既有阈值。
- 活跃模块/模板不能引用已被发布排除的模块/资源；分包依赖方向和共享副本一致性继续检查。

原始文件体积不能证明微信编译包达标。需要在微信开发者工具重新编译并检查代码包文件明细和代码质量结果，记录最终主包大小；不得用上传、远程预览或发布替代普通本机验证。尚无本页可引用的最终编译体积证据。
