# comment-panel 使用说明

> 本文维护组件集成约定。Post 的线程、上下文、答疑权限与待检查提交由专项模拟覆盖；微信原生布局、键盘和真实服务需另行验收。示例中的页面私有辅助方法仅说明调用方职责，不是所有页面都具有的公共 API。

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

组件内部维护 `currentTotalCount`。普通 Post 提交或删除后重读公开列表和服务端计数，计数变化通过 `countchange` 通知父页面。导师答疑提交或删除后通过 `refreshquestion` 交由详情页一次重读讨论数、正式回答状态与写入权限，再由 `total-count` 回传讨论数。本地发送立即展示并同步展示计数；刷新按 ID 去重，公开确认后消耗一次本地增量，旧请求不能覆盖发送后的计数。服务端公开统计保持独立。

```ts
commentTotalCount: post.commentCount
```

## 可选字段

### post-type / comment-permission / question-version / focus-comment-id

Post 调用方传入真实 post-type。普通帖子的底部输入栏由评论提交接口执行权限校验。QA 的 comment-permission 控制一级正式回答权限；inline 模式确认权限后自动读取当前认证名并直接显示正式回答输入框，不自动弹出键盘，读取失败可在原位重试。一级输入框不再显示导师姓名横条；二级仍按根或具体回复的 replyPermission，点击目标后显示回复对象提示。详情传入 question-author-id 标识二级发言者中的提问人。普通帖与 QA 在请求期间即时展示发送内容和计数，失败撤回本地内容并保留草稿。成功后按服务端 ID 合并展示，省去受理提示和结果跳转。

详情入口可传 focus-comment-id；Post 用上下文 API 一次定位根与目标回复，并采用返回的根内续页游标。目标不可用保留帖子和说明；定位失败可重试，不逐页扫描。Activity/Exam/Article 不继承 Post 的占位、问题版本或导师资格语义；共享面板对非 Post 目标保留原评论流程。

QA 正式回答使用父页面传入的 question-version，来源只能是 qaSummary，不能从 ETag 或时间构造。`refreshquestion` 事件请求父页面重读问题与动态权限；父页面应保持组件实例和草稿，更新 question-version。版本失配后，读取新版仍须用户明确核对才可继续发送；未成功重读不能解除阻断。

正式根显示 mentorAnswer 的历史姓名、职务、单位与当前认证状态，不用当前 Profile 覆盖；公开和本人结果使用同一份历史姓名生成头像，编辑时仍显示当前账号。占位不保留这些字段；二级是普通讨论。QA 待公开提交不能计入公开答案数，平面 countchange 也不能代替 qaSummary。inline 模式定位到指定评论后发出 `contextlocated`（`{ commentId }`），宿主可滚动到评论区。

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
7. 展示计数合并服务端基数与未确认的本地增量，公开 ID 确认后去重，服务端公开统计保持独立

相关设计：[当前用户资料同步](../../docs/project/current-user-state.md)。返回[项目文档](../../docs/project/README.md)。
