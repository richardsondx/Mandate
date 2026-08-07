<div align="center">

# Mandate

**One economy. Any provider.**

<p>
  <a href="https://github.com/richardsondx/mandate/stargazers"><img src="https://img.shields.io/github/stars/richardsondx/mandate?style=flat-square&color=DAA520" alt="GitHub Stars"></a>
  <a href="https://github.com/richardsondx/mandate/watchers"><img src="https://img.shields.io/github/watchers/richardsondx/mandate?style=flat-square" alt="GitHub Watchers"></a>
  <a href="https://github.com/richardsondx/mandate/network/members"><img src="https://img.shields.io/github/forks/richardsondx/mandate?style=flat-square" alt="GitHub Forks"></a>
  <a href="https://x.com/richardsondx"><img src="https://img.shields.io/badge/X-Follow-000000?style=flat-square&logo=x&logoColor=white" alt="X Follow"></a>
</p>

<p>
  <a href="README.md">English</a> | <a href="README-ZH.md">中文文档</a>
</p>

</div>

Mandate is an open-source economic layer for AI agents.

It gives an agent one account to receive revenue, hold funds, move money between financial systems, and spend through the providers you choose.

Stripe, wallets, banks, card issuers, stablecoins, and future payment systems stay interchangeable underneath.

The agent sees one economy instead of a collection of disconnected financial accounts.

This repository contains:

- `mandated` Rust daemon and encrypted double-entry ledger
- `mandate` deterministic CLI
- localhost React dashboard
- stdio MCP server
- out-of-process TypeScript provider protocol
- Coinbase CDP Wallet, Stripe Revenue, and Lithic Card providers
- OpenClaw skill and Hermes MCP integration assets

Mandate does not hold or issue money itself. It connects the financial providers you choose and gives your agents one consistent way to use them.

## Overview

AI agents can already receive money, hold balances, and make payments. The problem is that those capabilities often live in separate financial systems.

An agent might earn revenue through one provider, hold funds in another, and spend through a third. Without a way to connect those systems, a human still has to move money between them, and the agent stops being truly autonomous.

Mandate gives agents one economic account across those providers, so money earned in one place can become usable purchasing power somewhere else without human intervention.

## Economic Autonomy

<p align="center">
  <img src="docs/assets/economic-autonomy.png" alt="Mandate — Earn, hold, move, spend, and reinvest across providers as one continuous economy" width="920">
</p>

A useful test for economic autonomy is simple: give an AI agent its first $100, then step away.

Can it earn revenue, pay for the tools and services it needs, renew subscriptions, and reinvest what it earns without asking a human to move money or approve every transaction?

That is the difference between spending access and economic autonomy.

Mandate is built for the latter: a continuous loop where an agent can earn, hold, move, spend, and reuse its own money to keep operating and growing.

An allowance eventually runs out. An economy can sustain itself.

## Screenshots

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <strong>Dashboard Overview</strong><br/>
      <img src="docs/assets/dashboard-overview.png" alt="Mandate Dashboard — Economic continuity at a glance" width="100%">
    </td>
    <td width="50%" align="center">
      <strong>Balances & Liquidity</strong><br/>
      <img src="docs/assets/balances-liquidity.png" alt="Balances & Liquidity — Real-time balances and automated replenishment routes" width="100%">
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <strong>Normalized Activity Log</strong><br/>
      <img src="docs/assets/economic-activity.png" alt="Economic Activity — Unified ledger log across different rails" width="100%">
    </td>
    <td width="50%" align="center">
      <strong>Capability Reference</strong><br/>
      <img src="docs/assets/capability-reference.png" alt="Capability Reference — Standardized interface for human-intent verification" width="100%">
    </td>
  </tr>
</table>

*The Mandate dashboard provides full economic visibility: a consolidated overview, granular account and liquidity route statuses, normalized ledger activity logs, and a standard capability reference guide.*

## Project status

See the [build ledger](docs/BUILD_LEDGER.md) for implemented scope and the [completion brief](docs/COMPLETION_BRIEF.md) for the definition of done.

## Quick start

Requirements:

- macOS 13 or newer for the supported v0.1 installation path
- Xcode Command Line Tools
- Node.js 22 or newer and pnpm 10
- Rust stable (installed by the bootstrap script when missing)

