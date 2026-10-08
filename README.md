# 小程序项目文档

开发入口为 [AGENTS.md](AGENTS.md)。通用工程规则、项目设计和局部组件说明各有归属，按任务阅读，不需要通读所有文档。

| 内容 | 入口 |
|---|---|
| 原生小程序工程规范 | [工程索引](docs/engineering/mini-program/README.md) |
| 项目事实与核验状态 | [Project Profile](docs/engineering/mini-program/project-profile.md) |
| 项目设计与集成边界 | [项目文档](docs/project/README.md) |
| 评论面板 | [组件说明](components/comment-panel/README.md) |
| 分享图片 | [海报说明](utils/share_poster/README.md) |
| 通用图标与详情图标 | [通用图标](assets/icons/common/README.md)、[详情图标](assets/icons/detail/README.md) |

文档检查：

```text
node docs/engineering/mini-program/scripts/check-docs.mjs
```

本轮整理核对了文档内容与引用路径，没有复验业务实现、后端契约或真机行为。项目设计说明不能替代协议来源，也不把旧文档中的“已完成”当作当前验收证据。后续维护以本入口链接的安装版为准。
