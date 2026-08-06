# Mandate v0.1 Completion Brief

This document defines what **done** means for the user-usable Mandate MVP. The
build ledger records implementation status; this brief records the experience
that must work from a clean Mac through a repeatable economic operation.

## Product model

- One local `mandated` runtime belongs to one principal (a person or organization).
- A principal may create multiple economic accounts.
- Provider connections, positions, reservations, ledger entries, and agent grants are scoped to exactly one economic account.
- Multiple agents and runtimes may use one account. Each receives a distinct credential and grant; none inherits administrator authority.
- Create a separate account when money, provider routes, permissions, or audit history must be isolated. There is no global sandbox/live switch: environment belongs to each provider connection.

## User-zero acceptance

- [x] Enter an administrator name, organization/principal, and first account.
- [x] Choose a genuinely empty starting state or explicitly add demo routes.
- [x] Reach an empty dashboard containing no fabricated funds, activity, agents, or connected providers.
- [x] Understand the next actions: connect a capability, connect an agent, and run a proof operation.
- [x] Create another economic account and switch between accounts.
- [x] See provider and agent state change per account, without leakage.
- [x] Distinguish `Not connected`, `Demo connected`, provider test mode, and future live mode.

## Functional demo acceptance

- [x] Add only Stripe from Receive, Coinbase from Hold, and Lithic from Spend.
- [x] Connect each deterministic demo route through a working dialog.
- [x] Create receive, invoice, checkout, payment-session, transfer, and refund operations through the daemon-backed UI when their required route exists.
- [x] Inspect resulting activity and balanced ledger entries.
- [x] Create and revoke a scoped OpenClaw or Hermes identity.
- [x] See daemon-measured System diagnostics without false readiness claims.
- [ ] Install and probe runtime-native OpenClaw/Hermes configuration entirely from the dashboard. Scoped identities work; installation remains a CLI connector task.

## External-provider acceptance

The repository is **not** externally provider-functional until all of these are complete:

- [ ] The daemon supervises bundled provider subprocesses.
- [ ] Secure credential forms write secret references, never browser-visible plaintext storage.
- [ ] Coinbase test credentials complete receive, balance, transfer, and finality reconciliation.
- [ ] Stripe test credentials complete checkout, invoice, settlement, fees, refund, and polling reconciliation.
- [ ] Lithic sandbox credentials complete one-time reveal, authorization, settlement, decline, expiry, and refund without secret leakage.
- [ ] REST, CLI JSON, and MCP pass the same provider-backed golden scenarios.

Until then, provider cards must say `Not connected` or `Demo connected`; they must not imply that entering credentials is currently supported.

## Release acceptance

- [ ] Clean-Mac installer, LaunchAgent, reboot recovery, upgrade, export/restore, and history-preserving uninstall pass.
- [ ] Full keyboard, screen-reader, axe, light/dark, reduced-motion, and 200% zoom audits pass.
- [ ] The complete demo proof takes under ten minutes after installation.
- [ ] A separate live-money gate passes a low-value real receive, purchase, settlement, and refund with contracted funding and compliance.

## Current verdict

The local deterministic product is usable for setup, account isolation,
provider-routing demonstrations, agent grants, economic workflows, and ledger
inspection. The external Coinbase, Stripe, and Lithic connection path is not
yet usable because provider subprocess supervision and secret-reference setup
are not implemented. That distinction is a release boundary, not a UI detail.
