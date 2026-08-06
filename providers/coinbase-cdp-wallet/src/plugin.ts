import { JsonValue, ProviderContext, ProviderError, ProviderHealth, ProviderManifest, ProviderOperation, ProviderPlugin, ProviderResult, SyncPage, providerFetch, requireStrings } from "@mandate/provider-sdk";

type Config = { mode: "mock" | "sandbox" | "live"; bearerToken?: string; walletAuth?: string; accountAddress?: string; accountName?: string; policyId?: string; baseUrl: string; network: string };
const defaults: Config = { mode: "mock", baseUrl: "https://api.cdp.coinbase.com/platform", network: "base-sepolia" };

export class CoinbaseCdpWalletPlugin implements ProviderPlugin {
  readonly manifest: ProviderManifest = {
    id: "coinbase-cdp-wallet", displayName: "Coinbase CDP Wallet", version: "0.1.0", protocolVersion: "1.0",
    capabilities: ["treasury.balance", "treasury.receive", "treasury.transfer"], assets: ["USDC"], networks: ["base-sepolia", "base"], currencies: [], regions: ["US"], environments: ["sandbox", "live"],
    configurationSchema: { type: "object", properties: { mode: { enum: ["mock", "sandbox", "live"] }, bearerToken: { type: "string" }, walletAuth: { type: "string" }, accountAddress: { type: "string" }, network: { enum: ["base-sepolia", "base"] } } },
    secretFields: ["bearerToken", "walletAuth"], healthChecks: ["authentication", "account_access"]
  };
  private config: Config = defaults;
  private active = false;

  async validateConfiguration(input: Record<string, JsonValue>) {
    const config = { ...defaults, ...input } as Config;
    const errors = config.mode === "mock" ? [] : requireStrings(input, ["bearerToken", "accountAddress"]);
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
  private headers(write = false, idempotencyKey?: string): Record<string,string> {
    const headers: Record<string,string> = { Authorization: `Bearer ${this.config.bearerToken}`, Accept: "application/json" };
    if (write) { headers["Content-Type"] = "application/json"; if (this.config.walletAuth) headers["X-Wallet-Auth"] = this.config.walletAuth; }
    if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;
    return headers;
  }
  async health(): Promise<ProviderHealth> {
    if (!this.active) return { state: "disconnected", checkedAt: new Date().toISOString() };
    if (this.config.mode === "mock") return { state: "sandbox", checkedAt: new Date().toISOString(), message: "Mock CDP wallet" };
    await providerFetch(`${this.config.baseUrl}/v2/evm/accounts?pageSize=1`, { headers: this.headers() });
    return { state: this.config.mode === "live" ? "live" : "sandbox", checkedAt: new Date().toISOString() };
  }
  async execute(operation: ProviderOperation, context: ProviderContext): Promise<ProviderResult> {
    if (!this.active) throw new ProviderError({ code: "not_initialized", message: "Provider is not initialized", retryable: false });
    if (this.config.mode === "mock") return this.mock(operation, context);
    const address = String(operation.input.address ?? this.config.accountAddress ?? "");
    if (operation.capability === "treasury.receive") return { externalId: address, status: "ready", data: { address, asset: "USDC", network: this.config.network } };
    if (operation.capability === "treasury.balance") {
      // CDP's EVM account resource is authoritative for ownership; asset balances are supplied by the configured RPC/data path.
      const account = await providerFetch(`${this.config.baseUrl}/v2/evm/accounts/${address}`, { headers: this.headers() });
      return { externalId: address, status: "settled", data: { address, asset: "USDC", network: this.config.network, account } };
    }
    if (operation.capability === "treasury.transfer") {
      const body = { network: this.config.network, transaction: operation.input.transaction, ...operation.input };
      const result = await providerFetch(`${this.config.baseUrl}/v2/evm/accounts/${address}/transactions`, { method: "POST", headers: this.headers(true, context.idempotencyKey), body: JSON.stringify(body) });
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
