import { KeyObject, createPrivateKey, randomBytes, sign } from "node:crypto";
import { JsonValue, ProviderContext, ProviderError, ProviderHealth, ProviderManifest, ProviderOperation, ProviderPlugin, ProviderResult, SyncPage, providerFetch, requireStrings } from "@mandate/provider-sdk";

type Config = { mode: "mock" | "sandbox" | "live"; apiKeyId?: string; apiKeySecret?: string; bearerToken?: string; walletAuth?: string; accountAddress?: string; accountName?: string; policyId?: string; baseUrl: string; network: string };
const defaults: Config = { mode: "mock", baseUrl: "https://api.cdp.coinbase.com/platform", network: "base-sepolia" };

function base64UrlEncode(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function parsePrivateKey(secret: string): KeyObject {
  let s = secret.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1);
  }
  if (s.startsWith("{") && s.endsWith("}")) {
    try {
      const obj = JSON.parse(s);
      s = obj.privateKey || obj.secret || obj.apiKeySecret || s;
    } catch {}
  }
  s = s.replace(/\\n/g, "\n");
  if (s.includes("-----BEGIN")) {
    return createPrivateKey(s);
  }
  try {
    const buf = Buffer.from(s, "base64");
    return createPrivateKey({ key: buf, format: "der", type: "pkcs8" });
  } catch {}
  try {
    return createPrivateKey(`-----BEGIN PRIVATE KEY-----\n${s}\n-----END PRIVATE KEY-----`);
  } catch {}
  return createPrivateKey(`-----BEGIN EC PRIVATE KEY-----\n${s}\n-----END EC PRIVATE KEY-----`);
}

/**
 * Resolve the correct signing algorithm and sign function from the raw secret string.
 * Matches the official @coinbase/cdp-sdk key detection:
 *   - Ed25519: raw 64-byte base64 (seed[0:32] || public[32:64])
 *   - EC:      PEM PKCS8 string starting with -----BEGIN
 */
function keyToJwtSigner(secret: string): { alg: "EdDSA" | "ES256"; sign: (msg: Buffer) => Buffer } {
  let s = secret.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1);
  }

  // Unwrap JSON keyfile
  if (s.startsWith("{") && s.endsWith("}")) {
    try {
      const obj = JSON.parse(s);
      s = ((obj.privateKey || obj.secret || obj.apiKeySecret || s) as string).trim();
    } catch {}
  }
  s = s.replace(/\\n/g, "\n");

  // Detect Ed25519 raw 64-byte base64 (official CDP Portal export format)
  if (!s.includes("-----BEGIN")) {
    const decoded = Buffer.from(s, "base64");
    if (decoded.length === 64) {
      // 32-byte seed + 32-byte public key as exported by CDP Portal
      const seed = decoded.subarray(0, 32);
      // Wrap seed into minimal PKCS8 DER for Ed25519
      const pkcs8Header = Buffer.from("302e020100300506032b657004220420", "hex");
      const pkcs8Der = Buffer.concat([pkcs8Header, seed]);
      const keyObj = createPrivateKey({ key: pkcs8Der, format: "der", type: "pkcs8" });
      return { alg: "EdDSA", sign: (msg) => sign(undefined, msg, keyObj) };
    }
  }

  // PEM path (EC or Ed25519 wrapped in PEM)
  const keyObj = parsePrivateKey(s);
  const isEd = keyObj.asymmetricKeyType === "ed25519";
  return {
    alg: isEd ? "EdDSA" : "ES256",
    sign: (msg) => sign(isEd ? undefined : "sha256", msg, keyObj)
  };
}

