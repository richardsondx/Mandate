# Mandate

**One account. Many rails.**

Mandate is a macOS-first, local economic operating system for autonomous agents.
It gives CLI-native and tool-native agents one stable account interface while
keeping provider positions, permissions, and accounting explicit.

This repository contains the v0.1 test-route MVP:

- `mandated` Rust daemon and encrypted double-entry ledger
- `mandate` deterministic CLI
- localhost React dashboard
- stdio MCP server
- out-of-process TypeScript provider protocol
- Coinbase CDP Wallet, Stripe Revenue, and Lithic Card providers
- OpenClaw skill and Hermes MCP integration assets

Mandate is orchestration software. It is not a bank, wallet custodian, card
issuer, or legal principal. Completing the local test route does not mean that
liquidity can already move automatically between providers.

## Project status

Mandate is an early open-source v0.1 implementation. The encrypted local
runtime, CLI, MCP adapter, dashboard, account isolation, deterministic demo
providers, agent grants, and double-entry ledger are functional. The dashboard
can validate Coinbase, Stripe, and Lithic test/live credentials through the
bundled out-of-process adapters and store their configuration in macOS
Keychain. Provider-backed operation dispatch and reconciliation remain release
gates, so verified credentials are shown as **Live ready**, not Live.

See the [build ledger](docs/BUILD_LEDGER.md) for implemented scope and the
[completion brief](docs/COMPLETION_BRIEF.md) for the definition of done.

## Quick start

Requirements:

- macOS 13 or newer for the supported v0.1 installation path
- Xcode Command Line Tools
- Node.js 22 or newer and pnpm 10
- Rust stable (installed by the bootstrap script when missing)

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

On the first run, open `http://127.0.0.1:7741/`. Mandate asks for the
administrator name, organization/principal, and first economic account. Choose
**Start empty** for the real zero-state setup or **Add demo routes** for an
explicit deterministic demonstration. Browser setup is required only once.

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
positions into one balance.

Live-provider activation remains unavailable until operation dispatch,
reconciliation, and each gate in `docs/PROVIDER_ACTIVATION.md` have passed.

Track exact implementation status in [the v0.1 build ledger](docs/BUILD_LEDGER.md).
The user-usable acceptance boundary is in [the completion brief](docs/COMPLETION_BRIEF.md).

## Accounts and agents

One principal can own multiple economic accounts. Each account has independent
provider connections, positions, reservations, journal entries, and grants.
Multiple OpenClaw, Hermes, or custom agents may share one account, but every
agent uses its own scoped credential. Create separate accounts whenever funds,
provider routes, permissions, or audit history should not be shared.

The bottom-left profile is the human operator for this local instance; it is
not another economic account. Rename the operator or principal from **Edit
local profile**. Create and switch economic accounts only from the account
switcher at the top of the sidebar.

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

The native menu-bar shell, browser credential presentation, Mandate Pay,
third-party marketplace, public SDKs, bank transfers, and automatic
cross-provider rebalancing are intentionally deferred.
