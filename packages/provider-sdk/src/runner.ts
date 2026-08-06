import { createInterface } from "node:readline";
import { JsonRpcRequest, JsonRpcResponse, JsonValue, ProviderError, ProviderPlugin } from "./types.js";
import { redact } from "./redaction.js";

const INVALID_REQUEST = -32600, METHOD_NOT_FOUND = -32601, INVALID_PARAMS = -32602, INTERNAL_ERROR = -32603;

export async function dispatch(plugin: ProviderPlugin, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const id = request.id ?? null;
  const params = (request.params ?? {}) as Record<string, any>;
  try {
    let result: unknown;
    switch (request.method) {
      case "manifest": result = plugin.manifest; break;
      case "initialize": result = await plugin.initialize(params.config ?? {}); break;
      case "validate_configuration": result = await plugin.validateConfiguration(params.config ?? {}); break;
      case "capabilities": result = await plugin.capabilities(); break;
      case "health": result = await plugin.health(); break;
      case "execute": result = await plugin.execute(params.operation, params.context); break;
      case "retrieve_status": result = await plugin.retrieveStatus(params.externalId, params.context); break;
      case "incremental_sync": result = await plugin.incrementalSync(params.cursor, params.context); break;
      case "full_reconciliation": result = await plugin.fullReconciliation(params.context); break;
      case "shutdown": result = await plugin.shutdown().then(() => ({ ok: true })); break;
      default: return { jsonrpc: "2.0", id, error: { code: METHOD_NOT_FOUND, message: `Unknown method: ${request.method}` } };
    }
    return { jsonrpc: "2.0", id, result: result as JsonValue };
  } catch (error) {
    if (error instanceof ProviderError) return { jsonrpc: "2.0", id, error: { code: -32000, message: error.shape.message, data: redact(error.shape, plugin.manifest.secretFields) as unknown as JsonValue } };
    const message = error instanceof Error ? error.message : "Unknown provider error";
    return { jsonrpc: "2.0", id, error: { code: INTERNAL_ERROR, message: "Provider operation failed", data: { message: redact(message) } } };
  }
}

export async function runStdio(plugin: ProviderPlugin): Promise<void> {
  const input = createInterface({ input: process.stdin, terminal: false });
  for await (const line of input) {
    if (!line.trim()) continue;
    let response: JsonRpcResponse;
    try {
      const request = JSON.parse(line) as JsonRpcRequest;
      response = request?.jsonrpc === "2.0" && typeof request.method === "string"
        ? await dispatch(plugin, request)
        : { jsonrpc: "2.0", id: null, error: { code: INVALID_REQUEST, message: "Invalid JSON-RPC request" } };
    } catch {
      response = { jsonrpc: "2.0", id: null, error: { code: INVALID_PARAMS, message: "Invalid JSON" } };
    }
    process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}
