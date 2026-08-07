import test from "node:test";
import { runProviderConformance } from "@mandate/provider-sdk";
import { BridgeRailPlugin } from "../plugin.js";

test("bridge mock conforms", async () => runProviderConformance(new BridgeRailPlugin(), { mode: "mock" }));
