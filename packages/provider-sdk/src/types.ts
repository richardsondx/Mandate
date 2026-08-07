import type { Capability } from "./capabilities.generated.js";
export type { Capability } from "./capabilities.generated.js";

export const PROVIDER_PROTOCOL_VERSION = "1.0" as const;

export type ConnectionState = "sandbox" | "live_ready" | "live" | "degraded" | "disconnected";
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface ProviderManifest {
  id: string;
  displayName: string;
  version: string;
  protocolVersion: typeof PROVIDER_PROTOCOL_VERSION;
  capabilities: Capability[];
  assets: string[];
  networks: string[];
  currencies: string[];
  regions: string[];
  environments: Array<"sandbox" | "live">;
  configurationSchema: Record<string, JsonValue>;
  secretFields: string[];
  healthChecks: string[];
}

export interface ProviderContext {
  requestId: string;
  idempotencyKey?: string;
  accountId?: string;
  deadline?: string;
}

export interface ProviderOperation {
  capability: Capability;
  action: string;
  input: Record<string, JsonValue>;
}

export interface ProviderResult {
  externalId?: string;
  status: string;
  data: Record<string, JsonValue>;
  sensitive?: boolean;
}

export interface SyncPage {
  events: Array<{ externalEventId: string; type: string; occurredAt: string; data: Record<string, JsonValue> }>;
  cursor?: string;
  hasMore: boolean;
}

export interface ProviderHealth {
  state: ConnectionState;
  checkedAt: string;
  message?: string;
}

export interface ProviderErrorShape {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, JsonValue>;
}

export class ProviderError extends Error {
  constructor(public readonly shape: ProviderErrorShape) { super(shape.message); this.name = "ProviderError"; }
}

export interface ProviderPlugin {
  manifest: ProviderManifest;
  initialize(config: Record<string, JsonValue>): Promise<ProviderHealth>;
  validateConfiguration(config: Record<string, JsonValue>): Promise<{ valid: boolean; errors: string[] }>;
  capabilities(): Promise<Capability[]>;
  health(): Promise<ProviderHealth>;
  execute(operation: ProviderOperation, context: ProviderContext): Promise<ProviderResult>;
  retrieveStatus(externalId: string, context: ProviderContext): Promise<ProviderResult>;
  incrementalSync(cursor: string | undefined, context: ProviderContext): Promise<SyncPage>;
  fullReconciliation(context: ProviderContext): Promise<SyncPage>;
  shutdown(): Promise<void>;
}

export interface JsonRpcRequest { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: JsonValue; }
export interface JsonRpcResponse { jsonrpc: "2.0"; id: string | number | null; result?: JsonValue; error?: { code: number; message: string; data?: JsonValue }; }
