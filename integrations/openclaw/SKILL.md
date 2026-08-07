---
name: mandate-economic-account
description: Use the locally installed Mandate CLI for balances, receiving, invoicing, payments, transfers, refunds, and transaction history.
metadata:
  requires:
    bins:
      - mandate
---

# Mandate economic operations

Use the Mandate CLI for every economic operation. Always pass `--json` and consume returned JSON rather than terminal prose.

- Run `mandate whoami --json` first to discover the scoped economic account, authority, and grant.
- Run `mandate capabilities --json` when availability is uncertain. Treat it as current account truth; do not infer availability from this skill.
- Supply a stable `--idempotency-key` for every mutation and reuse it when retrying.
- Never invoke `mandate admin` or provider-management commands.
- Never print, persist, summarize, or place temporary card credentials in notes, memory, logs, or messages.
- Treat `available`, `reserved`, `pending`, and `settled` as distinct states.
- Do not describe value held at one provider as spendable through another rail unless Mandate reports that capability.

## Semantic capability guidance

### checkout
Use when Money should come from another party into this economic account through a hosted checkout.
Do not use when The account is paying a merchant; use pay instead.

### invoice
Use when A named customer should receive a formal invoice and payment terms.
Do not use when A simple immediate payment link is enough; use checkout instead.

### receive
Use when Another party needs an address or account endpoint to transfer value directly.
Do not use when The payer needs a hosted checkout or invoice.

### balance
Use when The user wants current provider positions or spending availability.
Do not use when The user wants historical activity; use transactions instead.

### transactions
Use when The user wants historical or recent account activity.
Do not use when The user only wants current positions; use balance instead.

### liquidity_status
Use when The agent needs a single account-level view of spendable, fundable, and pending capital before deciding to spend or fund.
Do not use when The agent only wants per-provider positions; use balance instead.

### pay
Use when Money should go from this economic account to a merchant.
Do not use when Another party is paying this account; use checkout, invoice, or receive.

### transfer
Use when Existing capital should move to an explicit external destination.
Do not use when The destination is a merchant checkout needing a controlled card session; use pay.

### fund_spend
Use when The agent needs a target amount of spendable money and settled capital exists to fund it.
Do not use when The agent wants to send capital to an explicit external destination; use transfer.

### refund
Use when A settled incoming customer payment should be reversed.
Do not use when The account is sending a new transfer unrelated to a customer payment.

Run `mandate status --json` if the daemon appears unavailable and report the machine-readable error unchanged.
