# Web 团队协作与发布

本仓库管理 AuraLink 的 Next.js 前端。项目还包括 [Core API](https://github.com/Hang-666-star/auralink-core-api)、[AI 服务](https://github.com/Hang-666-star/auralink-ai-service) 和 [部署配置](https://github.com/Hang-666-star/auralink-deploy)。各仓库独立 clone，使用各自的 origin。

## 日常协作

1. 从最新 main 创建 feat/功能名、fix/问题名或 codex/任务名分支。
2. 完成功能和检查，推送自己的分支，向 main 提交 PR。
3. 填写改动、验证结果、关联的其他仓库 PR、兼容性和回退办法。
4. CI 和现有审查规则满足后合并 main。main 是团队集成分支，正常开发通过 PR 合入。

```bash
git clone https://github.com/Hang-666-star/auralink-web.git
cd auralink-web
git switch main
git pull --ff-only origin main
git switch -c feat/example
npm ci
npm run typecheck
npm test
npm run lint
npm run build
git push -u origin feat/example
```

修改之前先检查 git status，保留自己或同事的未提交工作。日常开发不需要登录生产服务器，也不需要共享生产 SSH 私钥。

## 阶段发布

在本仓库创建 base=release、compare=main 的 PR。只有本仓库 main 可以作为 release PR 的来源；fork 中同名 main 也不符合要求。必需检查名保留为 Validate web application 和 Verify main-to-release promotion。

release PR 应使用 Create a merge commit，保持长期 main/release 的合并历史。若出现冲突，通过专门的协调 PR 处理并重新验收，不使用强推覆盖历史。

合并 release 会触发 Deploy to Production。现有流程使用 production environment 的配置，通过 SSH 调用服务器已有 Web 部署入口，部署触发事件的确切 commit SHA。环境若配置了生产审批，Actions 会等待审批后继续。合并 main 本身不会部署生产。

发布说明应记录 Web SHA、兼容的 Core SHA、需要的 API 或环境配置变化、验收页面和回退版本。前后端有不兼容变化时，先设计兼容过渡与发布顺序；两个仓库独立 Actions 不提供跨仓库原子发布。

## 配置与验证边界

浏览器只使用 NEXT_PUBLIC_API_BASE_URL 等可公开配置，任何 NEXT_PUBLIC_ 值都会进入浏览器包。提供商密钥、生产 SSH 私钥、数据库凭证和真实用户数据不提交到仓库。

CI 通过表示本次前端检查通过；生产成功还需要对应 release 的部署任务成功，并核对线上版本、页面和后端接口。部署失败先检查该运行及服务器现有回退机制，不直接覆盖生产目录或停止整套 R25 服务。

## 前端加载默认约定

所有新增和调整页面遵循 [前端加载体验](docs/FRONTEND_LOADING.md)：纸色结构骨架、独立分区、紧凑局部反馈、180ms reveal 与减弱动画。客户端数据加载需单独处理，不能只添加 `loading.tsx`。保留账号/查询隔离、执行前能力核验、写操作幂等与 UNKNOWN；不得为加载效果添加持久数据缓存或自动重放业务请求。PR 附隔离的桌面/390px 慢读与失败证据，速度结论必须单列真实测量依据。
