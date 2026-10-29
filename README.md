# React 版流沙社区

基于 React 19、TypeScript strict、React Router 7 和 Vite 8，实现与同级 `liushao_community_frontend` 对接同一后端的社区功能，并保留井字棋小游戏。

## 开发

需要 Node.js `^22.22.2`、`^24.15.0` 或 `>=26.0.0`。

```bash
npm ci
cp .env.example .env.local
npm start
```

访问 <http://localhost:3000>。社区功能需要运行 `liushao_community_backend` 及其 MySQL、Redis；启动方式见同级后端 README。井字棋入口为 <http://localhost:3000/#/games/tic-tac-toe>，不需要登录。

- `VITE_API_BASE_URL`：浏览器 API 前缀，默认 `/api`。
- `VITE_API_PROXY_TARGET`：开发代理的后端地址，默认 `http://localhost:8080`；代理会移除 `/api` 前缀。
- 开发代理保留浏览器的 Host，使转发后的写请求继续通过后端的同源检查。
- 路由采用 hash 模式，兼容现有社区链接。开发端口为 `3000`，可与原社区前端的 `5173` 同时运行。

`VITE_*` 会写入浏览器构建产物，只用于公开配置。

## 功能

- 首页最新、近七天热门、精华、关注动态，置顶标识、分页、搜索及标签筛选。
- 注册、登录、退出、登录恢复及返回原页面；个人资料、头像、邮箱验证、改密和找回密码。
- Markdown 发帖与编辑、图片上传、预览与 HTML 清理；新帖及修改提交后进入审核。
- 私有草稿箱、自动同步、立即保存浏览器恢复副本、账号隔离、断网恢复和版本冲突处理。
- 帖子详情、作者操作、评论与一级回复、点赞、收藏、关注与粉丝列表。
- 通知、逐条/全部已读、未读数、私信会话与历史分页；页面可见时定期刷新。
- 公告、每日一句、推广资源、深浅主题、手机导航、键盘操作和错误重试。
- 井字棋：X/O 轮流落子、胜负和平局、获胜高亮、历史回看与重新开始。

功能入口和原项目对应关系见 [功能说明](docs/FEATURES.md)。

## 验证与构建

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

`npm test` 使用 Vitest、Testing Library 和 jsdom，覆盖井字棋、草稿并发与恢复、会话过期与旧请求隔离、Markdown 清理及输入边界。`npm run test:watch` 可监听文件变化。生产输出为 `dist/`；预览服务默认端口为 `4173`。

真实后端的桌面/手机浏览器回归见 [e2e/README.md](e2e/README.md)。集成测试会使用同级两个后端及管理前端，在独立 Compose 环境中运行。

本次迁移的验证范围与结果见 [验收记录](docs/VERIFICATION.md)。

## 容器

```bash
docker build -t liushao/react-web:local .
docker run --rm --network liushao -p 127.0.0.1:3000:8080 \
  -e API_UPSTREAM=http://community-api:8080 liushao/react-web:local
```

后端需位于同一 Docker 网络，使用 `community-api` 网络别名。镜像使用 Node.js 22 构建，通过严格类型检查后，由非 root Nginx 在 `8080` 提供静态资源；`API_UPSTREAM` 指定后端协议、主机和端口，不包含路径。Nginx 将同源 `/api/` 转发到后端，提供 `/healthz`，并对带哈希的静态资源设置长期缓存。

普通静态部署同样需要将 `/api` 反向代理到社区后端。部署子路径可使用 `npm run build -- --base=/react-study/`，hash 路由随所在目录使用。

## 代码

- `src/App.tsx`：路由、页面懒加载及全局 Provider。
- `src/pages/`：社区页面；`src/components/`：布局、列表、评论、上传和 Markdown。
- `src/state/`：登录状态、未读数量和草稿同步状态。
- `src/api/`、`src/types.ts`：与现有后端一致的请求及类型定义。
- `src/Game.jsx`：保留的井字棋游戏，样式限定在 `.tic-tac-toe` 内。

草稿按账号存储；私信与评论按纯文本展示。用户 Markdown 统一经过 Marked 解析和 DOMPurify 清理，上传地址通过公共 API 前缀转换。
