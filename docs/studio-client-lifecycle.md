# Studio client execution and history boundary

Studio continues to use the existing Core workflow, creation and authenticated media APIs. No backend revision, cancellation API or initial-submission idempotency key is assumed.

`StudioWorkspace` owns the editor and its source inputs. Every source, structure or parameter change advances an in-memory context epoch and invalidates the current execution association. Saving acknowledges the current definition without restoring the editor or resetting compatible input. Opening another workflow is explicit; opening the same workflow preserves its current draft. “重新载入当前流程” deliberately reloads it and confirms discarding nonempty inputs/edits. A failed load cannot be saved as a new workflow. Save acknowledgement and subsequent list refresh are separate outcomes.

Only a parsed creation POST acknowledgement can establish `AcknowledgedExecution`. It retains that creation ID, workflow ID, the submitted graph/source and the client epoch. Current step display checks the returned creation, source, operation, input/output modalities and music duration. The epoch is a client association, not a durable backend revision. History viewing never establishes a current execution association; it can refresh an already acknowledged matching creation. Invalidating the association does not delete history or cancel a server task.

`StudioSubmissionGate` is synchronously checked by the actual execution handler and reflected in button eligibility. Its WeakMap scope is one `SessionIdentity` object; it survives Studio route remounts within that login generation, but is neither persistent nor shared across tabs. A pending or uncertain POST cannot be bypassed by source edits, saving, a new/open workflow, history refresh or dismissing an error. No automatic retry exists. After a valid ACK, the same editor context also remains guarded until its run has a known terminal status (including pending first detail, active and unknown states); this closes the fast-ACK gap between two rapid clicks. An explicit detail refresh (and history polling) can update only an already-acknowledged matching creation/epoch, allowing recovery after polling stops without associating unrelated history. A deliberate source/definition change may prepare a different run without cancelling the acknowledged one. Only a parsed acknowledgement or a documented pre-admission rejection resolves a dispatched request. Generic 5xx, malformed acknowledgements, network errors and aborted acknowledgements remain uncertain. An empty history page cannot prove rejection. Initial durable Core idempotency remains a separate required design for cross-refresh/tab protection; do not refresh/sign in again to retry an uncertain generation.

Current execution and historical polling use distinct request slots/states. They reconcile their observations using Core’s existing `retryVersion`: an older attempt cannot overwrite a newer one, and a late active/unknown observation cannot regress a known terminal state in the same attempt. A higher retry version remains observable; this is not a workflow revision or automatic retry. Explicit terminal detail confirmation also aborts the obsolete current poll. Post-await guards check session, mount, request identity, abort and editor context as applicable. Aborting a browser request or stopping polling does not cancel backend generation. Media fetches additionally bind their rendered object URLs to session, logical URL and request generation and revoke URLs on replacement/unmount.

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
