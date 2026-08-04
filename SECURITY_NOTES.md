# Security notes

The historical frontend source contained third-party API credentials
directly in `src/config/index.js`.

Before this repository was archived:

- one hard-coded API key was removed;
- twelve hard-coded token occurrences were removed;
- four distinct credential values were identified in total.

The historical credentials must be considered exposed and should be
revoked or rotated.

Secrets must not be placed in browser-side JavaScript or in environment
variables beginning with `NEXT_PUBLIC_`.

Third-party authenticated requests should be routed through the Java
backend, an AI backend service, or a Next.js server-side Route Handler.
