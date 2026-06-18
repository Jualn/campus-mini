# 微信小程序后端 API 类型定义总结

**数据来源**: http://localhost:8080/doc.html (Swagger Models)  
**提取日期**: 2026-05-11  
**总模型数**: 77 个

---

## 目录

1. [通用类型](#通用类型)
2. [用户资料相关](#用户资料相关)
3. [登录相关](#登录相关)
4. [活动相关](#活动相关)
5. [考试相关](#考试相关)
6. [帖子相关](#帖子相关)
7. [评论相关](#评论相关)
8. [时间轴相关](#时间轴相关)
9. [互动相关](#互动相关)
10. [通知相关](#通知相关)
11. [媒体相关](#媒体相关)
12. [分页相关](#分页相关)
13. [审核相关](#审核相关)

---

## 通用类型

### Result<T> (通用API响应包装器)

```typescript
interface Result<T> {
  code: number;           // integer(int32) - 状态码
  message: string;        // string - 响应消息
  data: T;                // Generic - 具体数据
  timestamp: number;      // integer(int64) - 时间戳
}
```

---

## 用户资料相关

### UserProfileVO (用户完整资料)

```typescript
interface UserProfileVO {
  nickname: string;                    // 昵称
  avatarUrl: string;                   // 头像URL
  backgroundUrl: string;               // 背景图URL
  bio: string;                         // 个人简介
  gender: number;                      // 性别 (int32)
  role: number;                        // 角色 (int32)
  roleDesc: string;                    // 角色描述
  status: number;                      // 状态 (int32)
  statusDesc: string;                  // 状态描述
  banned: boolean;                     // 是否被禁用
  muted: boolean;                      // 是否被禁言
  banReason: string;                   // 禁用原因
  banExpireAt: string;                 // 禁用过期时间 (date-time)
  capabilities: unknown[];             // 权限数组
  createdAt: string;                   // 创建时间 (date-time)
}
```

**对应Result类型**: `ResultUserProfileVO`

### UserPublicProfileVO (用户公开资料)

```typescript
interface UserPublicProfileVO {
  id: number;             // integer(int64)
  nickname: string;
  avatarUrl: string;
  backgroundUrl: string;
  bio: string;
  gender: number;         // integer(int32)
}
```

**对应Result类型**: `ResultUserPublicProfileVO`

### UserInfoDTO (用户基础信息)

```typescript
interface UserInfoDTO {
  id: number;             // integer(int64)
  nickname: string;
  avatarUrl: string;
  role: number;           // integer(int32)
}
```

### UserSimpleBO (用户简单信息)

```typescript
interface UserSimpleBO {
  id: number;             // integer(int64)
  nickname: string;
  avatarUrl: string;
}
```

### UserProfileUpdateRequest (用户资料更新请求)

```typescript
interface UserProfileUpdateRequest {
  nickname: string;
  avatarUrl: string;
  backgroundUrl: string;
  bio: string;
  gender: number;         // integer(int32)
}
```

### UserAgreementStatusVO (用户协议状态)

```typescript
interface UserAgreementStatusVO {
  agreed: boolean;
  version: string;
  agreedAt: string;       // date-time
}
```

**对应Result类型**: `ResultUserAgreementStatusVO`

### UserAgreementRequest (用户协议请求)

```typescript
interface UserAgreementRequest {
  version: string;
}
```

### UserSettingVO (用户设置)

```typescript
interface UserSettingVO {
  notifyComment: boolean;          // 评论通知
  notifyReply: boolean;            // 回复通知
  notifyLike: boolean;             // 点赞通知
  notifyActivityRemind: boolean;   // 活动提醒
  notifyExamRemind: boolean;       // 考试提醒
  notifySystem: boolean;           // 系统通知
  notifyAuditResult: boolean;      // 审核结果通知
}
```

**对应Result类型**: `ResultUserSettingVO`

### UserSettingUpdateRequest (用户设置更新请求)

```typescript
interface UserSettingUpdateRequest {
  notifyComment: boolean;
  notifyReply: boolean;
  notifyLike: boolean;
  notifyActivityRemind: boolean;
  notifyExamRemind: boolean;
  notifySystem: boolean;
  notifyAuditResult: boolean;
}
```

---

## 登录相关

### LoginRequest (登录请求)

```typescript
interface LoginRequest {
  code: string;  // 微信授权码
}
```

### LoginVO (登录返回VO)

```typescript
interface LoginVO {
  token: string;                   // JWT token
  userInfo: UserInfoDTO;           // 用户信息
}
```

**对应Result类型**: `ResultLoginVO`

---

## 活动相关

### ActivityCreateRequest (活动创建请求)

```typescript
interface ActivityCreateRequest {
  title: string;
  content: string;
  location: string;
  category: number;                // integer(int32)
  organizer: string;
  audienceScope: number;           // integer(int32)
  contactInfo: string;
  joinMethod: string;
  qrcodeUrl: string;
  startTime: string;               // date-time
  endTime: string;                 // date-time
  enrollDeadline: string;          // date-time
  maxParticipants: number;         // integer(int32)
  attachmentItems: unknown[];      // 附件列表
  timelineItems: unknown[];        // 时间轴列表
}
```

### ActivityUpdateRequest (活动更新请求)

```typescript
interface ActivityUpdateRequest {
  id: number;                      // integer(int64)
  title: string;
  content: string;
  location: string;
  category: number;                // integer(int32)
  organizer: string;
  audienceScope: number;           // integer(int32)
  contactInfo: string;
  joinMethod: string;
  qrcodeUrl: string;
  startTime: string;               // date-time
  endTime: string;                 // date-time
  enrollDeadline: string;          // date-time
  maxParticipants: number;         // integer(int32)
  attachmentItems: unknown[];
  timelineItems: unknown[];
}
```

### ActivityListVO (活动列表项)

```typescript
interface ActivityListVO {
  id: number;                      // integer(int64)
  title: string;
  category: number;                // integer(int32)
  organizer: string;
  audienceScope: number;           // integer(int32)
  enrollDeadline: string;          // date-time
  publishedAt: string;             // date-time
}
```

### ActivityDetailVO (活动详情)

```typescript
interface ActivityDetailVO {
  id: number;                      // integer(int64)
  userId: number;                  // integer(int64)
  title: string;
  content: string;
  location: string;
  category: number;                // integer(int32)
  organizer: string;
  audienceScope: number;           // integer(int32)
  contactInfo: string;
  joinMethod: string;
  qrcodeUrl: string;
  startTime: string;               // date-time
  endTime: string;                 // date-time
  enrollDeadline: string;          // date-time
  maxParticipants: number;         // integer(int32)
  commentCount: number;            // integer(int32)
  likeCount: number;               // integer(int32)
  viewCount: number;               // integer(int32)
  publishedAt: string;             // date-time
  author: UserSimpleBO;
  attachmentItems: unknown[];
  timelineItems: unknown[];
  liked: boolean;                  // 当前用户是否点赞
  enrolled: boolean;               // 当前用户是否已报名
}
```

**对应Result类型**: `ResultActivityDetailVO`  
**对应分页Result类型**: `ResultPageResultActivityListVO`

---

## 考试相关

### ExamCreateRequest (考试创建请求)

```typescript
interface ExamCreateRequest {
  title: string;
  category: number;                // integer(int32)
  content: string;
  registrationStart: string;       // date-time
  registrationEnd: string;         // date-time
  examDate: string;                // date
  examDateEnd: string;             // date
  officialUrl: string;
  attachmentItems: unknown[];
  timelineItems: unknown[];
}
```

### ExamUpdateRequest (考试更新请求)

```typescript
interface ExamUpdateRequest {
  id: number;                      // integer(int64)
  title: string;
  category: number;                // integer(int32)
  content: string;
  registrationStart: string;       // date-time
  registrationEnd: string;         // date-time
  examDate: string;                // date
  examDateEnd: string;             // date
  officialUrl: string;
  mediaList: unknown[];
  timelineList: unknown[];
}
```

### ExamVO (考试列表项)

```typescript
interface ExamVO {
  id: number;                      // integer(int64)
  title: string;
  category: number;                // integer(int32)
  content: string;
  registrationStart: string;       // date-time
  registrationEnd: string;         // date-time
  examDate: string;                // date
  examDateEnd: string;             // date
  officialUrl: string;
  commentCount: number;            // integer(int32)
  likeCount: number;               // integer(int32)
  viewCount: number;               // integer(int32)
  publishedAt: string;             // date-time
  author: UserSimpleBO;
  attachmentItems: unknown[];
  timelineItems: unknown[];
}
```

### ExamDetailVO (考试详情)

同 ExamVO 的字段结构

**对应Result类型**: `ResultExamDetailVO`  
**对应分页Result类型**: `ResultPageResultExamVO`

---

## 帖子相关

### PostCreateRequest (帖子创建请求)

```typescript
interface PostCreateRequest {
  title: string;
  content: string;
  attachmentItems: unknown[];
}
```

### PostListBO (帖子列表项)

```typescript
interface PostListBO {
  id: number;                      // integer(int64)
  title: string;
  content: string;
  likeCount: number;               // integer(int32)
  commentCount: number;            // integer(int32)
  viewCount: number;               // integer(int32)
  publishedAt: string;
  author: UserSimpleBO;
  attachments: unknown[];
}
```

### PostDetailVO (帖子详情)

```typescript
interface PostDetailVO {
  id: number;                      // integer(int64)
  title: string;
  content: string;
  likeCount: number;               // integer(int32)
  commentCount: number;            // integer(int32)
  viewCount: number;               // integer(int32)
  publishedAt: string;
  author: UserSimpleBO;
  attachments: unknown[];
}
```

**对应Result类型**: `ResultPostDetailVO`  
**对应分页Result类型**: `ResultPageResultPostListBO`

---

## 评论相关

### CommentCreateRequest (评论创建请求)

```typescript
interface CommentCreateRequest {
  targetType: number;              // integer(int32)
  targetId: number;                // integer(int64)
  parentId: number;                // integer(int64)
  replyToUid: number;              // integer(int64)
  content: string;
  imageUrl: string;
}
```

### CommentVO (评论VO)

```typescript
interface CommentVO {
  id: number;                      // integer(int64)
  targetType: number;              // integer(int32)
  targetId: number;                // integer(int64)
  parentId: number;                // integer(int64)
  replyToUid: number;              // integer(int64)
  content: string;
  imageUrl: string;
  likeCount: number;               // integer(int32)
  replyCount: number;              // integer(int32)
  createdAt: string;
  author: UserSimpleBO;
  replyToUser: UserSimpleBO;
}
```

**对应分页Result类型**: `ResultPageResultCommentVO`

---

## 时间轴相关

### TimelineItemRequest (时间轴项目请求)

```typescript
interface TimelineItemRequest {
  label: string;
  description: string;
  startTime: string;               // date-time
  endTime: string;                 // date-time
  sortOrder: number;               // integer(int32)
}
```

### TimelineUpdateRequest (时间轴更新请求)

```typescript
interface TimelineUpdateRequest {
  id: number;                      // integer(int64)
  label: string;
  description: string;
  startTime: string;               // date-time
  endTime: string;                 // date-time
  sortOrder: number;               // integer(int32)
}
```

### TimelineVO (时间轴VO)

```typescript
interface TimelineVO {
  id: number;                      // integer(int64)
  targetType: number;              // integer(int32)
  targetId: number;                // integer(int64)
  label: string;
  description: string;
  startTime: string;               // date-time
  endTime: string;                 // date-time
  sortOrder: number;               // integer(int32)
}
```

### TimelineBO (时间轴BO)

```typescript
interface TimelineBO {
  id: number;                      // integer(int64)
  targetType: string;
  targetId: number;                // integer(int64)
  label: string;
  description: string;
  startTime: string;               // date-time
  endTime: string;                 // date-time
  sortOrder: number;               // integer(int32)
  createdAt: string;               // date-time
  updatedAt: string;               // date-time
}
```

**对应Result类型**: `ResultListTimelineVO` (数组)

---

## 互动相关

### InteractLikeRequest (点赞请求)

```typescript
interface InteractLikeRequest {
  targetType: number;              // integer(int32)
  targetId: number;                // integer(int64)
}
```

### InteractShareRequest (分享请求)

```typescript
interface InteractShareRequest {
  targetType: number;              // integer(int32)
  targetId: number;                // integer(int64)
  platform: number;                // integer(int32)
}
```

### InteractViewRequest (浏览请求)

```typescript
interface InteractViewRequest {
  targetType: number;              // integer(int32)
  targetId: number;                // integer(int64)
}
```

### LikeCountVO (点赞数)

```typescript
interface LikeCountVO {
  count: number;                   // integer(int64)
}
```

**对应Result类型**: `ResultLikeCountVO`

### LikeStatusVO (点赞状态)

```typescript
interface LikeStatusVO {
  liked: boolean;
}
```

**对应Result类型**: `ResultLikeStatusVO`

### ShareCountVO (分享数)

```typescript
interface ShareCountVO {
  count: number;                   // integer(int64)
}
```

**对应Result类型**: `ResultShareCountVO`

### ViewCountVO (浏览数)

```typescript
interface ViewCountVO {
  count: number;                   // integer(int64)
}
```

**对应Result类型**: `ResultViewCountVO`

---

## 通知相关

### NotificationVO (通知VO)

```typescript
interface NotificationVO {
  id: number;                      // integer(int64)
  userId: number;                  // integer(int64)
  type: string;                    // 通知类型
  title: string;
  content: string;
  targetType: string;
  targetId: number;                // integer(int64)
  senderId: number;                // integer(int64)
  isRead: boolean;
  createdAt: string;               // date-time
}
```

**对应分页Result类型**: `ResultPageResultNotificationVO`

---

## 媒体相关

### MediaUploadCredentialRequest (媒体上传凭证请求)

```typescript
interface MediaUploadCredentialRequest {
  targetType: number;              // integer(int32)
  fileName: string;
}
```

### CosUploadCredentialDTO (COS上传凭证)

```typescript
interface CosUploadCredentialDTO {
  bucket: string;
  region: string;
  objectKey: string;
  uploadUrl: string;
  fileUrl: string;
  expireAt: string;                // date-time
}
```

**对应Result类型**: `ResultCosUploadCredentialDTO`

### MediaAttachmentBO (媒体附件BO)

```typescript
interface MediaAttachmentBO {
  id: number;                      // integer(int64)
  type: string;
  url: string;
  originalName: string;
  sortOrder: number;               // integer(int32)
}
```

### MediaAttachmentSimpleBO (媒体附件简单BO)

```typescript
interface MediaAttachmentSimpleBO {
  id: number;                      // integer(int64)
  targetId: number;                // integer(int64)
  url: string;
  sortOrder: number;               // integer(int32)
}
```

### AttachmentItemRequest (附件项请求)

```typescript
interface AttachmentItemRequest {
  type: number;                    // integer(int32)
  url: string;
  originalName: string;
  sortOrder: number;               // integer(int32)
}
```

---

## 分页相关

### PageResultActivityListVO

```typescript
interface PageResultActivityListVO {
  list: unknown[];                 // ActivityListVO[]
  hasMore: boolean;
  nextCursor: number;              // integer(int64)
}
```

### PageResultCommentVO

```typescript
interface PageResultCommentVO {
  list: unknown[];                 // CommentVO[]
  hasMore: boolean;
  nextCursor: number;              // integer(int64)
}
```

### PageResultExamVO

```typescript
interface PageResultExamVO {
  list: unknown[];                 // ExamVO[]
  hasMore: boolean;
  nextCursor: number;              // integer(int64)
}
```

### PageResultNotificationVO

```typescript
interface PageResultNotificationVO {
  list: unknown[];                 // NotificationVO[]
  hasMore: boolean;
  nextCursor: number;              // integer(int64)
}
```

### PageResultPostListBO

```typescript
interface PageResultPostListBO {
  list: unknown[];                 // PostListBO[]
  hasMore: boolean;
  nextCursor: number;              // integer(int64)
}
```

---

## 审核相关

### AuditTextCheckRequest (审核文本检查请求)

```typescript
interface AuditTextCheckRequest {
  targetType: number;              // integer(int32)
  targetId: number;                // integer(int64)
  content: string;
  scene: number;                   // integer(int32)
  openid: string;
}
```

### AuditMediaCheckRequest (审核媒体检查请求)

```typescript
interface AuditMediaCheckRequest {
  targetType: number;              // integer(int32)
  targetId: number;                // integer(int64)
  mediaUrl: string;
  mediaType: number;               // integer(int32)
  scene: number;                   // integer(int32)
  openid: string;
}
```

### AuditCheckResultVO (审核检查结果)

```typescript
interface AuditCheckResultVO {
  passed: boolean;
  pending: boolean;
  traceId: string;
  suggest: string;
  label: number;                   // integer(int32)
}
```

**对应Result类型**: `ResultAuditCheckResultVO`

### WxMediaAuditCallbackRequest (微信媒体审核回调请求)

```typescript
interface WxMediaAuditCallbackRequest {
  version: number;                 // integer(int32)
  appid: string;
  traceId: string;
  errcode: number;                 // integer(int32)
  errmsg: string;
  result: ResultInfo;
  detail: unknown[];               // array
  event: string;
  fromUserName: string;
  msgType: string;
  createTime: number;              // integer(int32)
  toUserName: string;
}
```

### ResultInfo (结果信息)

```typescript
interface ResultInfo {
  suggest: string;
  label: number;                   // integer(int32)
}
```

### DetailInfo (详情信息)

```typescript
interface DetailInfo {
  strategy: string;
  errcode: number;                 // integer(int32)
  suggest: string;
  label: number;                   // integer(int32)
  prob: number;                    // integer(int32)
}
```

### BindQrInfo (绑定二维码信息)

```typescript
interface BindQrInfo {
  scene: string;
  ticket: string;
  qrUrl: string;
  expireAt: string;                // date-time
}
```

**对应Result类型**: `ResultBindQrInfo`

---

## 特殊Result类型

| 类型 | 说明 | Data类型 |
|------|------|---------|
| `ResultVoid` | 空返回 | null |
| `ResultString` | 字符串返回 | string |
| `ResultLong` | 整数返回 | number (int64) |

---

## 文件位置

完整的 TypeScript 类型定义文件已生成至: [services/api-types.ts](./services/api-types.ts)

## 使用指南

1. **在项目中导入类型**:
```typescript
import { 
  Result, 
  UserProfileVO, 
  ActivityDetailVO,
  // ... 其他类型
} from '@/services/api-types';
```

2. **使用Result包装器**:
```typescript
type GetUserResponse = Result<UserProfileVO>;
type GetActivityResponse = Result<ActivityDetailVO>;
```

3. **处理分页结果**:
```typescript
type GetActivitiesResponse = Result<PageResultActivityListVO>;
// 访问数据: response.data.list, response.data.hasMore, response.data.nextCursor
```

---

## 总模型统计

- **总模型数**: 77
- **Result包装器**: 31
- **VO类型**: 28
- **Request请求类型**: 15
- **BO/DTO类型**: 3

**分类统计**:
- 用户相关: 8 个
- 活动相关: 4 个
- 考试相关: 4 个
- 帖子相关: 3 个
- 评论相关: 2 个
- 时间轴相关: 4 个
- 互动相关: 7 个
- 通知相关: 1 个
- 媒体相关: 5 个
- 审核相关: 6 个
- 通用工具类: 3 个
- 分页相关: 5 个

---

**生成工具**: GitHub Copilot  
**生成时间**: 2026-05-11  
**数据来源**: http://localhost:8080/doc.html (Swagger UI)
