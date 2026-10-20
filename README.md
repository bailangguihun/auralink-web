# ArtLIVE 画智体 · Web

面向中国画数字内容的 Web 前端。项目以真实后端能力为边界，提供画作浏览、作品详情、收藏、账户会话与创作工作流等体验；尚未接入的模块会在界面中明确标注，不使用模拟数据伪装可用能力。

> 当前版本基于 Next.js 15 App Router，连接 ArtLIVE Spring Boot 浏览器 API。

## 功能概览

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 首页 | 可用 | 中国画视觉首页、功能入口与响应式导航 |
| 画廊 | 已接入 | 浏览后端画作目录、每日推荐与作品详情 |
| 账户 | 已接入 | 注册、登录、资料读取与会话恢复 |
| 收藏 | 已接入 | 登录用户的作品收藏与个人收藏页 |
| 创作工坊 | 接入中 | 按后端能力开放创作与工作流功能 |
| 知识库、社区、助手 | 待开放 | 等待相应后端接口完成后接入 |
| 小程序登录桥接 | 可用 | 通过 `/mobile-auth` 安全接收小程序会话 |

## 技术栈

- Next.js 15（App Router）
- React 18
- TypeScript 5
- ESLint 9
- Node.js Test Runner

## 本地运行

### 环境要求

- Node.js 22（与 CI 环境一致）
- npm
- 可访问的 ArtLIVE 后端服务

### 启动步骤

```bash
git clone https://github.com/bailangguihun/auralink-web.git
cd auralink-web
npm ci
```

按需创建 `.env.local`：

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
```

随后启动开发服务器：

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可访问。未设置 `NEXT_PUBLIC_API_BASE_URL` 时，前端默认连接 `http://localhost:5000`。

`NEXT_PUBLIC_API_BASE_URL` 必须是后端的 HTTP(S) 源地址，不能包含用户名、密码、模型服务地址或任何第三方服务凭据。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run start` | 启动生产服务器 |
| `npm run typecheck` | 执行 TypeScript 类型检查 |
| `npm test` | 运行测试 |
| `npm run lint` | 执行 ESLint 检查 |

提交代码前建议运行完整校验：

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

## 页面路由

| 路由 | 页面 |
| --- | --- |
| `/` | 首页 |
| `/gallery` | 画廊 |
| `/gallery/[paintingId]` | 作品详情 |
| `/studio` | 创作工坊 |
| `/knowledge` | 知识库 |
| `/community` | 社区 |
| `/assistant` | 助手 |
| `/login`、`/register` | 登录与注册 |
| `/account`、`/me` | 账户与个人收藏 |
| `/mobile-auth` | 小程序会话桥接 |

## 会话与安全

- 浏览器仅在 `artlive.session.token.v1` 中保存后端签发的 bearer token。
- 密码、角色、用户资料、画作记录和 AI 结果不会持久化到浏览器存储。
- 页面刷新后，前端通过 `GET /api/user/profile` 验证 token 并恢复会话。
- 当前后端尚无注销或 token 撤销接口，因此退出登录只移除本地 token。
- `/mobile-auth` 只从 URL fragment 接收小程序 session token；fragment 会立即从浏览器历史中移除，不会进入 HTTP 请求或查询参数。
- 小程序登录完成后仅允许跳转到 `/knowledge` 或 `/studio`，避免开放重定向风险。

## 分支与发布

- 面向 `main` 和 `release` 的 Pull Request 会执行类型检查、测试、Lint 与生产构建。
- 生产发布遵循 `main → release` 的提升路径。
- `release` 分支更新后由 GitHub Actions 触发生产部署。

## 参与贡献

提交 Pull Request 前，请按 [Pull Request 模板](.github/pull_request_template.md) 完成自检，并确保本地完整校验通过。若新增前端能力，请同时补充相应测试，并保持界面状态与真实后端能力一致。

