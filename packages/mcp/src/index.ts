#!/usr/bin/env node
import{MandateMcpServer}from"./server.js";export{MandateMcpServer}from"./server.js";export{MandateClient,MandateApiError}from"./client.js";export{tools,callTool}from"./tools.js";if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href)await new MandateMcpServer().run();
