# Mandate v0.1 Build Ledger

This is the source of truth for the original MVP plan versus what is actually
implemented. A checked item means the behavior exists in the repository and
has an automated or manual verification path. It does **not** imply that a
provider has approved production use.

Status key: `[x]` complete, `[~]` partial, `[ ]` not implemented, `[!]` blocked
by an external production dependency.

Visual cue: `✅` integrated and verified, `🟡` partial, `🔴` not integrated,
`⛔` externally blocked.

## User-visible integration map

| Surface | State | Source of truth | Remaining gap |
|---|---:|---|---|
| First-run onboarding | ✅ | `/v1/setup/status`, `/v1/setup`, encrypted DB | Native installer acceptance |
| Empty Overview | ✅ | Account-scoped providers, positions, agents, journal | None for local zero-state |
| Account balances | 🟡 | Exact positions from `/v1/dashboard` | Valuation feed; no synthetic cross-asset total |
| Activity and ledger | ✅ | Immutable journal transactions and entries | Provider reconciliation workers |
| Agent grants | ✅ | Grants, credential hashes, runtime install records | Credential rotation UI |
| Capabilities | 🟡 | Provider catalog and account-scoped connections | External operation dispatch |
| System | 🟡 | Daemon diagnostics endpoint | Recovery export and scheduled reconciliation |
| Demo preview | ✅ | Explicit `web/src/lib/fixtures.ts` only | Never used as an error fallback |
| Coinbase operations | 🔴 | Adapter credential validation only | Persistent dispatch and reconciliation |
| Stripe operations | 🔴 | Adapter credential validation only | Persistent dispatch and reconciliation |
| Lithic operations | 🔴 | Adapter credential validation only | Secret-safe dispatch and settlement |
| Hermes | ✅ | Supported Hermes CLI plus scoped MCP probe | None on the reference Mac |
| OpenClaw | ⛔ | Connector path implemented | Runtime unavailable for acceptance |

`estimated_usd_atomic = null` renders as no valuation. Exact USD and USDC
positions remain separate. Network or authentication failure shows an
offline/locked gate with no sample financial values. Fixture data is reachable
only through an explicit demo-preview action.

## Product surfaces

- [x] Rust `mandated` daemon bound to `127.0.0.1:7741`
- [x] Unix-domain socket with `0600` permissions
- [x] Deterministic Rust CLI with JSON output
- [x] TypeScript MCP adapter over the daemon API
- [~] Local dashboard
  - [x] Responsive visual system and all primary views
  - [x] User-zero identity, principal, and first-account setup
  - [x] Genuine empty state with optional, explicitly selected demo routes
  - [x] Multiple-account creation, switching, and scoped dashboard data
  - [x] Explicit preview versus connected-runtime labeling
  - [x] Authenticated daemon-backed dashboard aggregate
  - [x] Functional deterministic test-route operation forms
  - [~] Provider configuration (demo routes plus Keychain-backed external credential validation work; operation dispatch pending)
  - [x] Agent connection and grant management (create/edit/revoke, capability allowlist, authority mode, runtime status)
  - [x] Persistent account setup/readiness checklist
  - [x] Live ledger-entry inspection
- [ ] Native macOS `.app`, menu-bar shell, or DMG (deferred from v0.1)
- [~] Homebrew/LaunchAgent packaging (formula skeleton exists; clean-Mac install not accepted)

## Core runtime and security

- [x] Transport-neutral application service used by daemon routes
- [x] SQLCipher database and encryption-at-rest test
- [x] macOS Keychain-wrapped database key
- [x] Principal, economic account, and scoped agent-grant model
- [x] Multiple economic accounts with per-account provider connections
- [x] Separate administrator and agent credentials
- [x] Credential hashes stored in SQLite
- [x] Capability and account authorization checks
- [x] Exact atomic-integer amount serialization
- [x] Immutable balanced double-entry journal
- [x] Reservations and release on payment revocation
- [x] Operation idempotency
- [x] Provider-event deduplication
- [x] Durable SQLite event outbox and SSE route
- [~] Recovery package (documentation/UI concept; export/restore implementation pending)
- [~] Browser security
  - [x] Loopback-only bind, Host checks, and Origin checks
  - [x] One-time dashboard URL and HttpOnly admin session
  - [x] CSRF token enforcement for dashboard mutations
