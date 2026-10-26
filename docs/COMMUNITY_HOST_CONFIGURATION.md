# Community server-only host setting

The observed production c5ea launcher uses `env -i`. This change retains that
accepted launcher and all assistant/loading UI. The Community API route alone
can read one private server configuration file:

`/root/autodl-tmp/auralink-web-deploy/runtime/community-origin.json`

Canonical format (newline at end):

```json
{"COMMUNITY_INTERNAL_ORIGIN":"http://127.0.0.1:19086"}
```

The reviewed Deploy host adapter must create it only after actual compatible
Core and owned Community readiness, under the existing deployment lease and
the concrete approved plan. This documentation is not permission to create
the file or deploy. Existing explicit server environment configuration remains
supported for isolated fixtures. There is no NEXT_PUBLIC variable, browser
configuration copy, database credential or authentication secret in this file.

Reads validate canonical absolute path, non-writable/non-symlink ancestors,
root:root mode 0600, one link, regular file, bounded size, canonical JSON and a
loopback HTTP origin. Missing means the route is not configured; malformed or
unsafe configuration returns a distinct scoped 503. No persistent cache or
write/generation retry was introduced. A locally configured environment takes
precedence; production's unchanged `env -i` leaves it absent.

Validation: a dedicated private-file test covers absent/valid/unsafe mode,
hardlink/symlink, extra/invalid/public keys, invalid origin and changed format.
The production build's server bundle contains the loader; browser chunks do
not contain the host path. Existing Community protocol tests and accepted UI
evidence remain applicable. No production upload, post, model or VMM action.

Web release pushes deploy automatically after the existing production
environment approval. Keep main-to-release promotion pending until backend
compatibility and the concrete Web deployment scope are authorized. Core #34
and Deploy #41 are merged source, not proof of installed Community service.
