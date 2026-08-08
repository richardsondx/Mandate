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

## Rule: Browser-driven QA baseline

**Defect class:** QA process — no browser-driven verification existed
**Learned from:** Skill adoption audit (2026-08-08)
**Why QA missed it:** Project tests are all unit/integration (Rust service tests,
  Vitest component tests in jsdom, provider plugin tests, MCP server tests).
  None use a real browser. Visual, responsive, interaction lifecycle, and
  console/network issues cannot be caught by jsdom-only tests.
**Check:** After UI changes, run a Playwright browser session against the
  running daemon (http://127.0.0.1:7741) to verify: page navigation, console
  cleanliness, responsive behavior (desktop/tablet/mobile), interactive
  components (dialogs, simulators), and data integrity (no fixture data in
  live view).
**Apply when:** Any change to dashboard UI, navigation, dialogs, or data
  rendering.
**Added:** 2026-08-08

## Rule: Playwright locator for nav buttons

**Defect class:** Test automation — false timeout on nav buttons
**Learned from:** Skill adoption audit (2026-08-08)
**Why QA missed it:** The dashboard renders duplicate nav buttons (visible
  desktop + hidden mobile variants). Playwright's get_by_role("button",
  name=X).first.click() may resolve to the hidden duplicate and time out.
**Check:** When automating nav clicks, use page.evaluate with
  offsetParent !== null filter, or use .nth(1) / .last instead of .first.
**Apply when:** Writing Playwright scripts that click sidebar nav buttons.
**Added:** 2026-08-08

## Rule: UI text/condition must match actual setup state

**Defect class:** UX — misleading blank state text
**Learned from:** Human-found defect (2026-08-08)
**Why QA missed it:** The Activity Live tab showed "Waiting for agent
  activity…" even when no agents were connected, because the condition
  checked provider connection status (demo providers count as connected)
  rather than agent presence.
**Check:** Blank state messages must reflect the actual user setup state.
  When no agents exist, show "No activity yet" with guidance, not "Waiting
  for activity" which implies activity is expected.
**Apply when:** Any blank/empty state text or condition logic changes.
**Added:** 2026-08-08

## Rule: Keyboard shortcuts must use document capture phase

**Defect class:** Interaction — keyboard shortcut not firing
**Learned from:** Human-found defect (2026-08-08)
**Why QA missed it:** The Cmd+K listener was on window in bubble phase.
  In some browser/OS configurations, the event may not reach the window
  bubble phase reliably. Moving to document with capture phase ensures
  the handler fires before any other handlers can intercept.
**Check:** Global keyboard shortcuts should use
  document.addEventListener('keydown', handler, true) (capture phase)
  rather than window.addEventListener('keydown', handler) (bubble phase).
**Apply when:** Adding or modifying global keyboard shortcut handlers.
**Added:** 2026-08-08
