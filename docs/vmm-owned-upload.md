# 国画上传直接生成音乐

“国画输入 → 上传国画 → 生成音乐”在 Core 报告 `CATALOG_OR_OWNED_UPLOAD_PAINTING_SINGLE_TRANSFORM_ONLY` 且音乐可执行时可用。已有上传 API 使用 PAINTING 语义；提交只有 `{modality:"PAINTING",assetId}`，目录选择只有 `{modality:"PAINTING",paintingId}`。切换输入清理旧源与已确认编辑器输出；历史结果保留。生成画作后接音乐仍只能保存草稿。时长保持 3–30 秒。

旧 Core 未报告上传支持时按钮继续拒绝上传，避免只放开前端而后端不支持。私有媒体仍经认证读取；刷新/重新进入仅恢复结果，不重复业务提交。

本地构建页面的 `tests/studio-lifecycle.browser.mjs` 新增上传/3秒结果/刷新、目录和上传切换、旧 Core 拒绝三类合成 API 场景。所有业务请求在 Playwright 内拦截；CPU WAV 是测试数据，不是生产生成证据。

必须协调 Core、Deploy managed VMM wrapper 和本 Web 发布。现有 Core successor 发布器不支持当前 successor 再升级，该受控绑定缺口须先单独审查解决。release 合并会自动触发 Web 生产部署，所以仅在具体生产计划获批、兼容服务已核实后推广；main PR/CI不授权生产部署。新启动和独立 OPEN 批准仍另行取得，用户自行手动测试，不自动生成样本。
