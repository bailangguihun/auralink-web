# 社区图文与作品成长

本轮参考 `Hang-666-star/assistant_community` 在 `c664f4e27384d6fa73893194bf21d2f762100141` 的社区流程，采用 ArtLIVE 现有纸色、墨色与平台导航。实现三个相连的使用过程：图文交流、作品点评与修改、主动整理助手内容和成长案例。

## 页面与交互

`/community` 支持自由交流、作品成长、我的帖子/收藏、真实通知、成长案例。搜索、标签、最新/最多点赞、成长状态均调用服务端筛选后分页，不只筛选当前页。筛选保留在 URL，打开详情后返回恢复原筛选与位置。桌面侧栏/内容/编辑三列，移动端优先展示帖子，编辑区可展开。

自由交流可附最多 9 张图片、5 个标签和一幅画廊来源；作品求助还需名称和本人上传的作品图，可描述创作阶段、目标与希望点评的维度。图片用 Bearer 请求取 Blob，再以临时对象 URL 显示；预览按可见区域加载，原图弹窗支持键盘关闭，卸载/换账号释放 URL。画廊原作仍展示当前 Core 核验结果和完整原图，保持既有图片转场。

详情提供作者编辑和二次确认删除、普通评论与回复、维度/观察/修改建议/对应版本的结构化点评。作者采纳后可整理为去重任务、逐项勾选、上传 V2+、主动通知实际参与过点评的同伴复评。前后版本并列展示，修改说明、作者复盘与原点评均可追溯；原点评不在当前分页时，通过授权接口打开来源对话框。

作者完成复盘后，可以从已采纳点评和实际版本说明整理案例草稿。草稿仅作者可见，编辑并确认后才进入成长案例列表，也可撤回。没有模型摘要或伪造的专家认证。取消采纳保留已经整理的任务与案例历史；再次整理不覆盖作者手动编辑的案例。

## 草稿、身份与请求恢复

- 文本与图片元数据草稿按账号存在当前标签页 `sessionStorage`，24 小时过期；刷新可恢复，换账号不显示他人的内容。不保存图片字节或 token，不跨设备同步。
- 每次写入先保存账号、kind 和 requestId。双击锁定，结果不确定时锁住下一次写入，仅 GET 核对回执；刷新不自动重发 POST。上传的成功回执可继续通过媒体元数据找回图片。
- 清空草稿、移除图片或删除帖子不会在浏览器触发物理文件删除。上传前只有本人可读；帖子发布后向已登录用户开放；删除来源后服务端撤销他人的访问。
- 旧 schema 1 服务继续展示原有功能，增强入口按 `/capabilities` 开放，不把旧服务当作已支持上传或成长。

## 与国画助手交接

详情的“带到国画助手分析”只准备一小时内有效、按账号隔离的来源草稿。用户选择或新建会话，再点“导入作品与问题”，主动选择最多四张图。导入会重新读取当前帖子和图片权限，沿用助手的附件上传及回执；WebP 转 PNG 以满足现有附件合同，平台参考通过助手自己的作品查询接口验证。

导入只填草稿，不自动发送模型请求。部分图片上传后发生中断，沿用原助手账本核对，不自动重复生成。已完成的助手回复可点“整理为社区草稿”，载入前明确提示是否替换当前内容，编辑后由用户发布。回复过长时保留草稿并提示精简。助手未启用的环境可以查看交接提示，不视为模型分析已验收。

房间、语音、墨币、自动点评和认证专家匹配另行规划。

## 开发和验证

后端为匹配 Core 仓库中的 `community-service`，需显式应用 002 迁移并配置私有媒体目录；Java 身份接口不变。Next 继续使用服务端 `COMMUNITY_INTERNAL_ORIGIN`，仅 loopback HTTP。具体迁移、最小权限、原图额度和制品平台见 Core `community-service/LEARNING.md` 与 Deploy `docs/community-learning-upgrade.md`。

常规检查：`npm test`、`npm run typecheck`、`npm run lint`、`npm run build`。

可重复浏览器验收使用真实正式构建的 Next/BFF/Node/PGlite，Core 为身份与画廊合同 fixture。安装的 Playwright 与输出目录均可放在仓库外：

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3199 npm run build
export COMMUNITY_SERVICE_ROOT=/path/to/auralink-core-api/community-service
export COMMUNITY_BROWSER_OUTPUT=/path/outside/repos/community-browser
# 可选：PLAYWRIGHT_MODULE 指向已安装的 Playwright ESM 入口；
# COMMUNITY_CHROMIUM_EXECUTABLE 指向可运行的 Chromium。
node tests/community.browser.mjs
node tests/community-learning.browser.mjs
```

前一个验证 schema 1 原有体验；后一个验证双身份图文成长链、上传与发帖回包丢失后仅查询一次提交的结果、跨分页原点评、24 小时草稿恢复/换账号隔离、编辑删除回复及 390px 布局。报告明确保留故障注入。本机原生 PostgreSQL、实际 Core 登录和真实图片联调需另外验证；这些 fixture 测试不证明生产身份、模型、真机或并发性能。

该测试构建包含 loopback fixture API 地址，不能作为生产制品。正式发布必须先核对 Community 的服务、迁移和媒体配置，再部署兼容 Web，不能把 GitHub 合并当成上线。
