# Regression Rules — Mandate

## Rule: UI-text/test synchronization after Capabilities revamp

**Defect class:** Test — stale assertions after UI text change
**Learned from:** Project takeover audit (2026-08-08)
**Why QA missed it:** The Capabilities page was revamped (commit 25a9f44) but
  the test file App.test.tsx was not updated to match the new text.
**Check:** After any UI text change, search App.test.tsx for the old text and
  update assertions. Run `pnpm --dir web test` before claiming work is complete.
**Apply when:** Any change to Capabilities page text, callout text, or status
  bar text.
**Added:** 2026-08-08
