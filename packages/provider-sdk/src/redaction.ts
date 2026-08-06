const DEFAULT_SECRET_KEYS = /(^|_)(api_?key|secret|token|authorization|pan|cvv|cvc|card_?number|wallet_?auth|private_?key)($|_)/i;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const CARD = /\b(?:\d[ -]*?){13,19}\b/g;

export function redact<T>(value: T, extraSecretFields: string[] = []): T {
  const secrets = new Set(extraSecretFields.map((key) => key.toLowerCase()));
  const visit = (input: unknown, key?: string): unknown => {
    if (key && (secrets.has(key.toLowerCase()) || DEFAULT_SECRET_KEYS.test(key))) return "[REDACTED]";
    if (typeof input === "string") return input.replace(BEARER, "Bearer [REDACTED]").replace(CARD, "[REDACTED_CARD]");
    if (Array.isArray(input)) return input.map((item) => visit(item));
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, visit(v, k)]));
    return input;
  };
  return visit(value) as T;
}
