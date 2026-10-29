# 功能入口与实现对应

React 版使用现有社区后端的接口和身份，不需要新增数据库、复制业务数据或运行 Vue 页面。

| 入口 | 功能 | React 实现 |
| --- | --- | --- |
| `/` | 最新、近七天热门、精华、关注动态；公告、每日一句、推广 | `pages/Home.tsx`、`components/PostList.tsx`、`components/Sidebar.tsx` |
| `/search?key=…`、`/tag/:name` | 标题/正文/标签/作者搜索、标签列表与主题分页 | `pages/Home.tsx` |
| `/login`、`/register`、`/password/forgot` | 账号注册、登录、登录后返回、邮件找回密码 | `pages/Auth.tsx` |
| `/post/create`、`/post/:id/edit` | 标题、标签、Markdown、图片上传与预览、提交审核 | `pages/Editor.tsx` |
| `/post/:id`、`/me/posts/:id` | 公开/作者详情、状态与审核原因、编辑、删除 | `pages/Post.tsx` |
| 帖子互动区 | 评论、实际目标回复、删除自己的评论、点赞、收藏 | `components/PostComments.tsx`、`pages/Post.tsx` |
| `/me/posts`、`/me/bookmarks` | 我的帖子（含待审核/隐藏）、我的收藏、取消收藏 | `pages/Collections.tsx` |
| `/me/drafts` | 私有草稿分页、浏览器恢复副本、续写、删除 | `pages/Collections.tsx` |
| `/member/:username/home` | 公开资料、作者帖子、关注/取消、发私信 | `pages/Member.tsx` |
| `/member/:username/setting` | 本人昵称、简介、头像、邮箱验证、修改密码 | `pages/Member.tsx` |
| `/me/following`、`/me/followers` | 关注/粉丝分页、取消关注、进入主页和私信 | `pages/Collections.tsx` |
| `/notifications` | 评论、回复、点赞、关注、审核通知和已读状态 | `pages/Inbox.tsx` |
| `/messages`、`/messages/:username` | 会话、历史分页、发送、未读数量及已读回执 | `pages/Inbox.tsx` |
| `/games/tic-tac-toe` | 无需登录的井字棋、历史回看、平局与获胜判断 | `Game.jsx` |

上表路径位于浏览器 URL 的 `#` 后。登录保护使用原页面完整路径返回；401 会清理会话，修改/重置密码后重新登录。设置页面检查当前账号；帖子与评论操作根据作者身份展示，后端再次验证权限。

## 创作与草稿

编辑器先分配稳定的草稿 URL，再允许输入。每次更改立即写入 `liushao:react:post-draft:1:<用户 ID>:<草稿 ID>` 的本机恢复副本，并在停止输入一秒后同步服务器。保存请求串行执行，期间新增的输入会在下一次保存中同步；发布前等待最新输入保存完成。

网络失败保留当前输入和错误提示，恢复联网或手动保存可重试。其他页面更新了草稿，或原帖版本已经改变时，旧页面不能覆盖服务器内容；可以复制为新主题，或确认后载入最新版本。发布成功后移除本机副本，后端以事务完成发布和草稿移除。其他账号的草稿不会出现在当前账号列表中。

新帖和修改后的文章均先进入待审核；公开列表与关注动态遵循后端审核状态。作者通过“我的帖子”查看待审核或隐藏内容，以及审核原因。

## 交互与媒体

评论和私信只显示纯文本；回复一条回复时提交实际目标 ID，由后端保持一级展示并通知实际接收者。Markdown 预览和详情复用同一清理组件，过滤脚本、事件属性、危险链接和表单等内容。`/uploads/` 图片统一转换为 API 地址。

PNG/JPEG 单张最大 4 MiB，上传和头像归属由后端再次检查。邮箱验证码、重发间隔、私信参与者、点赞/收藏/关注幂等性均沿用现有后端规则。通知、会话和最新消息仅在页面可见时周期刷新。

## 小游戏

社区导航和首页侧栏均可进入井字棋。游戏不调用社区写接口，不需要社区账号；保留原有落子、胜负、平局、重新开始和历史分支功能，并适配社区的深浅主题。
