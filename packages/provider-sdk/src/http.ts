import { JsonValue, ProviderError } from "./types.js";

export async function providerFetch(
  url: string,
  init: RequestInit,
  timeoutMs = 15_000,
): Promise<Record<string, JsonValue>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: Record<string, JsonValue> = {};
    try { body = text ? JSON.parse(text) as Record<string, JsonValue> : {}; } catch { body = { raw: text.slice(0, 512) }; }
    if (!response.ok) throw new ProviderError({
      code: response.status === 429 ? "rate_limited" : response.status >= 500 ? "provider_unavailable" : "provider_rejected",
      message: `Provider returned HTTP ${response.status}`,
      retryable: response.status === 429 || response.status >= 500,
      details: { status: response.status, providerResponse: body },
    });
    return body;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError({ code: "provider_unavailable", message: error instanceof Error ? error.message : "Provider request failed", retryable: true });
  } finally { clearTimeout(timer); }
}

export function requireStrings(config: Record<string, JsonValue>, fields: string[]): string[] {
  return fields.filter((field) => typeof config[field] !== "string" || !(config[field] as string).trim()).map((field) => `${field} is required`);
}
