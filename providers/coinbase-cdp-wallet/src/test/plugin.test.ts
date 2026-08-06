import test from "node:test"; import { runProviderConformance } from "@mandate/provider-sdk"; import { CoinbaseCdpWalletPlugin } from "../plugin.js";
test("coinbase mock conforms", async () => runProviderConformance(new CoinbaseCdpWalletPlugin(), { mode: "mock" }));
