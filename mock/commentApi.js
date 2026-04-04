/**
 * 评论区 Mock API
 * 模拟后端接口，后续可直接替换为真实请求
 * 所有方法返回 Promise，接口格式与真实接口保持一致
 */

const MOCK_USERS = [
  { userId: 'u1',  nickName: '王小明', _avatarBg: '#667eea', _avatarChar: '王' },
  { userId: 'u2',  nickName: '张晓梅', _avatarBg: '#f5576c', _avatarChar: '张' },
  { userId: 'u3',  nickName: '李思远', _avatarBg: '#4facfe', _avatarChar: '李' },
  { userId: 'u4',  nickName: '陈婷婷', _avatarBg: '#43e97b', _avatarChar: '陈' },
  { userId: 'u5',  nickName: '刘宇轩', _avatarBg: '#fa709a', _avatarChar: '刘' },
  { userId: 'u6',  nickName: '赵琳琳', _avatarBg: '#a18cd1', _avatarChar: '赵' },
  { userId: 'u7',  nickName: '孙浩然', _avatarBg: '#ffecd2', _avatarChar: '孙' },
  { userId: 'u8',  nickName: '周欣怡', _avatarBg: '#89f7fe', _avatarChar: '周' },
  { userId: 'u9',  nickName: '吴嘉豪', _avatarBg: '#fddb92', _avatarChar: '吴' },
  { userId: 'u10', nickName: '郑雨桐', _avatarBg: '#d4fc79', _avatarChar: '郑' },
  { userId: 'u11', nickName: '冯梓涵', _avatarBg: '#96fbc4', _avatarChar: '冯' },
  { userId: 'u12', nickName: '蒋欢欢', _avatarBg: '#f093fb', _avatarChar: '蒋' },
  { userId: 'u13', nickName: '韩诗语', _avatarBg: '#4481eb', _avatarChar: '韩' },
  { userId: 'u14', nickName: '杨博文', _avatarBg: '#0ba360', _avatarChar: '杨' },
  { userId: 'u15', nickName: '林晓彤', _avatarBg: '#f7971e', _avatarChar: '林' },
  { userId: 'u16', nickName: '徐梦琪', _avatarBg: '#ee0979', _avatarChar: '徐' },
  { userId: 'u17', nickName: '谢俊杰', _avatarBg: '#17ead9', _avatarChar: '谢' },
  { userId: 'u18', nickName: '罗雪婷', _avatarBg: '#6078ea', _avatarChar: '罗' },
  { userId: 'u19', nickName: '高子墨', _avatarBg: '#11998e', _avatarChar: '高' },
  { userId: 'u20', nickName: '彭佳慧', _avatarBg: '#fc5c7d', _avatarChar: '彭' },
]

const COMMENT_TEXTS = [
  // 图书馆 / 自习
  '图书馆最近真的太难抢了，昨天我五点就去了还没有座位😩',
  '求问哪个楼层最安静？我上次去三楼旁边一直有人说话…',
  '已经连续一个月没抢到图书馆了，只能在宿舍学习，效率感觉差很多',
  '哈哈哈恭喜你！我每次都在等人离开然后冲刺🏃‍♀️',
  '建议大家试试综合楼二楼的自习室，那里人少一些，还有插座',
  '期末周真的是魔鬼，大家都加油💪',
  '我今天在图馆睡着了，被管理员叫醒，太丢人了哈哈哈',
  '求推荐好用的番茄钟App，自制力太差了',
  '这次期末复习计划已经打乱了，心态崩了😭',
  '感谢分享！已收藏这个攻略',
  // 课程 / 选课
  '这门课老师讲得真的很好，比网课有意思多了',
  '选课系统又崩了，已经第三次了，学校能不能修一修😤',
  '有没有人知道《数据结构》期末会不会划重点？',
  '高数最后两章真的看不懂，有没有人组队刷题的',
  '今天课堂小测直接懵了，我以为不考那个章节……',
  '老师突然说下周交大作业，我还没开始😱',
  '这学期选了七门课，头要炸了，大家怎么熬过来的',
  '终于把毕业论文开题报告交上去了，感觉整个人都轻松了',
  // 校园生活
  '食堂今天的麻辣烫真的绝了，推荐B2窗口🔥',
  '有没有人一起去操场跑步？想找个搭子互相监督',
  '宿舍楼断网了三天，终于修好了！！！',
  '学校里哪里可以打印？图书馆的机器一直在排队',
  '社团招新结果出来了，好紧张，不知道有没有过',
  '校园里的银杏叶落了好多，今天拍了一堆照片🍂',
  '听说这周五有个音乐节？票还有没有？',
  '跑完操就解锁早餐，今天终于做到了，满足感拉满',
  // 情绪 / 日常
  '最近状态不太好，感觉学什么都记不住，有点焦虑',
  '今天突然意识到距离期末只有三周了，直接破防',
  '熬了一整晚的夜终于把代码跑通了，泪目😭✨',
  '早上闹钟没响，迟到了第一节课，教授点名点到我真想消失',
  '终于等到这个周末，躺平两天不说话',
  '今天被朋友安利了一家奶茶，喝完感觉可以再战三小时☕',
  '室友打呼噜太响，我带着耳机睡都没用，崩溃了',
  '突然好想回家吃妈妈做的饭，学校饭菜真的吃腻了',
  // 技术 / 学习方法
  '有没有人用Notion管理课程笔记？求分享模板',
  '今天学了Git，感觉打开了新世界大门，之前一直用U盘备份……',
  '分享一个背单词的方法：每天睡前刷30个，坚持一个月真的有用',
  '有没有推荐的考研数学复习书？现在还来得及吗',
  '听说学长用ChatGPT辅助写论文过了答辩，这合规吗',
  // 活动 / 比赛
  '数学建模比赛报名开始了，有没有人想组队？',
  '上周参加了学院的辩论赛，虽然输了但感觉超有收获',
  '创新创业大赛初赛过了！决赛好紧张，求攻略',
  '今天参加了志愿者活动，虽然很累但特别有意义❤️',
]

