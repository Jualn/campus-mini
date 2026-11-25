# 官方宣传内容 M01

首页不再展示官方内容总入口和品牌分类入口；E·安全文章列表仍保留历史官方内容入口。官方内容列表继续支持 e 网同心、信息红、E·安全等分类。列表及详情属于既有 subpkg_red，通过共享 request 边界访问 canonical 接口，需登录身份；不使用 Post 集合或客户端角色推断官方内容。

列表支持分类及服务端游标翻页；切换筛选、下拉刷新、卸载使用 generation 防止旧响应覆盖。详情每次进入前台重新读取并清除旧详情，撤下或读取失败不会保留旧正文。纯文本、图片预览及原生 video 播放，不渲染用户 HTML。

源码、typecheck 和 package audit 与微信开发者工具/真机证据独立。视频需可访问地址、兼容编码以及已配置的微信域名；生产发布未执行。契约见 [官方内容](../../../contracts/api/paths/official-content.yaml)。

定向验证：`node scripts/test-official-content.mjs`；首页保留回归 `node scripts/test-red-home.mjs`。网络及 wx 替身不证明原生渲染或设备播放。
