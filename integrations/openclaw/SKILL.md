---
name: mandate-economic-account
description: Use the locally installed Mandate CLI for balances, receiving, invoicing, payments, transfers, refunds, and transaction history.
metadata:
  requires:
    bins:
      - mandate
---

# Mandate economic operations

Use the Mandate CLI for every economic operation. Always pass `--json` and consume the returned JSON rather than terminal prose.

- Supply a stable `--idempotency-key` for every mutation and reuse it when retrying.
- Never invoke `mandate admin` or provider-management commands.
- Never print, persist, summarize, or place temporary card credentials in notes, memory, logs, or messages.
- Use a payment credential only for its requested checkout and discard it immediately afterward.
- Treat `available`, `reserved`, `pending`, and `settled` as distinct states.
- Do not describe value held at one provider as spendable through another rail unless Mandate reports that capability.

Run `mandate status --json` if the daemon appears unavailable and report the machine-readable error unchanged.
