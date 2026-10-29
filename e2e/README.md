# React 社区真实接口回归

在工作区根目录运行：

```bash
python3 react-study/e2e/run.py
```

需要本机 Docker / Compose、Python 3 和 Node.js 22.22.2+，并将 `react-study`、`liushao_community_backend`、`authority_management_backend`、`authority_management_frontend` 放在同级目录。入口复用后端的部署编排，将社区前端构建上下文替换为 React 仓库，创建独立凭据、端口、MySQL、Redis 和测试 SMTP。

测试直接访问 React 生产镜像及真实接口，覆盖注册登录、Markdown 清理与图片、审核和重新提交、互动社交、通知私信、邮件验证/重置、内容发现、草稿恢复与冲突，以及独立井字棋入口、登录跳转和个人设置。桌面和手机均运行相同业务用例。

```bash
# 仅检查桌面，或筛选特定流程
python3 react-study/e2e/run.py --project desktop
python3 react-study/e2e/run.py --grep '草稿'

# 使用已安装 Chromium
CHROMIUM_EXECUTABLE=/absolute/path/to/chrome python3 react-study/e2e/run.py

# 只列出用例
cd react-study/e2e
npm ci
npm run test:list
```

默认在运行结束后清理本次测试的容器、卷和应用镜像。诊断产物保存在被 Git 忽略的 `.artifacts/`，其中环境凭据与日志不应公开。`--keep-environment` 仅供本机调试，会输出本次环境的准确清理命令。

测试包固定 Playwright 版本；需要使用入口创建的隔离环境运行，不能直接将 `npm test` 指向已有业务环境。管理后台验证码仅从该测试项目的 Redis 读取；邮件验证码来自实际 SMTP 投递，测试邮件不会发送到外部邮箱。
