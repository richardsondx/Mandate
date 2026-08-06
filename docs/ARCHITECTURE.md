# Mandate architecture

Mandate is a local economic operating system. The daemon is the only component
that can authorize operations, select providers, mutate workflow state, or post
ledger entries. The CLI, dashboard, MCP server, and future SDKs are transports
over the same versioned API.

```text
CLI -----------\
MCP ------------+--> mandated --> application service --> provider host
Dashboard ------/          |                                  |
                           +--> encrypted ledger               +--> plugins
```

## Trust boundaries

- `mandated` owns account authorization, idempotency, reservations, audit, and
  normalized provider events.
- Provider plugins are supervised subprocesses. They receive only the secret
  references and operation payload required for their selected capability.
- Plugins cannot open the ledger or manufacture ledger postings.
- Agent grants are distinct from administrator access. A grant selects one
  economic account, authority mode, and explicit capabilities.
- Loopback HTTP exists for the dashboard. The Unix-domain socket is the
  authoritative local transport for automation.

## Economic truth

An economic account aggregates positions without pretending they are fungible.
Balances retain provider, asset, network, and lifecycle state. A consolidated
USD figure is an estimate with a valuation timestamp, not a promise that every
rail can spend the total.

Every value movement is represented by balanced journal postings. External
providers remain authoritative for their assets; Mandate's journal is an
auditable operational mirror reconciled from provider events and polling.

## Local reconciliation

A localhost service cannot normally receive public webhooks. Provider polling
and periodic full reconciliation are therefore correctness mechanisms;
webhooks are an optional low-latency input during development or when an
operator supplies a public endpoint. The core deduplicates both paths by
provider and external event identifier.

## Plugin protocol

Providers communicate with newline-delimited JSON-RPC 2.0 on stdin/stdout. A
manifest declares capabilities, configuration schema, supported rails, health
checks, and environment. The core applies deadlines and owns retries. Normal
operation accepts only bundled providers; local third-party executables require
developer mode.