const REPLY_TEXTS = [
  '好的好的，了解了！',
  '同问！！',
  '感谢分享✨',
  '我也遇到这个问题了',
  '太有用了',
  '学到了！',
  '哈哈哈哈哈',
  '收藏了，谢谢',
  '支持！',
  '这个方法不错👍',
  '真的吗，我也要去试试',
  '求带上我一起！',
  '笑死我了😂',
  '同感，完全理解你',
  '加油！你可以的💪',
  '这也太巧了，我昨天也是这样',
  '请问具体在哪个位置？',
  '已转发给室友，她也有同样的困扰',
  '期末互勉，大家一起冲🔥',
  '我也想知道，坐等答案',
  '感同身受，上周也发生了同样的事',
  '哈哈哈哈哈哈绷不住了',
  '太强了吧，佩服佩服',
  '建议发帖详细说说！',
  '完全赞同，我也觉得是这样',
  '这条评论救了我的期末🙏',
  '下次记得叫上我！',
  '正在经历同款痛苦',
  '学长/学姐有没有更多建议？',
  '你说的我也想到了，就是不敢说',
]

const TIMES = [
  '刚刚', '1分钟前', '3分钟前', '8分钟前', '15分钟前',
  '32分钟前', '1小时前', '2小时前', '4小时前', '昨天',
  '2天前', '3天前', '上周',
]

// 生成唯一 id
let idCounter = 1000
function genId() {
  return `mock_${Date.now()}_${idCounter++}`
}

// 生成回复列表
function _makeReplies(seed, count) {
  const replies = []
  for (let i = 0; i < count; i++) {
    const user       = MOCK_USERS[(seed * 3 + i * 7) % MOCK_USERS.length]
    const replyToUser = i > 0 ? MOCK_USERS[(seed * 3 + (i - 1) * 7) % MOCK_USERS.length] : null
    replies.push({
      replyId:    genId(),
      userId:     user.userId,
      nickName:   user.nickName,
      _avatarBg:   user._avatarBg,
      _avatarChar: user._avatarChar,
      replyToName: replyToUser ? replyToUser.nickName : null,
      content:    REPLY_TEXTS[(seed * 7 + i * 4) % REPLY_TEXTS.length],
      likeCount:  Math.floor((seed * 13 + i * 7) % 60),
      isLiked:    false,
      createTime: TIMES[(seed + i * 2) % TIMES.length],
    })
  }
  return replies
}

// 每条评论回复数分布（更丰富：0~15条）
const REPLY_COUNT_DIST = [0, 2, 5, 1, 8, 3, 12, 0, 6, 4, 10, 1, 7, 3, 15, 2, 9, 0, 4, 6]

// 生成评论列表
function _makeComments(seed, total) {
  const comments = []
  for (let i = 0; i < total; i++) {
    const user       = MOCK_USERS[(seed + i * 3) % MOCK_USERS.length]
    const replyCount = REPLY_COUNT_DIST[i % REPLY_COUNT_DIST.length]
    // 每5条中有1条带图
    const hasImg     = i % 5 === 2

    comments.push({
      commentId:  genId(),
      userId:     user.userId,
      nickName:   user.nickName,
      _avatarBg:   user._avatarBg,
      _avatarChar: user._avatarChar,
      content:    COMMENT_TEXTS[(seed * 2 + i) % COMMENT_TEXTS.length],
      imageUrl:   hasImg ? `mock_img_${i % 6}` : '',
      likeCount:  Math.floor((seed * 17 + i * 11) % 200) + 1,
      isLiked:    false,
      replyCount,
      createTime: TIMES[(seed + i) % TIMES.length],
      _allReplies: _makeReplies(seed * 100 + i, replyCount),
    })
  }
  return comments
}

