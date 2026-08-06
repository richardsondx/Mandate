# Mandate dashboard

Local React dashboard for the Mandate daemon. The development server listens only on `127.0.0.1` and proxies `/v1` to `http://127.0.0.1:7741`.

```bash
pnpm install
pnpm --dir web dev
```

The UI requests `GET /v1/dashboard` and subscribes to `/v1/events`. When the daemon is unavailable it switches to clearly-labelled preview fixtures, so interface work remains usable without inventing live financial state.

Useful checks:

```bash
npm test
npm run build
```

On an uninitialized daemon, the dashboard performs the real first-run setup for
the administrator, principal, and first economic account. Once initialized, use
`mandate dashboard` to establish an authenticated browser session. Preview data
is always explicit and is never written into the economic account.