### One command from a fresh clone

After cloning, run the launcher. It installs nothing system-wide, builds the
daemon and dashboard the first time, starts `mandated`, and opens the console.

```bash
./scripts/start.sh
```

The dashboard opens at `http://127.0.0.1:7741/`. Stop the daemon with Ctrl-C.

### Install the desktop app from a release

Download `Mandate-<version>.dmg` from the [latest release](https://github.com/richardsondx/Mandate/releases) and open it. Double-click **Mandate** directly inside the disk image (or drag it into `/Applications`)—it installs itself to `/Applications` and launches.

Mandate runs as a menu-bar resident app managing the local `mandated` daemon and hosting the dashboard in a native window (`1380×880`).

* **Open Dashboard Window:** `⌘O` (or click **Open Dashboard** from the menu bar)
* **Open in Default Browser:** `⌘B` (opens `http://127.0.0.1:7741/` in Safari/Chrome)
* **Daemon Controls & Logs:** Use the **Daemon** top-level menu to start, stop, restart, or view daemon logs (`⌘L`).

Or install from the command line (optionally with a background LaunchAgent so the daemon starts on login):

```bash
curl -fsSL https://raw.githubusercontent.com/richardsondx/Mandate/main/scripts/install.sh | sh
curl -fsSL https://raw.githubusercontent.com/richardsondx/Mandate/main/scripts/install.sh | sh -s -- --launch-agent
```

### Build the app and disk image yourself

```bash
./scripts/build-app.sh   # produces dist/Mandate.app
./scripts/build-dmg.sh   # produces dist/Mandate-<version>.dmg
```

### From source (manual)

Install the build dependencies on macOS:

```bash
./scripts/bootstrap-macos.sh
```

Then build and test:

```bash
pnpm install
pnpm check
cargo test --workspace
```

Start the daemon:

```bash
cargo run -p mandated
```

Build the frontend:

```bash
npm --prefix web run build
```

On the first run, open `http://127.0.0.1:7741/`. Mandate asks for the
name of your first economic account. Choose **Start empty** for the real
zero-state setup or **Add demo routes** for an explicit deterministic
demonstration. Browser setup is required only once.

To repeat the genuine first-run experience during development, use the guarded
reset helper. It stops only a process identified as `mandated`, moves the full
local data directory into a timestamped backup, and removes the obsolete admin
login credential. It retains the database encryption key so the backup remains
recoverable.

```bash
./scripts/reset-local-instance.sh --confirm-reset
cargo run -p mandated
```

The CLI remains available for headless initialization:

```bash
cargo run -p mandate -- init --name "Studio"
```

On subsequent runs, start the daemon and open an authenticated console from a
second terminal:

```bash
cargo run -p mandate -- dashboard
```

After initialization, do not use the bare localhost URL as the normal entry
point. A direct visit has no administrator session and shows a locked access
screen. `mandate dashboard` creates a short-lived login URL and opens the same
site with authenticated local data and working demo-route operations. Preview
is an explicit choice, never the user's account.

Mandate stores the administrator credential in macOS Keychain. Set the account
identifier returned by setup, then the CLI can use the Keychain credential
without putting it in shell history:

```bash
export MANDATE_ACCOUNT_ID='acct_...'
cargo run -p mandate -- balance --json
cargo run -p mandate -- receive stablecoin --json
cargo run -p mandate -- pay create --amount 2200 --currency USD --json
```

Amounts are exact atomic-unit strings: `2200` USD means `$22.00`, while
`22000000` USDC means `22 USDC` at six decimals.

Run the dashboard with Vite only when developing frontend code:

```bash
pnpm dev:web
```

For a smoother loop, run the daemon and Vite together with one command and open
`http://127.0.0.1:5173/` (Vite hot-reloads frontend edits and proxies `/v1` to
the daemon). Ctrl-C stops both cleanly:

```bash
pnpm dev:dashboard
```

If you instead want the single-port daemon at `:7741` to stay current without a
manual rebuild, keep a watched build running in another terminal:

```bash
pnpm build:web:watch
```

Open the authenticated dashboard with `cargo run -p mandate -- dashboard` (or
`mandate dashboard` after installation). The CLI requests a 60-second,
single-use login URL; the daemon exchanges it for an HttpOnly local session.
Directly opening `http://127.0.0.1:7741/` without that session intentionally
shows the locked access screen.

## Preview, test routes, and provider live mode

There is one Mandate application—not a separate Mandate-wide sandbox and live
app. Before initialization, `http://127.0.0.1:7741/` is the real first-run
setup. After initialization, `mandate dashboard` opens the authenticated local
runtime. **Preview** fixture data is available only through an explicit demo
action and is never mixed into an economic account.

Provider environments are independent. Deterministic demo routes exercise the
ledger, reservations, CLI, MCP, and UI safely. Coinbase, Stripe, and Lithic
credential forms now launch the bundled adapter, validate access, and store the
configuration in Keychain. Until provider-backed operation dispatch and
reconciliation are accepted, that state is labeled **Credentials verified**;
it does not enable money movement. Mandate never combines test and live
balances into one.

The regular Capabilities setup connects provider Test/Sandbox or Live
credentials; it does not offer a one-click demo balance. Illustrative demo data
belongs to the explicit preview, while deterministic demo routes remain
available to automated acceptance tests and developer tooling.

Live-provider activation remains unavailable until operation dispatch,
reconciliation, and each gate in `docs/PROVIDER_ACTIVATION.md` have passed.

Track exact implementation status in [the v0.1 build ledger](docs/BUILD_LEDGER.md).
The user-usable acceptance boundary is in [the completion brief](docs/COMPLETION_BRIEF.md).

## Accounts and agents

A single local operator owns one or more economic accounts. Each account has
independent provider connections, balances, reservations, journal entries,
and grants. Multiple OpenClaw, Hermes, or custom agents may share one account,
but every agent uses its own scoped credential. Create separate accounts
whenever funds, provider routes, permissions, or audit history should not be
shared.

The bottom-left **LOCAL OPERATOR** menu is the human operator for this local
instance; it is not another economic account. Create and switch economic
accounts only from the account switcher at the top of the sidebar.

## Agent interfaces

The CLI is the primary OpenClaw interface. Every mutation should include a
stable idempotency key and every agent call should request JSON.

```bash
mandate invoice create --amount 4900 --currency USD --idempotency-key order-49 --json
mandate transfer --amount 50000000 --currency USDC --to 0x... --network base-sepolia --json
mandate transactions list --json
```

Build and start the MCP server to expose the same application operations:

```bash
pnpm --dir packages/mcp build
pnpm --dir packages/mcp start
```

See `integrations/openclaw` and `integrations/hermes` for runtime-specific
assets. Agent credentials are scoped and are never administrator credentials.
## Repository map

- `rust/mandate-core` — domain model, authorization, ledger, workflows
- `rust/mandated` — local API, SSE, daemon transports
- `rust/mandate` — CLI and connection helpers
- `web` — dashboard and onboarding
- `packages/mcp` — MCP adapter over the daemon API
- `packages/provider-sdk` — provider protocol, runner, redaction, conformance
- `providers` — bundled Coinbase, Stripe, and Lithic plugins
- `docs` — architecture, security, and provider activation
- `packaging` — Homebrew service definition

## Security and production activation

Read [the security model](docs/SECURITY.md) before connecting credentials and
[the provider checklist](docs/PROVIDER_ACTIVATION.md) before enabling any live
rail. Production card credentials remain disabled until the provider program,
funding model, and PCI posture have been verified.

Please do not open a public issue containing credentials, payment data, wallet
material, or a detailed unpatched vulnerability. Use GitHub's private security
advisory flow for sensitive reports.

## Contributing

Issues and pull requests are welcome. Before submitting a change:

```bash
pnpm check
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

Changes to public DTOs, ledger semantics, authorization rules, migrations, or
the provider protocol should include matching contract and invariant tests.

## Author

Created and maintained by **Richardson Dackam** —
[X](https://x.com/richardsondx) · [GitHub](https://github.com/richardsondx).

## License

Licensed under the [Apache License 2.0](LICENSE).

## Current scope

Bank transfers and automatic cross-provider rebalancing are intentionally deferred.
