# Jualn Campus 小程序

开发从 [AGENTS.md](AGENTS.md) 开始，按任务进入 [文档目录](docs/README.md)。

- [工程规则](docs/engineering/mini-program/README.md)：原生小程序边界与实现、验证策略。
- [项目事实](docs/engineering/mini-program/project-profile.md)：配置、工具和能力的核验状态。
- [项目说明](docs/project/README.md)：业务交互、状态归属及集成边界。
- [输入与证据](docs/operations/README.md)：固定 Contract 输入和有修订范围的历史证据。

文档完整性检查：

```text
node docs/engineering/mini-program/scripts/check-docs.mjs
```

此命令检查目录路由、链接、锚点和 Profile 格式；应用验证按受影响边界选择，不由文档检查替代。
