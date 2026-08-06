import test from "node:test";
import assert from "node:assert/strict";
import { redact } from "../redaction.js";

test("redacts nested secrets, bearer tokens, and card-like values", () => {
  const result = redact({ apiKey: "secret", nested: { authorization: "Bearer abc.def", note: "4111 1111 1111 1111" } });
  assert.equal(result.apiKey, "[REDACTED]");
  assert.equal(result.nested.authorization, "[REDACTED]");
  assert.equal(result.nested.note, "[REDACTED_CARD]");
});
