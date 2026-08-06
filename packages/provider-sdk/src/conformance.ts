import { strict as assert } from "node:assert";
import { ProviderPlugin, PROVIDER_PROTOCOL_VERSION } from "./types.js";

export async function runProviderConformance(plugin: ProviderPlugin, validConfig: Record<string, any>): Promise<void> {
  assert.equal(plugin.manifest.protocolVersion, PROVIDER_PROTOCOL_VERSION);
  assert.match(plugin.manifest.id, /^[a-z0-9][a-z0-9-]+$/);
  assert.ok(plugin.manifest.capabilities.length > 0);
  assert.equal(new Set(plugin.manifest.capabilities).size, plugin.manifest.capabilities.length);
  assert.equal((await plugin.validateConfiguration(validConfig)).valid, true);
  const health = await plugin.initialize(validConfig);
  assert.ok(["sandbox", "live_ready", "live", "degraded", "disconnected"].includes(health.state));
  assert.deepEqual(await plugin.capabilities(), plugin.manifest.capabilities);
  assert.ok((await plugin.health()).checkedAt);
  const sync = await plugin.incrementalSync(undefined, { requestId: "conformance" });
  assert.equal(typeof sync.hasMore, "boolean");
  await plugin.shutdown();
}
