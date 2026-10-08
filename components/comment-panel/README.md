# comment-panel 使用说明

> 状态：从原组件文档迁入，保留项目集成约定；本轮未复验属性、事件或运行时行为。示例中的页面私有辅助方法仅说明调用方职责，不是所有页面都具有的公共 API。修改前核对本目录实现及相关后端协议。

## 组件定位

`comment-panel` 是通用评论面板组件，负责评论列表展示、二级回复展示、发送评论、发送回复、删除、点赞、图片预览等评论域内部交互。

组件本身不直接更新帖子卡片、不直接操作 `postSyncStore`，也不直接触发帖子业务事件。评论数量变化通过 `countchange` 事件交给父页面处理。

## 引入方式

在页面 json 中注册组件：

```json
{
  "usingComponents": {
    "comment-panel": "/components/comment-panel/index"
  }
}
```

## sheet 弹窗模式用法

```xml
<comment-panel
  wx:if="{{popupType === 'comment'}}"
  mode="sheet"
  target-id="{{commentTargetId}}"
  target-type="{{commentTargetType}}"
  total-count="{{commentTotalCount}}"
  visible="{{showPopup}}"
  bind:close="onCommentClose"
  bind:countchange="onCommentCountChange" />
```

## inline 页面内模式用法

```xml
<comment-panel
  mode="inline"
  target-id="{{targetId}}"
  target-type="{{targetType}}"
  total-count="{{commentTotalCount}}"
  inline-title="评论"
  bind:countchange="onCommentCountChange" />
```

## 必传字段

### target-id

被评论对象 id。

例如：帖子 id、活动 id、考试 id。

```ts
commentTargetId: postId
```

### target-type

被评论对象类型，必须和后端评论接口约定一致。

例如：

```ts
commentTargetType: TARGET_TYPES.POST.value
```

### total-count

父页面传入的初始评论总数。

组件内部会维护自己的 `currentTotalCount`，新增或删除评论时会先更新内部数量，再通过 `countchange` 通知父页面。

```ts
commentTotalCount: post.commentCount
```

## 可选字段

### mode

显示模式：

```ts
'sheet' | 'inline'
```

默认值：

```ts
'sheet'
```

### visible

仅 `sheet` 模式需要。

由父页面控制评论面板是否显示。

### inline-title

仅 `inline` 模式使用，默认值为：

```ts
'评论'
```

## 事件

### close

用户关闭评论面板时触发。

父页面通常需要关闭弹窗并清理 `popupType`。

```ts
onCommentClose() {
  this._closePopup(true);
}
```

### countchange

评论总数变化时触发。

事件参数：

```ts
{
  count: number;
  delta: number;
  targetId: string;
  targetType: number | string;
}
```

父页面应在这里同步外部展示数量，例如帖子卡片的 `commentCount`。

```ts
onCommentCountChange(e) {
  const { count, targetId } = e.detail;
  const safeCount = Math.max(0, Number(count) || 0);

  this._applyPostPatch({
    id: targetId,
    commentCount: safeCount,
  });
}
```

## 父页面需要维护的最小状态

```ts
data: {
  showPopup: false,
  popupType: '',
  commentTargetId: '',
  commentTargetType: TARGET_TYPES.POST.value,
  commentTotalCount: 0,
}
```

## 打开评论面板

```ts
onOpenComment(e) {
  const { postId, commentCount } = e.detail;

  this._openPopup({
    popupType: 'comment',
    commentTargetId: postId,
    commentTargetType: TARGET_TYPES.POST.value,
    commentTotalCount: Math.max(0, Number(commentCount) || 0),
  });
}
```

## 父页面职责边界

父页面负责：

1. 传入 `targetId`
2. 传入 `targetType`
3. 传入初始 `totalCount`
4. 控制 sheet 模式是否显示
5. 接收 `countchange` 并同步外部 card/cache/store

`comment-panel` 负责：

1. 加载评论列表
2. 加载二级回复
3. 发送评论和回复
4. 删除评论和回复
5. 评论/回复点赞
6. 图片选择和预览
7. 内部评论总数的乐观更新与回滚

相关设计：[当前用户资料同步](../../docs/project/current-user-state.md)。返回[项目文档](../../docs/project/README.md)。
