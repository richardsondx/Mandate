# Security model

Mandate is financial orchestration software, not a bank, custodian, card issuer,
or legal principal. Provider availability and regulated capabilities are always
shown separately from core health.

## Secrets

- The database encryption key is generated locally and wrapped by macOS
  Keychain. Recovery exports contain a separately wrapped database key.
- Provider secrets remain in Keychain and must be reconnected after restoring a
  recovery package to another Mac.
- Agent credentials are random, scoped, and stored in files readable only by
  their owner. The database stores credential hashes.
- Administrator credentials are never placed in agent configuration.
- PAN, CVC, API keys, bearer tokens, and recovery material are rejected by the
  logging redactor and excluded from diagnostic bundles.

## Temporary cards

Payment credentials are a one-time presentation, not ordinary payment-session
state. They are never written to SQLite or included in status, events, receipts,
or telemetry. A session that loses its volatile credential state before use is
revoked rather than re-presented. Production card detail access remains disabled
until the operator's provider program and PCI posture are verified.

## Local process limitations

Agent sockets and token files prevent accidental privilege crossover and allow
the daemon to enforce grants. They do not isolate mutually hostile processes
running as the same macOS user. Stronger isolation requires separate OS users or
a sandboxed agent runtime.

## Default posture

- Bind only to `127.0.0.1` and local sockets.
- Telemetry off.
- Provider mode `sandbox` until explicitly activated.
- No automatic bridging, swapping, or cross-provider netting.
- No arbitrary plugin loading outside developer mode.
- Mutations require idempotency and are fully audited.
