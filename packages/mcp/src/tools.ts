import { randomUUID } from "node:crypto";
import { MandateClient } from "./client.js";

type Schema={type:"object";properties:Record<string,unknown>;required?:string[];additionalProperties:boolean};
export interface McpTool{name:string;description:string;inputSchema:Schema}
const amount={type:"string",pattern:"^[0-9]+$",description:"Exact amount in the currency's atomic unit; never a floating-point value"};
const common={account_id:{type:"string"},provider:{type:"string"},idempotency_key:{type:"string"}};
export const tools:McpTool[]=[
 {name:"get_balance",description:"Get available, reserved, pending, and settled provider positions for an economic account.",inputSchema:{type:"object",properties:{account_id:{type:"string"}},required:["account_id"],additionalProperties:false}},
 {name:"create_receive_endpoint",description:"Create a stablecoin receive endpoint.",inputSchema:{type:"object",properties:{...common,asset:{type:"string",default:"USDC"},network:{type:"string",default:"base-sepolia"}},required:["account_id"],additionalProperties:false}},
 {name:"create_invoice",description:"Create and finalize a customer invoice.",inputSchema:{type:"object",properties:{...common,amount_atomic:amount,currency:{type:"string"},customer_id:{type:"string"},description:{type:"string"}},required:["account_id","amount_atomic","currency","customer_id"],additionalProperties:false}},
 {name:"create_checkout",description:"Create a hosted customer checkout session.",inputSchema:{type:"object",properties:{...common,amount_atomic:amount,currency:{type:"string"},description:{type:"string"}},required:["account_id","amount_atomic","currency"],additionalProperties:false}},
 {name:"create_payment_session",description:"Create a temporary single-use or merchant-locked card session. Returned credentials are ephemeral and must not be stored.",inputSchema:{type:"object",properties:{...common,amount_atomic:amount,currency:{type:"string"},mode:{type:"string",enum:["single_use","merchant_locked"]},merchant:{type:"string"}},required:["account_id","amount_atomic","currency","mode"],additionalProperties:false}},
 {name:"get_payment_session",description:"Get non-sensitive payment session status.",inputSchema:{type:"object",properties:{session_id:{type:"string"}},required:["session_id"],additionalProperties:false}},
 {name:"revoke_payment_session",description:"Permanently revoke a payment session.",inputSchema:{type:"object",properties:{session_id:{type:"string"},idempotency_key:{type:"string"}},required:["session_id"],additionalProperties:false}},
 {name:"transfer_funds",description:"Transfer an asset through a treasury provider.",inputSchema:{type:"object",properties:{...common,amount_atomic:amount,asset:{type:"string"},network:{type:"string"},to:{type:"string"}},required:["account_id","amount_atomic","asset","network","to"],additionalProperties:false}},
 {name:"get_transactions",description:"List normalized economic activity.",inputSchema:{type:"object",properties:{account_id:{type:"string"},cursor:{type:"string"},limit:{type:"integer",minimum:1,maximum:100},status:{type:"string"}},required:["account_id"],additionalProperties:false}},
 {name:"refund_transaction",description:"Refund a settled revenue transaction.",inputSchema:{type:"object",properties:{...common,transaction_id:{type:"string"},amount_atomic:amount},required:["account_id","transaction_id"],additionalProperties:false}}
];

function money(args:Record<string,unknown>,idempotencyKey:string,overrides:Record<string,unknown>={}){
 return {account_id:String(args.account_id),amount:String(args.amount_atomic??"0"),currency:String(args.currency??args.asset??"USD").toUpperCase(),provider:args.provider??null,idempotency_key:idempotencyKey,metadata:{},...overrides};
}
export async function callTool(client:MandateClient,name:string,args:Record<string,unknown>):Promise<unknown>{
 const idem=String(args.idempotency_key??randomUUID());
 switch(name){
  case"get_balance":return client.request("GET",`/v1/accounts/${encodeURIComponent(String(args.account_id))}/balance`);
  case"create_receive_endpoint":return client.request("POST","/v1/receive-endpoints",money(args,idem,{currency:String(args.asset??"USDC").toUpperCase(),metadata:{network:String(args.network??"base-sepolia")}}),idem);
  case"create_invoice":return client.request("POST","/v1/invoices",money(args,idem,{metadata:{customer_id:String(args.customer_id),description:String(args.description??"")}}),idem);
  case"create_checkout":return client.request("POST","/v1/checkouts",money(args,idem,{metadata:{description:String(args.description??"")}}),idem);
  case"create_payment_session":return client.request("POST","/v1/payment-sessions",money(args,idem,{mode:String(args.mode),merchant:args.merchant??null}),idem);
  case"get_payment_session":return client.request("GET",`/v1/payment-sessions/${encodeURIComponent(String(args.session_id))}`);
  case"revoke_payment_session":return client.request("POST",`/v1/payment-sessions/${encodeURIComponent(String(args.session_id))}/revoke`,{},idem);
  case"transfer_funds":return client.request("POST","/v1/transfers",money(args,idem,{currency:String(args.asset).toUpperCase(),to:String(args.to),network:String(args.network)}),idem);
  case"get_transactions":{const q=new URLSearchParams(Object.entries(args).filter(([k,v])=>k!=="account_id"&&v!==undefined).map(([k,v])=>[k,String(v)]));return client.request("GET",`/v1/transactions?account_id=${encodeURIComponent(String(args.account_id))}&${q}`);}
  case"refund_transaction":return client.request("POST","/v1/refunds",money(args,idem,{transaction_id:String(args.transaction_id)}),idem);
  default:throw new Error(`Unknown Mandate tool: ${name}`);
 }
}
