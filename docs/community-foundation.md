# 社区第一轮候选

本轮将 `/community` 占位页替换为发帖与互动页面，沿用现有登录、平台导航、纸色界面和加载规范。移动端编辑框可展开，默认优先展示帖子；从画廊带入作品时直接展开编辑。

## 范围

- 帖子列表、详情、发帖、评论、点赞、收藏和账号自己的列表。
- 从画廊选择或从详情带入 UUID；目前展示核验后的文字引用卡和原作入口，不复制图片、不扩展作品分发权限。
- 失效引用隐藏原作信息；接口不可用时显示真实错误和局部重试。
- 每次操作先保存账号范围内的请求标识。双击不重复提交；回包丢失后只查询操作记录，刷新也不自动重发。
- 账号切换隔离草稿、请求结果及待核对操作；正文按文本渲染。
- 上传、房间、语音、墨币、AI 尚未接入。

## 后端依赖

对应 Core 草稿 PR：<https://github.com/bailangguihun/auralink-core-api/pull/33>。
社区后端是该仓库内的独立 Node 进程，数据库为独立 PostgreSQL schema。
平台身份和画廊仍由 Core 核验。Core 同批修复 JWT 未检查当前账号状态的问题。

Next 服务需要服务端设置 `COMMUNITY_INTERNAL_ORIGIN`，仅接受带端口的 loopback HTTP origin。
未配置时显示社区暂未开放。不能把该变量做成 NEXT_PUBLIC，也不能仅部署 Web 就认定社区可用。
新增服务的发布、迁移、配置及监督能力需按 Deploy 提案完成。

## 可重复验证

常规命令：`npm test`、`npm run typecheck`、`npm run lint`、`npm run build`。

浏览器链路使用真实构建的 Next → BFF → Node → PGlite，以及只用于合同验证的 Core HTTP fixture：

~~~bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3199 npm run build
COMMUNITY_SERVICE_ROOT=/path/to/auralink-core-api/community-service \
COMMUNITY_BROWSER_OUTPUT=/path/outside/repos/community-browser \
node tests/community.browser.mjs
~~~

需要可运行的 Playwright Chromium 和中文字库。可通过 PLAYWRIGHT_MODULE 指定已安装运行时；
受限环境可通过 COMMUNITY_CHROMIUM_MODULE、COMMUNITY_CHROMIUM_EXECUTABLE 指定已验证的测试浏览器，
COMMUNITY_FONTCONFIG 指向测试进程的字库配置。这些都不是生产依赖或产品配置。

浏览器验证桌面和 390px、发帖后评论/赞/收藏/刷新、双击、账号切换、列表失败保留草稿、
慢列表独立编辑、提交回包丢失及刷新只读核对、下架引用和长文本。
故障注入的 503/网络错误保留在报告中；不把它们当成线上故障。
该测试构建含 loopback fixture API 地址，禁止作为生产制品。

原生 PostgreSQL 并发、事务回滚与最小权限由 Core 的独立社区 CI 验证。
实际 Spring/Core＋社区＋原生 PostgreSQL 整体联调及受管进程重启恢复仍需单独完成。
PGlite、合同 fixture 和 JWT 组件测试不能替代这项整体联调。
