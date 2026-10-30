# Gallery ordering, filters and painting insights

The Gallery defaults to `sort=daily`. Core supplies `orderDate` using its configured
painting daily timezone; the browser does not choose a date or shuffle individual
pages. Load-more requests send the last returned date and use the returned page number.
The Web app accumulates unique results, closes each batch on complete rows, and
retains the current browse in memory for detail-page returns; see gallery-masonry.md.
When a day changes, Core returns page zero with the new date. Explicit source,
title, author and dynasty sorting retain their meaning. Daily recommendation is a
separate endpoint and retains its algorithm.

The filter form has its own stacking order above painting cards. At widths up to
900px, expanded filters take space in normal document flow; at up to 680px, fields
use one column. The desktop popup must remain clickable where it overlaps cards.

Painting details read existing Guide and current-user Critic results on entry.
Current Guide 404 falls back to the separate history GET; historical output is
clearly marked as not verified against current painting data. Guide creation and
Critic submission only occur after an explicit click. Refresh, task polling and
error recovery never submit generation requests. Double-clicks share a submission
guard, and requests/results belong to a single artwork and login generation.
Unknown task states stop polling; timed-out submissions require a result read
before any possible manual resubmission. Existing Critic reports remain readable
when new submissions are unavailable.

Critic reports use the deployed AI `authoritative_four` / `requested_four`
contracts, with four qualitative dimensions and no invented score. Empty strings
in valid Critic text lists are omitted; malformed types are rejected. Guide audio
is not exposed: the existing backend audio route is still unimplemented.

## Validation and rollout

- Run `npm ci`, `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`.
- Exercise the actual Gallery at 1440px and 390px, plus 680/681 and 900/901
  breakpoints: popup hit targets, keyboard focus, no clipping, reset, paging and
  a server-simulated midnight reset.
- Mock existing, missing, historical, queued, succeeded, unavailable and failed
  insight responses. Count POST requests: none on entry/refresh, one per explicit
  submission; verify late responses cannot reach another login generation.
- Mock tests do not prove that production Guide/Critic providers are configured
  or healthy. Before activation, inspect the installed service/config identities
  and authenticated capability/current/history reads in the server environment.
  Do not print private configuration or use a generation POST as a health check.
- Deploy the compatible Core daily-order change before this Web version. The
  Core feature requires the PostgreSQL catalog; the legacy SQLite path explicitly
  rejects `daily`. Run the new PostgreSQL ordering tests and the related catalog
  regression suite on an isolated database before promotion. No migration or
  catalog reimport is required.
- Use existing reviewed main-to-release promotion and deployment controller
  procedures. A main PR merge is not a production deployment. Real provider
  acceptance remains a separate, explicitly bounded action.

For rollback, revert Web first; only then revert the daily-order Core extension.
The previous Web's `source` query remains compatible with the new Core.
