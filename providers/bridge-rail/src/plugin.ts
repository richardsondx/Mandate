import { JsonValue, ProviderContext, ProviderError, ProviderHealth, ProviderManifest, ProviderOperation, ProviderPlugin, ProviderResult, SyncPage, requireStrings } from "@mandate/provider-sdk";

type Config = { mode: "mock" | "sandbox" | "live"; apiKey?: string; baseUrl: string };
const defaults: Config = { mode: "mock", baseUrl: "https://api.bridge.xyz" };

export class BridgeRailPlugin implements ProviderPlugin {
  readonly manifest: ProviderManifest = {
    id: "bridge-rail",
    displayName: "Bridge Rail",
    version: "0.1.0",
    protocolVersion: "1.0",
    capabilities: ["money.fiat_to_stablecoin", "money.stablecoin_to_fiat"],
    assets: ["USD", "USDC"],
    networks: ["base"],
    currencies: ["USD"],
    regions: ["global"],
    environments: ["sandbox", "live"],
    configurationSchema: {
      type: "object",
      properties: { mode: { enum: ["mock", "sandbox", "live"] }, apiKey: { type: "string" } }
    },
    secretFields: ["apiKey"],
    healthChecks: ["authentication", "routing_health"]
  };

  private config: Config = defaults;
  private active = false;

  async validateConfiguration(input: Record<string, JsonValue>) {
    const c = { ...defaults, ...input } as Config;
    const errors = c.mode === "mock" ? [] : requireStrings(input, ["apiKey"]);
    return { valid: !errors.length, errors };
  }

  async initialize(input: Record<string, JsonValue>) {
    const v = await this.validateConfiguration(input);
    if (!v.valid) throw new ProviderError({ code: "invalid_configuration", message: v.errors.join("; "), retryable: false });
    this.config = { ...defaults, ...input } as Config;
    this.active = true;
    return this.health();
  }

  async capabilities() { return this.manifest.capabilities; }

  async health(): Promise<ProviderHealth> {
    if (!this.active) return { state: "disconnected", checkedAt: new Date().toISOString() };
    if (this.config.mode === "mock") return { state: "sandbox", checkedAt: new Date().toISOString(), message: "Mock Bridge liquidity rail" };
    return { state: this.config.mode === "live" ? "live" : "sandbox", checkedAt: new Date().toISOString() };
  }

  async execute(op: ProviderOperation, ctx: ProviderContext): Promise<ProviderResult> {
    if (!this.active) throw new ProviderError({ code: "not_initialized", message: "Provider is not initialized", retryable: false });
    const id = `brg_${ctx.idempotencyKey ?? ctx.requestId}`;
    if (op.capability === "money.fiat_to_stablecoin") {
      return {
        externalId: `va_${id}`,
        status: "ready",
        data: {
          virtualAccountId: `va_${id}`,
          depositRail: "ach",
          destinationNetwork: "base",
          destinationAsset: "USDC",
          status: "active"
        }
      };
    }
    if (op.capability === "money.stablecoin_to_fiat") {
      return {
        externalId: `liq_${id}`,
        status: "ready",
        data: {
          liquidationAddressId: `liq_${id}`,
          sourceNetwork: "base",
          sourceAsset: "USDC",
          destinationRail: "ach",
          destinationCurrency: "USD",
          status: "active"
        }
      };
    }
    throw new ProviderError({ code: "unsupported_operation", message: op.capability, retryable: false });
  }

  async retrieveStatus(externalId: string): Promise<ProviderResult> {
    return { externalId, status: "ready", data: { id: externalId, status: "active" } };
  }

  async incrementalSync(cursor?: string): Promise<SyncPage> {
    return { events: [], cursor: cursor ?? "0", hasMore: false };
  }

  async fullReconciliation(): Promise<SyncPage> {
    return { events: [], cursor: "0", hasMore: false };
  }

  async shutdown() { this.active = false; }
}