- [ ] Scheduled incremental and full reconciliation workers

## Canonical economic API

- [x] Balance
- [x] Stablecoin receive endpoint
- [x] Invoice creation
- [x] Checkout creation
- [x] Payment-session creation, status, and revocation
- [x] Transfer creation
- [x] Refund operation
- [x] Transaction history with ledger entries
- [x] Structured error shape
- [x] CLI/API/MCP request-contract tests
- [~] Generated OpenAPI/JSON Schema (JSON Schema exists; generated clients/OpenAPI pending)

## Provider framework

- [x] Versioned JSON-RPC-over-stdio TypeScript provider SDK
- [x] Provider manifests and capability declarations
- [x] Redaction helpers and conformance harness
- [x] Coinbase CDP adapter with mock/sandbox paths
- [x] Stripe Revenue adapter with mock/test-mode paths
- [x] Lithic Card adapter with mock/sandbox paths and sensitive-response marking
- [~] Rust daemon provider-process host (isolated validation/health subprocesses work; persistent supervision and execution pending)
- [ ] Daemon routing into provider subprocesses
- [ ] Polling cursors and scheduled reconciliation integration
- [ ] Bundled-plugin signature verification
- [!] Live Coinbase activation requires credentials and policy approval
- [!] Live Stripe activation requires credentials and account readiness
- [!] Live Lithic activation requires program approval, funding, and PCI readiness
- [!] Automated Coinbase/Stripe to Lithic funding rail is not contracted

## Agent integrations

- [x] Scoped credential creation and `0600` credential files
- [x] OpenClaw skill/integration assets
- [x] Hermes MCP configuration asset
- [x] Hermes detected and Mandate MCP registered/tested through the supported Hermes CLI on the reference Mac
- [~] `mandate agents connect openclaw` creates the Mandate identity and receipt
- [~] `mandate agents connect hermes` creates the Mandate identity and receipt
- [x] Runtime binary detection helper
- [x] Runtime-native Hermes MCP installation through the supported CLI
- [~] Runtime-native OpenClaw installation path implemented; acceptance awaits an installed OpenClaw runtime
- [ ] Actual OpenClaw execution-environment balance probe
- [x] Actual Hermes MCP discovery plus scoped MCP balance smoke test in an isolated runtime home
- [~] UI-driven agent flows (create/edit/install/probe/revoke work; credential rotation pending)

## Quality and release

- [x] Rust formatting and Clippy with warnings denied
- [x] Rust core/daemon test suite
- [x] TypeScript typecheck, unit tests, and production builds
- [x] Manual daemon → CLI → ledger smoke test
- [x] Manual daemon → MCP smoke test over TCP and Unix socket
- [x] Browser sandbox payment → reservation → balanced-ledger inspection smoke test
- [x] Fresh-user setup → empty account → category provider setup → second-account isolation browser smoke test
- [x] In-app Browser and Chrome verification of capabilities, profile/account menus, Hermes discovery, and diagnostics layout
- [x] Initial browser visual QA for light/dark/reduced-motion
- [x] Category-specific provider dialogs and explicit disconnected states
- [ ] Golden REST/CLI/MCP parity suite covering every failure state
- [ ] Playwright end-to-end suite for all dashboard mutations
- [ ] Axe and screen-reader release audit
- [ ] Clean-Mac install/reboot/upgrade/backup/restore/uninstall acceptance
- [ ] Real three-provider sandbox proof using supplied credentials

## Current honest milestone

The repository now proves the encrypted local economic core, canonical CLI/MCP
operations, accounting invariants, provider adapter contracts, and an
authenticated daemon-backed console with deterministic test routes. Preview is
only the unauthenticated fixture view; Mandate itself has one local runtime.
The next acceptance milestone is provider-backed operation dispatch and
reconciliation with supplied Coinbase, Stripe, and Lithic sandbox credentials,
plus an OpenClaw probe on a Mac where OpenClaw is installed.

The user-facing definition of done and remaining release gates are maintained
in [`COMPLETION_BRIEF.md`](COMPLETION_BRIEF.md).
