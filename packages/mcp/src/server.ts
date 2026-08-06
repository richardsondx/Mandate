import {createInterface}from"node:readline";import{MandateApiError,MandateClient}from"./client.js";import{callTool,tools}from"./tools.js";
type Rpc={jsonrpc:"2.0";id?:string|number|null;method:string;params?:any};
export class MandateMcpServer{
 constructor(private client=new MandateClient()){}
 async handle(r:Rpc):Promise<object|null>{const id=r.id??null;if(r.method.startsWith("notifications/"))return null;try{
  if(r.method==="initialize")return{jsonrpc:"2.0",id,result:{protocolVersion:"2025-06-18",capabilities:{tools:{listChanged:false}},serverInfo:{name:"mandate",version:"0.1.0"},instructions:"Use exact atomic-unit amount strings and idempotency keys. Never retain temporary payment credentials."}};
  if(r.method==="ping")return{jsonrpc:"2.0",id,result:{}};
  if(r.method==="tools/list")return{jsonrpc:"2.0",id,result:{tools}};
  if(r.method==="tools/call"){const name=String(r.params?.name??"");const args=(r.params?.arguments??{})as Record<string,unknown>;const result=await callTool(this.client,name,args);return{jsonrpc:"2.0",id,result:{content:[{type:"text",text:JSON.stringify(result)}],structuredContent:result}};}
  return{jsonrpc:"2.0",id,error:{code:-32601,message:`Method not found: ${r.method}`}};
 }catch(e){const api=e instanceof MandateApiError?e.body:{code:"daemon_unavailable",message:e instanceof Error?e.message:"Mandate call failed",retryable:true,request_id:"mcp"};return{jsonrpc:"2.0",id,result:{isError:true,content:[{type:"text",text:JSON.stringify(api)}],structuredContent:{error:api}}};}}
 async run(){const input=createInterface({input:process.stdin,terminal:false});for await(const line of input){if(!line.trim())continue;let response:object|null;try{response=await this.handle(JSON.parse(line));}catch{response={jsonrpc:"2.0",id:null,error:{code:-32700,message:"Parse error"}};}if(response)process.stdout.write(`${JSON.stringify(response)}\n`);}}
}
