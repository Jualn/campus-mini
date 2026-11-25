# filter-bar

通用的单选筛选操作栏。组件只管理面板开合与选项展示，页面保留查询、分页和筛选值的所有权。

## 输入

- `filters: FilterGroup[]`：每组包含 `key`、栏内小标题 `label`、面板标题 `title`、`options` 和 `selectedIndex`；选项包含唯一的 `id` 与 `label`。
- 动态选项组可传 `loading`、`error`、`hasMore`，组件显示加载、重试或“加载更多”。
- `tone`：`blue`（默认）、`red`、`green`、`amber`，只改变选中与展开状态的配色。

```xml
<filter-bar
  filters="{{filters}}"
  tone="blue"
  bind:statuschange="onStatusChange"
  bind:statusmore="onStatusMore"
/>
```

选择变化时触发以组 `key` 命名的 `${key}change` 事件，`detail` 为 `{ key, value, id }`，其中 `value` 是选项下标，`id` 是选项 ID。点击重试或加载更多触发 `${key}more`。重复选择当前值只收起面板，不发送变更事件。

活动列表与导师答疑列表共用此组件；新增调用方应直接复用，不复制筛选面板样式。
