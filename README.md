# React Study

一个用于学习 React 的井字棋项目，使用 React 19、函数组件和 Hooks，基于 Vite 构建。

## 功能

- X / O 轮流落子，禁止覆盖已有棋子。
- 判断横、竖、斜线胜利并高亮连线，获胜后停止落子。
- 棋盘填满且无人获胜时显示平局。
- 回看任意一步，从历史位置继续落子时替换后续记录。
- 一键重新开始，支持窄屏布局和键盘操作。

## 环境

使用 Node.js `^22.22.2`、`^24.15.0` 或 `>=26.0.0`，满足当前构建和测试依赖的要求。

```bash
npm ci
npm start
```

默认开发地址为 <http://localhost:3000>；端口占用时以终端实际输出为准。`npm run dev` 同样可以启动开发服务。

## 验证和构建

```bash
npm test
npm run build
npm run preview
```

- `npm test`：使用 Vitest、Testing Library 和 jsdom 执行游戏交互回归测试。
- `npm run test:watch`：监听文件变化并重新运行测试。
- `npm run build`：生成 `dist/` 生产静态文件。
- `npm run preview`：本地预览构建结果，默认地址为 <http://localhost:4173>。

部署到子路径时可使用 `npm run build -- --base=/react-study/`。

## 代码入口

- `index.html`：Vite HTML 入口和页面元信息。
- `src/main.jsx`：使用 `createRoot` 和 `StrictMode` 挂载应用。
- `src/Game.jsx`：棋格、棋盘、游戏状态和胜负判断。
- `src/index.css`：棋盘、历史记录和响应式布局样式。
- `src/Game.test.jsx`：胜负、平局、历史回看和重新开始的交互测试。

项目已由 Create React App 迁移到 Vite。旧的 `react-scripts`、未使用的 `web-vitals` 和 `eject` 命令已移除；生产输出目录从 `build/` 改为 `dist/`。
