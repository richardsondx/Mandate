# Risk Surfaces — Mandate

## Web dashboard tests vs. UI changes

**Why it's risky:** The Capabilities page underwent a visual revamp that
  changed visible text strings. Tests in App.test.tsx assert exact text
  matches, making them brittle to copy changes. Two tests are currently
  failing for this reason.
**Default QA depth:** After any UI copy change, run `pnpm --dir web test` and
  verify all tests pass. Grep App.test.tsx for any modified text strings.
**Last reviewed:** 2026-08-08

## Provider credential handling

**Why it's risky:** Provider secrets (Stripe, Coinbase, Lithic) must never
  appear in SQLite, logs, browser storage, or telemetry. Security model
  requires Keychain storage and one-time presentation for card credentials.
**Default QA depth:** After any change to provider credential flows, verify
  secrets are not persisted in the database and that the logging redactor
  rejects PAN, CVC, API keys, and bearer tokens.
**Last reviewed:** 2026-08-08

## External provider operations

**Why it's risky:** External provider credentials can be validated and stored
  securely, but actual money operations (receive, transfer, checkout, card
  authorization) are not yet accepted. The completion brief explicitly states
  this is a release boundary.
**Default QA depth:** Never report external provider operations as
  production-ready. Verify the distinction between "Demo connected",
  "Credentials verified", and "Live" is maintained in the UI.
**Last reviewed:** 2026-08-08
