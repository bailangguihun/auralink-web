# Knowledge / Database

For the current full-data UI and paginated metric API, see
[知识库全量浏览](knowledge-full-data.md). The sections below retain the initial
release contract; the old disclosure/table UI has been superseded.

`/knowledge` contains Painting Statistics and Poetry Graph within the existing
AppShell, ProtectedRoute and session provider. It needs the matching Core API
business change; the currently deployed Core does not provide these endpoints.
The approved first release is **no map, geography retained**. Geographic statistics
remain a bar chart and a complete returned-value table. No map panel, map request,
map retry/error state, map renderer or external/CDN map fallback is included.

## API and state behavior

All requests use the existing `apiRequest` transport (Bearer token, JSON Accept,
typed HTTP errors) and the configured public API base URL:

| GET | Response |
| --- | --- |
| `/api/v1/knowledge/painting-statistics` | schemaVersion 1; Gallery-displayable population, distinct author-name count and seven bounded metrics |
| `/api/v1/knowledge/poetry-graph` | schemaVersion 1; validated nodes, links, snapshot hashes and entity/relation summaries |

`lib/knowledge-contracts.ts` defines and validates these response contracts.
Statistics have per-metric field coverage, missing-or-restricted counts,
unmatched samples, a unit, method and truncation flag. Missing/private values
are not inferred client-side. A chart uses only aggregates returned by Core;
the browser does not download all painting details.

The page distinguishes loading, empty results, unsupported/missing configuration
(404/503), transport/contract failures and per-field unavailable states. Failure
panels offer retry. Old Core is compatible with the rest of the application;
the Knowledge page reports unavailable until the matching API is published.
The no-map frontend never requests `/api/v1/knowledge/china-map`. Core explicitly
disables that endpoint in the selected no-map runtime mode, including when an old
private map file remains on disk. Selected configuration:
`auralink.knowledge.map-enabled=false` (environment:
`AURALINK_KNOWLEDGE_MAP_ENABLED=false`). An authenticated map request returns
503 `KNOWLEDGE_SNAPSHOT_UNAVAILABLE`; anonymous requests still require
authentication. Neither painting statistics nor the poetry
resource depends on a map asset or map configuration.

Each asynchronous result captures the current session identity and is discarded
after an identity change or cancellation. A stale 401 cannot sign out a newer
session. No authentication or media behavior is changed elsewhere.

## Chart meaning

The population is the exact Gallery-displayable population, not all ingested
records. Author counts mean normalized distinct public **names**, not verified
people. Null/unknown/blank values and literal `0` (pending verification) are
excluded according to the Core contract. Per-chart methods describe multi-value
splitting, geography matching and keyword rules. Geography counts distinct
normalized **[author name, birthplace text] pairs** per matched province, not
identity-disambiguated people or paintings. Its field-coverage denominator still
counts paintings with both required public fields. Repeated pairs count once;
different birthplace descriptions remain separate pairs. Unknown/ambiguous
locations remain in the documented unmatched painting sample. The bar displays
the top 12 returned groups; the numeric table exposes all returned groups.
Birthplace does not identify where an artwork was produced.

Category charts count classifications; there is no popularity claim. Sentiment
charts are explicitly rule-based estimates, not model analysis or objective
emotion scores. The dynasty rule chart uses a fixed 0–100 scale, orders known
dynasties, and preserves unrecognized labels at the end. A connecting line does
not establish a historical trend. Bounded lists and display limits are disclosed;
all returned numeric values can be viewed in accessible tables.
Donut angles stay proportional to the returned counts; no minimum sector angle
is imposed, including when all 406 relation-label groups are displayed. Small
groups remain accessible through the numeric table and tooltips.

## Poetry runtime data and deferred map feature

No real graph snapshot, map artifact, production CSV or database dump is stored
in this Git repository or its `public/` directory. Core serves the externally
configured, validated legacy poetry graph and statistics files. Both exact
SHA-256 identities remain required for release validation. See Core
`docs/knowledge-*` for locations, checksums, limits and configuration requirements.
Frontend changes alone cannot provision these files. The map is excluded from
this release asset set and must neither be packaged nor served. The prior map
redistribution question is deferred to a future explicitly approved map release.

The poetry graph is an existing file-backed snapshot. PostgreSQL persistence,
upstream extraction accuracy, recovery of the missing GraphML and automatic
inclusion of new painting records are not claimed. Original entity and relation
text is retained. Search matches name/category; category filtering is exact.
Relationships use neutral connecting lines: the available JSON does not establish
graph directionality, so source/target storage order is not rendered as arrows.
Pagination resets on a filter change and clamps to valid bounds. Selecting a
node highlights its one-hop neighborhood. “聚焦一跳邻域” updates the graph's
supported series data option to display that neighborhood; no ECharts internal
models or undocumented coordinate lookups are used. Neighbor focus may show
nodes outside the current search so the one-hop relationship remains complete.

ECharts 6.1.0 is pinned, imported modularly and loaded only with Knowledge chart
views. Tooltips use the canvas rich-text renderer, never HTML from snapshot data.
Descriptions and card text are rendered as React text. Entity cards and relation
lists provide keyboard access to the same detail panels as the canvas.

## Local verification and release boundary

Use Node.js 22 and project-local dependencies:

```sh
npm ci
npm run typecheck
npm test
npm run lint
npm run build
python3 tests/deploy-workflow-fixtures.py --bash bash
```

The unit suite includes only small synthetic fixtures. Real-data browser checks
must use an isolated Core instance and test database with separately provided
runtime poetry graph/statistics files only. A separate candidate build/preview
is required while the historical map-enabled preview is kept running; do not
label its screenshots as evidence for the new no-map candidate. Such checks are
not production acceptance.

Coordinate this Web PR with the Core statistics/snapshot API PR. Publish the
additive Core API plus external runtime assets first through the approved
business-change release process, then Web. The reviewed release order is V1
controller installation → explicit V2 business-upgrade contract → Core → c5ea
Web. The equivalent-repackaging path cannot carry the new endpoints; CI success
does not authorize production release. Keep c5ea/R25 lifecycle coordination.
Frontend rollback requires no data rollback;
Core rollback makes Knowledge unavailable and must retain existing huaniao data.