// 各 target 的评论数据（按 targetId 缓存）
const _commentDB = {}

function _getComments(targetId, total) {
  if (!_commentDB[targetId]) {
    _commentDB[targetId] = _makeComments(parseInt(targetId) || 1, total)
  }
  return _commentDB[targetId]
}

const PAGE_SIZE_COMMENT  = 10   // 一级评论每页数量
const PAGE_SIZE_REPLY    = 6    // 二级评论每次加载数量
const REPLY_PREVIEW_COUNT = 3   // 初始携带的二级评论预览数

/**
 * 获取评论列表（分页）
 * @param {string} targetId   - 帖子/活动 id
 * @param {number} page       - 页码（从 0 开始）
 * @param {number} totalCount - mock 用，真实接口不需要
 */
function fetchComments(targetId, page, totalCount = 40) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const all   = _getComments(targetId, totalCount)
      const start = page * PAGE_SIZE_COMMENT
      const slice = all.slice(start, start + PAGE_SIZE_COMMENT)

      const items = slice.map(c => ({
        commentId:    c.commentId,
        userId:       c.userId,
        nickName:     c.nickName,
        _avatarBg:     c._avatarBg,
        _avatarChar:   c._avatarChar,
        content:      c.content,
        imageUrl:     c.imageUrl,
        likeCount:    c.likeCount,
        isLiked:      c.isLiked,
        replyCount:   c.replyCount,
        createTime:   c.createTime,
        replyPreview: c._allReplies.slice(0, REPLY_PREVIEW_COUNT),
      }))

      resolve({
        code: 0,
        data: {
          list:     items,
          total:    all.length,
          page,
          pageSize: PAGE_SIZE_COMMENT,
          hasMore:  start + PAGE_SIZE_COMMENT < all.length,
        }
      })
    }, 400)
  })
}

/**
 * 获取更多二级回复（分页）
 * @param {string} targetId
 * @param {string} commentId
 * @param {number} offset - 已加载数量（跳过预览条数之后）
 */
function fetchReplies(targetId, commentId, offset) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const all     = _getComments(targetId, 40)
      const comment = all.find(c => c.commentId === commentId)
      if (!comment) {
        resolve({ code: 0, data: { list: [], total: 0, hasMore: false } })
        return
      }
      const start = REPLY_PREVIEW_COUNT + offset
      const slice = comment._allReplies.slice(start, start + PAGE_SIZE_REPLY)
      resolve({
        code: 0,
        data: {
          list:    slice,
          total:   comment._allReplies.length,
          hasMore: start + PAGE_SIZE_REPLY < comment._allReplies.length,
        }
      })
    }, 350)
  })
}

/**
 * 发布评论 / 回复
 * @param {object} params - { targetId, content, imageUrl, replyToCommentId, replyToUserId, replyToName }
 */
function postComment(params) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const isReply = !!params.replyToCommentId
      const base = {
        userId:     'self',
        nickName:   '我',
        _avatarBg:   '#43e97b',
        _avatarChar: '我',
        content:    params.content,
        likeCount:  0,
        isLiked:    false,
        createTime: '刚刚',
      }

      if (isReply) {
        resolve({
          code: 0,
          data: {
            type:      'reply',
            commentId: params.replyToCommentId,
            reply: {
              ...base,
              replyId:     genId(),
              replyToName: params.replyToName || null,
            }
          }
        })
      } else {
        resolve({
          code: 0,
          data: {
            type: 'comment',
            comment: {
              ...base,
              commentId:    genId(),
              imageUrl:     params.imageUrl || '',
              replyCount:   0,
              replyPreview: [],
            }
          }
        })
      }
    }, 300)
  })
}

/**
 * 点赞 / 取消点赞
 * @param {string} targetId
 * @param {'comment'|'reply'} type
 * @param {string} id
 * @param {boolean} isLiked - 当前状态（true = 已点赞，调用后取消）
 */
function toggleLike(targetId, type, id, isLiked) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ code: 0, data: { isLiked: !isLiked } })
    }, 200)
  })
}

module.exports = {
  fetchComments,
  fetchReplies,
  postComment,
  toggleLike,
  PAGE_SIZE_COMMENT,
  PAGE_SIZE_REPLY,
  REPLY_PREVIEW_COUNT,
}