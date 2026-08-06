import { runStdio } from "@mandate/provider-sdk";
import { CoinbaseCdpWalletPlugin } from "./plugin.js";
export { CoinbaseCdpWalletPlugin } from "./plugin.js";
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await runStdio(new CoinbaseCdpWalletPlugin());
