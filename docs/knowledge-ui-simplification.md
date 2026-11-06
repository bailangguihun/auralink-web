# Knowledge 页面简化：独立 UI 候选

下文保留早期候选的实现与验收记录。当前全量浏览界面、分页接口及移除折叠说明后的行为见 [知识库全量浏览](knowledge-full-data.md)。

本改动从已合并 Web #14 的 main `82f97a2274552f3ab40370991d0b5213134519fa` 出发，仅调整前端展示。它不替代原无地图版本的后端、发布契约或制品验收，也不继承旧PR的审批。

页头保留标题和缩小后的“知”，移除副文/英文眉标，标签只保留中文。摘要为“作品数”和“作者名称数”，定义移入默认关闭的统计说明。七张画作卡片显示各自实际画作样本、图表及必要图例；聚合、缺失/未公开、匹配和规则定义置于独立“说明”，完整返回数值置于“数据表”。地理组合不是人数，作者名称没有人物消歧；两张情感图保持常显“规则估计”。前12项提示仅在图表实际省略返回项目时出现；服务端截断单独披露，不声称表格包含未返回的数据。

桌面按地域/朝代、分类/风格、全宽意象、两张情感图排列，窄屏单列。说明/数据表采用原生details，默认关闭，保留焦点和Enter/Space操作，触摸区至少44px高。条形图按项目数量留行高；长标签通过原有截断轴和完整数据表查看。浏览器发现的窄屏数值换行已修复。诗词Explorer/View/PoetryChart行为没有改动；API、auth/session generation、媒体错误处理和无地图请求边界保持。

## 实际验证（2026-10-12）

- Node22：`npm ci`、`npm run typecheck`、`npm test`（85项，0失败/跳过）、`npm run lint`、`npm run build`通过。
- `python3 tests/deploy-workflow-fixtures.py --bash bash`：7项通过。没有修改workflow或运行生产发布脚本。
- 16项Playwright/Chromium检查通过；Browser插件未提供，使用已有Playwright1.58.2，不新增浏览器依赖。覆盖实际两tab、统计/图谱、键盘/触摸说明和数据表、1440/390/320px、12/13组截断边界、长标签和40组表格、加载/失败/不可用/空/重试、图谱搜索/分页/邻域/详情/平移缩放。
- 正常流使用实际隔离API：10条合成画作中6eligible、2个作者名称，真实旧诗词快照711节点/609关系；不是生产画作统计。密集长标签、12/13组、错误/空状态是明确的浏览器响应夹具，不写数据库；重试回实际API。零地图/外部网络请求、零意外JS/console错误。
- 原20483和20493预览保持；新预览 `http://127.0.0.1:20503/knowledge`，BUILD_ID `cD5XatP1tBy04TyBzTvMh`，Windows访问200。构建API指向任务专用loopback20500 CORS转发，原样转发既有Java20490读接口及隔离登录；未改Java原CORS或服务配置。此配置是开发预览，不是生产bundle。
- 没有重跑Core/Deploy或10k统计测试；既有业务契约未改。未验证所有浏览器/生产数据组合，不宣称生产验收。Next构建保留原ESLint插件检测提示，lint本身通过。

本地完整日志、源码指纹和截图记录在任务目录 `evidence/ui-simplification/`；复现脚本为Git外 `runtime/browser/ui-simplification.mjs`。PR检查提供最终提交的必需CI结果。

## 评审截图

前四张来自实际隔离API的合成统计；第五张仅为浏览器长标签/密集分类夹具。截图不代表生产数据。

- [桌面概览](knowledge-ui-review/painting-desktop-ui.png)
- [窄屏概览](knowledge-ui-review/painting-mobile-clean-ui.png)
- [展开说明](knowledge-ui-review/painting-explanation-ui.png)
- [全宽意象及成对情感图](knowledge-ui-review/painting-lower-ui.png)
- [密集长标签及数值表夹具](knowledge-ui-review/dense-mobile-ui.png)

发布仍需新PR owner review与正常发布协调；合并main不是部署。此UI没有新的Core/Deploy依赖或配置要求。若需撤销展示调整，按正常前端版本回退即可，不回退数据库/媒体或重新导入数据。
