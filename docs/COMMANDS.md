# CLI contract

Agent mode is enabled by `--json` or a noninteractive invocation. Successful
responses contain one JSON value on stdout. Errors contain one structured JSON
error on stderr and use a stable exit class.

| Exit | Meaning |
|---:|---|
| 0 | Success |
| 2 | Invalid input |
| 3 | Authentication or authorization |
| 4 | Not found, conflict, or invalid state |
| 5 | Provider rejection or insufficient funds |
| 6 | Retryable provider failure |
| 7 | Daemon unavailable |
| 8 | Internal failure |

## Economic operations

```text
mandate balance --account <id> --json
mandate receive stablecoin --account <id> --json
mandate invoice create --account <id> --amount <atomic> --currency USD --json
mandate checkout create --account <id> --amount <atomic> --currency USD --json
mandate pay create --account <id> --amount <atomic> --currency USD --mode online-checkout --json
mandate pay status <session-id> --json
mandate pay revoke <session-id> --json
mandate transfer --account <id> --amount <atomic> --currency USDC --to <address> --network base-sepolia --json
mandate refund create <transaction-id> --account <id> --amount <atomic> --currency USD --json
mandate transactions list --account <id> --json
```

All mutation commands accept `--idempotency-key`. Reuse the same key when
retrying the same intent.

## Administration

```text
mandate providers list --json
mandate agents add --name <name> --account <id> --json
mandate agents connect openclaw --account <id> --json
mandate agents connect hermes --account <id> --with-mcp --json
mandate status --json
mandate doctor --json
mandate dashboard
```

An agent-scoped credential is rejected by every administrator endpoint.
