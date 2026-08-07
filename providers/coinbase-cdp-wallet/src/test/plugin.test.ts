import test from "node:test"; import assert from "node:assert"; import crypto from "node:crypto"; import { runProviderConformance } from "@mandate/provider-sdk"; import { CoinbaseCdpWalletPlugin, generateCdpJwt } from "../plugin.js";
test("coinbase mock conforms", async () => runProviderConformance(new CoinbaseCdpWalletPlugin(), { mode: "mock" }));
test("coinbase validates apiKeyId and apiKeySecret", async () => {
  const plugin = new CoinbaseCdpWalletPlugin();
  const validRes = await plugin.validateConfiguration({ mode: "sandbox", apiKeyId: "5d5a19...b76af", apiKeySecret: "secret-key" });
  assert.strictEqual(validRes.valid, true);
  const invalidRes = await plugin.validateConfiguration({ mode: "sandbox" });
  assert.strictEqual(invalidRes.valid, false);
});
test("generateCdpJwt creates valid signed JWT token", () => {
  const keyPair = crypto.generateKeyPairSync("ed25519");
  const pem = keyPair.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  const jwt = generateCdpJwt("organizations/123/apiKeys/456", pem, "GET", "https://api.cdp.coinbase.com/platform/v2/evm/accounts?pageSize=1");
  assert.strictEqual(typeof jwt, "string");
  const parts = jwt.split(".");
  assert.strictEqual(parts.length, 3);
  const header = JSON.parse(Buffer.from(parts[0]!, "base64").toString());
  const payload = JSON.parse(Buffer.from(parts[1]!, "base64").toString());
  assert.strictEqual(header.alg, "EdDSA");
  assert.strictEqual(header.kid, "organizations/123/apiKeys/456");
  assert.strictEqual(payload.iss, "cdp");
  assert.strictEqual(payload.sub, "organizations/123/apiKeys/456");
  assert.ok(!payload.aud, "aud should not be present");
  assert.deepStrictEqual(payload.uris, ["GET api.cdp.coinbase.com/platform/v2/evm/accounts"]);
});
test("generateCdpJwt handles raw 64-byte Ed25519 key from CDP Portal", () => {
  const keyPair = crypto.generateKeyPairSync("ed25519");
  const privDer = keyPair.privateKey.export({ type: "pkcs8", format: "der" }) as Buffer;
  const pubDer = keyPair.publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const raw64 = Buffer.concat([privDer.subarray(16), pubDer.subarray(12)]).toString("base64");
  const jwt = generateCdpJwt("organizations/123/apiKeys/456", raw64, "GET", "https://api.cdp.coinbase.com/platform/v2/evm/accounts");
  const parts = jwt.split(".");
  const header = JSON.parse(Buffer.from(parts[0]!, "base64").toString());
  const payload = JSON.parse(Buffer.from(parts[1]!, "base64").toString());
  assert.strictEqual(header.alg, "EdDSA");
  assert.strictEqual(payload.iss, "cdp");
  assert.deepStrictEqual(payload.uris, ["GET api.cdp.coinbase.com/platform/v2/evm/accounts"]);
});

test("generateCdpJwt handles JSON keyfile strings", () => {
  const keyPair = crypto.generateKeyPairSync("ed25519");
  const pem = keyPair.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  const jsonSecret = JSON.stringify({ name: "organizations/abc/apiKeys/def", privateKey: pem });
  const jwt = generateCdpJwt("", jsonSecret, "GET", "https://api.cdp.coinbase.com/platform/v2/evm/accounts");
  const parts = jwt.split(".");
  const header = JSON.parse(Buffer.from(parts[0]!, "base64").toString());
  assert.strictEqual(header.kid, "organizations/abc/apiKeys/def");
});

