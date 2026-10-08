# 通用图标

资源实际位于本目录，2026-09-13 已核对文件存在；小程序资源路径为 /assets/icons/common/。以下为资源用途说明，不代表所有页面都已接入。

| 图标 | 用途 |
|---|---|
| [activity.svg](activity.svg)、[exam.svg](exam.svg)、[post.svg](post.svg) | 活动、公共事项、社区入口；`exam.svg` 是兼容旧路径，不定义当前业务为考试 |
| [system_notice.svg](system_notice.svg)、[interaction.svg](interaction.svg) | 系统公告、互动消息 |
| [notification_empty.svg](notification_empty.svg) | 通知空状态 |
| [message_center.svg](message_center.svg) | 消息中心入口或兜底 |
| [search.svg](search.svg)、[clear.svg](clear.svg) | 搜索与清除 |
| [choose_image.svg](choose_image.svg)、[send.svg](send.svg) | 图片选择与发送 |
| [more.svg](more.svg)、[others.svg](others.svg) | 更多与其他入口 |

实际包归属和引用方式遵循[分包规范](../../../docs/engineering/mini-program/06-performance-packaging.md)。

通用 UI 图标优先按 [Icon System v1](../../../docs/project/icon-system-v1.md) 的 semantic 使用 UiIcon；此表用于既有资源用途说明，不是新增图标的命名入口。业务、品牌与空态插画仍按各自归属使用。

2026-09-30：业务入口、通知分类和空状态已按 [视觉语言](../../../docs/project/icon-visual-language.md) 调整为同系列轮廓；来源与颜色见 [视觉资源来源](../VISUAL_SOURCES.md)。`clear`、图片选择、发送和更多等通用控件已由 Core Registry 资源承担，旧路径只保留兼容，不再新增直接引用。消息筛选的 `filter-*.svg` 使用中性色版本，蓝底选中时使用同轮廓的白色 `filter-*-active.svg`；消息卡片保留分类色。
