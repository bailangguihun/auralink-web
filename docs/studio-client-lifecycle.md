# Studio client execution and history boundary

Studio uses the existing Core workflow, creation and authenticated media APIs, plus the owner-scoped history deletion endpoint described below. No backend revision, cancellation API or initial-submission idempotency key is assumed.

`StudioWorkspace` owns the editor and its source inputs. Every source, structure or parameter change advances an in-memory context epoch and invalidates the current execution association. Saving acknowledges the current definition without restoring the editor or resetting compatible input. Opening another workflow is explicit; opening the same workflow preserves its current draft. “重新载入当前流程” deliberately reloads it and confirms discarding nonempty inputs/edits. A failed load cannot be saved as a new workflow. Save acknowledgement and subsequent list refresh are separate outcomes.

Only a parsed creation POST acknowledgement can establish `AcknowledgedExecution`. It retains that creation ID, workflow ID, the submitted graph/source and the client epoch. Current step display checks the returned creation, source, operation, input/output modalities and music duration. The epoch is a client association, not a durable backend revision. History viewing never establishes a current execution association; it can refresh an already acknowledged matching creation. Invalidating the association does not delete history or cancel a server task.

`StudioSubmissionGate` is synchronously checked by the actual execution handler and reflected in button eligibility. Its WeakMap scope is one `SessionIdentity` object; it survives Studio route remounts within that login generation, but is neither persistent nor shared across tabs. A pending or uncertain POST cannot be bypassed by source edits, saving, a new/open workflow, history refresh or dismissing an error. No automatic retry exists. After a valid ACK, the same editor context also remains guarded until its run has a known terminal status (including pending first detail, active and unknown states); this closes the fast-ACK gap between two rapid clicks. An explicit detail refresh (and history polling) can update only an already-acknowledged matching creation/epoch, allowing recovery after polling stops without associating unrelated history. A deliberate source/definition change may prepare a different run without cancelling the acknowledged one. Only a parsed acknowledgement or a documented pre-admission rejection resolves a dispatched request. Generic 5xx, malformed acknowledgements, network errors and aborted acknowledgements remain uncertain. An empty history page cannot prove rejection. Initial durable Core idempotency remains a separate required design for cross-refresh/tab protection; do not refresh/sign in again to retry an uncertain generation.

Current execution and historical polling use distinct request slots/states. Editing invalidates the canvas association but keeps the accepted creation card polling; opening that same active creation reuses the existing polling channel. They reconcile their observations using Core’s existing `retryVersion`: an older attempt cannot overwrite a newer one, and a late active/unknown observation cannot regress a known terminal state in the same attempt. A higher retry version remains observable; this is not a workflow revision or automatic retry. Explicit terminal detail confirmation also aborts the obsolete current poll. Post-await guards check session, mount, request identity, abort and editor context as applicable. Aborting a browser request or stopping polling does not cancel backend generation. Media fetches additionally bind their rendered object URLs to session, logical URL and request generation and revoke URLs on replacement/unmount.

Music controls remain editable beside a valid current audio result. Their label describes the next execution; historical results retain the original requested duration. Direct single-step gallery painting to music remains the supported execution scope (3–30 integer seconds, default 10). Upload/generated-painting music chains and video execution remain unavailable; valid draft editing is preserved. Configuration capability is not proof of provider liveness.

## Validation

Run the standard `npm run typecheck`, `npm test`, `npm run lint`, `npm run build` and the repository's deployment-shell fixtures. `tests/studio-execution-context.test.ts` covers the identity/gate contract; `tests/creation-polling.test.ts` includes late-after-abort/deadline regressions. These helper tests do not substitute for the real-component browser suite:

```bash
STUDIO_WEB_URL=http://127.0.0.1:20713 \
STUDIO_API_URL=http://127.0.0.1:20714 \
PLAYWRIGHT_MODULE=/path/to/existing/playwright/index.mjs \
STUDIO_BROWSER_OUTPUT=/path/outside/repository/evidence \
node tests/studio-lifecycle.browser.mjs
```

The browser suite requires the production-mode candidate built for that loopback API origin. Every API is intercepted with intentional synthetic fixtures, including a duration-matching PCM WAV. It is not a provider, production, database or Windows human acceptance test. The standalone synthetic preview backend and owned-process helper are stage-only tooling, not a production service or release launcher.

Separate Core follow-ups: durable initial admission idempotency; catalog visibility/current-revision eligibility; consuming persisted input snapshots consistently for execution and historical display. This patch does not modify or migrate those contracts.

## 即时作品卡片与历史删除

确认命名后立即建立仅存在于当前页面内存的待提交卡片，包含名称、输入快照和目标步骤。
保存流程、上传和创作提交仍依赖各自的真实返回值，状态分别为准备中、上传中、提交中。
只有提交接口的有效 receipt 能把临时记录关联到 creationId；列表中的相似名称不能代替 receipt。
提交返回前的卡片不代表数据库已持久化，刷新后以服务端记录为准。写请求不会自动重试。
流程准备和提交各有 60 秒请求上限，上传为 120 秒；已派发但未确认的写请求保留原 uncertain 保护。

收到 receipt 后，卡片按同一 ID 更新，展示真实步骤状态及已完成输出；列表失败不能移除当前卡片。
修改编辑器只解除旧执行与画布的关联，旧作品仍在卡片更新。账号退出和卸载清理私有状态及媒体 URL。
状态条位于设计器与“我的作品”之间；“查看本次作品”读取对应详情并定位，轮询不会抢滚动位置。

常规历史每页 6 条。尚无 creationId 的临时卡片占第一页一格，此时服务端分页暂取 5 条，
后续页按同样页长读取，避免第六条历史被截断且无法翻到。receipt 确认后恢复每页 6 条，并按 ID 去重。
新命名回到第一页，后续用户主动翻页仍有效。骨架为 6 个位置。

删除接口为 `DELETE /api/v1/me/creations/{creationId}`。成功 204，刷新后仍保持删除；
仅已结束的本人记录可删除，运行中返回 409。按钮与查看详情为独立键盘目标，并先确认名称。
客户端等服务器确认后移除，拦截迟到列表／详情响应；失败保留记录。删空末页自动回到有效页。
这是删除历史记录，不是任务取消或物理媒体清理。

发布依赖：先应用 Core 的 PostgreSQL V017（SQLite 开发环境为 V6），再更新 Core，最后更新 Web。
旧 Core 没有该 DELETE 接口。不得仅部署 Web 就宣称删除功能已经上线。

浏览器回归包含即时卡片、慢保存／上传、列表失败、分页与当前记录去重、删除确认／失败／刷新恢复、
末页回退、迟到响应，以及桌面 1440px 和手机 390px。所有生成和媒体均为隔离夹具。