export function generateCdpJwt(apiKeyId: string, apiKeySecret: string, requestMethod: string, requestUrl: string): string {
  let id = apiKeyId.trim();
  let secret = apiKeySecret.trim();

  if (id.startsWith('"') && id.endsWith('"')) id = id.slice(1, -1).trim();
  if (secret.startsWith('"') && secret.endsWith('"')) secret = secret.slice(1, -1).trim();

  // Unwrap JSON keyfile (Coinbase Portal lets you download a cdp_api_key.json)
  if (secret.startsWith("{") && secret.endsWith("}")) {
    try {
      const obj = JSON.parse(secret);
      if (obj.name && !id) id = obj.name as string;
      secret = ((obj.privateKey || obj.secret || obj.apiKeySecret || secret) as string).trim();
    } catch {}
  }
  if (id.startsWith("{") && id.endsWith("}")) {
    try {
      const obj = JSON.parse(id);
      id = (obj.name || obj.id || obj.apiKeyId || id) as string;
      if (!secret && (obj.privateKey || obj.secret)) {
        secret = (obj.privateKey || obj.secret) as string;
      }
    } catch {}
  }

  const signer = keyToJwtSigner(secret);

  const urlObj = new URL(requestUrl);
  // Match official CDP SDK: "METHOD host/path" (no query string, no trailing slash quirks)
  const uriString = `${requestMethod.toUpperCase()} ${urlObj.host}${urlObj.pathname}`;
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");

  const header = { alg: signer.alg, kid: id, typ: "JWT", nonce };
  // Match official CDP SDK exactly: iss="cdp", sub=keyId, uris=[array] — NOT uri string, NOT aud
  // Include 10-second backward skew buffer to prevent HTTP 401 when local clock is slightly ahead
  const payload = {
    iss: "cdp",
    sub: id,
    nbf: now - 10,
    iat: now - 10,
    exp: now + 120,
    uris: [uriString]
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;

  const sig = signer.sign(Buffer.from(message));
  return `${message}.${base64UrlEncode(sig)}`;
}

export class CoinbaseCdpWalletPlugin implements ProviderPlugin {
  readonly manifest: ProviderManifest = {
    id: "coinbase-cdp-wallet", displayName: "Coinbase CDP Wallet", version: "0.1.0", protocolVersion: "1.0",
    capabilities: ["treasury.balance", "treasury.receive", "treasury.transfer"], assets: ["USDC"], networks: ["base-sepolia", "base"], currencies: [], regions: ["US"], environments: ["sandbox", "live"],
    configurationSchema: { type: "object", properties: { mode: { enum: ["mock", "sandbox", "live"] }, apiKeyId: { type: "string" }, apiKeySecret: { type: "string" }, bearerToken: { type: "string" }, walletAuth: { type: "string" }, accountAddress: { type: "string" }, network: { enum: ["base-sepolia", "base"] } } },
    secretFields: ["apiKeySecret", "bearerToken", "walletAuth"], healthChecks: ["authentication", "account_access"]
  };
  private config: Config = defaults;
  private active = false;

  async validateConfiguration(input: Record<string, JsonValue>) {
    const config = { ...defaults, ...input } as Config;
    const errors: string[] = [];
    if (config.mode !== "mock") {
      if (!config.bearerToken && (!config.apiKeyId || !config.apiKeySecret)) {
        errors.push("Either apiKeyId and apiKeySecret OR bearerToken must be provided");
      }
    }
    if (!/^https:\/\//.test(config.baseUrl)) errors.push("baseUrl must use https");
    if (config.accountAddress && !/^0x[0-9a-fA-F]{40}$/.test(config.accountAddress)) errors.push("accountAddress must be an EVM address");
    if (!['base-sepolia','base'].includes(config.network)) errors.push("network must be base-sepolia or base");
    return { valid: errors.length === 0, errors };
  }
  async initialize(input: Record<string, JsonValue>): Promise<ProviderHealth> {
    const checked = await this.validateConfiguration(input); if (!checked.valid) throw new ProviderError({ code: "invalid_configuration", message: checked.errors.join("; "), retryable: false });
    this.config = { ...defaults, ...input } as Config; this.active = true; return this.health();
  }
  async capabilities() { return this.manifest.capabilities; }
  private headers(url: string, method = "GET", write = false, idempotencyKey?: string): Record<string,string> {
    let token = this.config.bearerToken;
    if (!token && (this.config.apiKeyId || this.config.apiKeySecret)) {
      const id = this.config.apiKeyId ?? "";
      const secret = this.config.apiKeySecret ?? "";
      if (secret.startsWith("eyJ")) {
        token = secret;
      } else {
        try {
          token = generateCdpJwt(id, secret, method, url);
        } catch {
          token = secret;
        }
      }
    }
    const headers: Record<string,string> = { Authorization: `Bearer ${token ?? ""}`, Accept: "application/json" };
    if (write) { headers["Content-Type"] = "application/json"; if (this.config.walletAuth) headers["X-Wallet-Auth"] = this.config.walletAuth; }
    if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;
    return headers;
  }
  async health(): Promise<ProviderHealth> {
    if (!this.active) return { state: "disconnected", checkedAt: new Date().toISOString() };
    if (this.config.mode === "mock") return { state: "sandbox", checkedAt: new Date().toISOString(), message: "Mock CDP wallet" };
    const url = `${this.config.baseUrl}/v2/evm/accounts?pageSize=1`;
    await providerFetch(url, { headers: this.headers(url, "GET") });
    return { state: this.config.mode === "live" ? "live" : "sandbox", checkedAt: new Date().toISOString() };
  }
  async execute(operation: ProviderOperation, context: ProviderContext): Promise<ProviderResult> {
    if (!this.active) throw new ProviderError({ code: "not_initialized", message: "Provider is not initialized", retryable: false });
    if (this.config.mode === "mock") return this.mock(operation, context);
    const address = String(operation.input.address ?? this.config.accountAddress ?? "");
    if (operation.capability === "treasury.receive") return { externalId: address, status: "ready", data: { address, asset: "USDC", network: this.config.network } };
    if (operation.capability === "treasury.balance") {
      const url = `${this.config.baseUrl}/v2/evm/accounts/${address}`;
      const account = await providerFetch(url, { headers: this.headers(url, "GET") });
      return { externalId: address, status: "settled", data: { address, asset: "USDC", network: this.config.network, account } };
    }
    if (operation.capability === "treasury.transfer") {
      const url = `${this.config.baseUrl}/v2/evm/accounts/${address}/transactions`;
      const body = { network: this.config.network, transaction: operation.input.transaction, ...operation.input };
      const result = await providerFetch(url, { method: "POST", headers: this.headers(url, "POST", true, context.idempotencyKey), body: JSON.stringify(body) });
      return { externalId: String(result.operationId ?? result.transactionHash ?? ""), status: "pending", data: result };
    }
    throw new ProviderError({ code: "unsupported_operation", message: operation.capability, retryable: false });
  }
  private mock(operation: ProviderOperation, context: ProviderContext): ProviderResult {
    const id = `cdp_mock_${context.idempotencyKey ?? context.requestId}`;
    if (operation.capability === "treasury.receive") return { externalId: id, status: "ready", data: { address: "0x1111111111111111111111111111111111111111", asset: "USDC", network: "base-sepolia" } };
    if (operation.capability === "treasury.balance") return { externalId: id, status: "settled", data: { amountAtomic: "100000000", decimals: 6, asset: "USDC", network: "base-sepolia" } };
    return { externalId: id, status: "pending", data: { transactionHash: `0x${"1".repeat(64)}`, network: "base-sepolia" } };
  }
  async retrieveStatus(externalId: string, context: ProviderContext) { return this.execute({ capability: "treasury.balance", action: "status", input: { externalId } }, context); }
  async incrementalSync(cursor?: string): Promise<SyncPage> { return { events: [], cursor: cursor ?? new Date().toISOString(), hasMore: false }; }
  async fullReconciliation(): Promise<SyncPage> { return { events: [], hasMore: false }; }
  async shutdown() { this.active = false; }
}
