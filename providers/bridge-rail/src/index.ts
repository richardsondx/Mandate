import { runStdio } from "@mandate/provider-sdk";
import { BridgeRailPlugin } from "./plugin.js";
export { BridgeRailPlugin } from "./plugin.js";
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await runStdio(new BridgeRailPlugin());
