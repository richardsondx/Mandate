import { randomUUID } from "node:crypto";
import { MandateClient } from "./client.js";
import { TOOL_GUIDANCE } from "./capabilities.generated.js";

type Schema={type:"object";properties:Record<string,unknown>;required?:string[];additionalProperties:boolean};
export interface McpTool{name:string;description:string;inputSchema:Schema}
const amount={type:"string",pattern:"^[0-9]+$",description:"Exact amount in the currency's atomic unit; never a floating-point value"};
const common={account_id:{type:"string"},provider:{type:"string"},idempotency_key:{type:"string"}};
const guidance=(name:keyof typeof TOOL_GUIDANCE,fallback:string)=>TOOL_GUIDANCE[name]?.description??fallback;
export const tools:McpTool[]=[
 {name:"whoami",description:"Introspect the current agent credential and return its economic account id, account name, authority, capabilities, runtime, and grant status. Use this to discover which account and capabilities a credential is scoped to before calling other tools.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
 {name:"list_capabilities",description:"List the current economic account capabilities, semantic guidance, grant status, connected providers, environment, and exact reasons unavailable. Use this instead of assuming a capability exists.",inputSchema:{type:"object",properties:{account_id:{type:"string"}},additionalProperties:false}},
 {name:"get_balance",description:guidance("get_balance","Get account positions."),inputSchema:{type:"object",properties:{account_id:{type:"string"}},required:["account_id"],additionalProperties:false}},
 {name:"get_liquidity_status",description:guidance("get_liquidity_status","Report spendable, fundable, and pending capital across the spend route."),inputSchema:{type:"object",properties:{account_id:{type:"string"},currency:{type:"string",default:"USD"}},required:["account_id"],additionalProperties:false}},
 {name:"create_receive_endpoint",description:guidance("create_receive_endpoint","Create a receive endpoint."),inputSchema:{type:"object",properties:{...common,asset:{type:"string",default:"USDC"},network:{type:"string",default:"base-sepolia"}},required:["account_id"],additionalProperties:false}},
 {name:"create_invoice",description:guidance("create_invoice","Create an invoice."),inputSchema:{type:"object",properties:{...common,amount_atomic:amount,currency:{type:"string"},customer_id:{type:"string"},description:{type:"string"}},required:["account_id","amount_atomic","currency","customer_id"],additionalProperties:false}},
 {name:"create_checkout",description:guidance("create_checkout","Create a checkout."),inputSchema:{type:"object",properties:{...common,amount_atomic:amount,currency:{type:"string"},description:{type:"string"}},required:["account_id","amount_atomic","currency"],additionalProperties:false}},
 {name:"create_payment_session",description:`${guidance("create_payment_session","Create a payment session.")} Returned credentials are ephemeral and must not be stored.`,inputSchema:{type:"object",properties:{...common,amount_atomic:amount,currency:{type:"string"},mode:{type:"string",enum:["single_use","merchant_locked"]},merchant:{type:"string"}},required:["account_id","amount_atomic","currency","mode"],additionalProperties:false}},
 {name:"get_payment_session",description:guidance("get_payment_session","Get payment session status."),inputSchema:{type:"object",properties:{session_id:{type:"string"}},required:["session_id"],additionalProperties:false}},
 {name:"revoke_payment_session",description:guidance("revoke_payment_session","Revoke a payment session."),inputSchema:{type:"object",properties:{session_id:{type:"string"},idempotency_key:{type:"string"}},required:["session_id"],additionalProperties:false}},
 {name:"transfer_funds",description:guidance("transfer_funds","Transfer an asset."),inputSchema:{type:"object",properties:{...common,amount_atomic:amount,asset:{type:"string"},network:{type:"string"},to:{type:"string"}},required:["account_id","amount_atomic","asset","network","to"],additionalProperties:false}},
 {name:"fund_spend",description:guidance("fund_spend","Make earned money spendable."),inputSchema:{type:"object",properties:{...common,amount_atomic:amount,currency:{type:"string",default:"USD"}},required:["account_id","amount_atomic","currency"],additionalProperties:false}},
 {name:"get_funding_movement",description:guidance("get_funding_movement","Check a funding movement."),inputSchema:{type:"object",properties:{movement_id:{type:"string"}},required:["movement_id"],additionalProperties:false}},
 {name:"get_transactions",description:guidance("get_transactions","List economic activity."),inputSchema:{type:"object",properties:{account_id:{type:"string"},cursor:{type:"string"},limit:{type:"integer",minimum:1,maximum:100},status:{type:"string"}},required:["account_id"],additionalProperties:false}},
 {name:"refund_transaction",description:guidance("refund_transaction","Refund a transaction."),inputSchema:{type:"object",properties:{...common,transaction_id:{type:"string"},amount_atomic:amount},required:["account_id","transaction_id"],additionalProperties:false}}
];

function money(args:Record<string,unknown>,idempotencyKey:string,overrides:Record<string,unknown>={}){
 return {account_id:String(args.account_id),amount:String(args.amount_atomic??"0"),currency:String(args.currency??args.asset??"USD").toUpperCase(),provider:args.provider??null,idempotency_key:idempotencyKey,metadata:{},...overrides};
}
export async function callTool(client:MandateClient,name:string,args:Record<string,unknown>):Promise<unknown>{
 const idem=String(args.idempotency_key??randomUUID());
 switch(name){
  case"whoami":return client.request("GET","/v1/me");
  case"list_capabilities":return client.request("GET",`/v1/capabilities${args.account_id?`?account_id=${encodeURIComponent(String(args.account_id))}`:""}`);
  case"get_balance":return client.request("GET",`/v1/accounts/${encodeURIComponent(String(args.account_id))}/balance`);
  case"get_liquidity_status":return client.request("GET",`/v1/liquidity-status?account_id=${encodeURIComponent(String(args.account_id))}&currency=${encodeURIComponent(String(args.currency??"USD"))}`);
  case"create_receive_endpoint":return client.request("POST","/v1/receive-endpoints",money(args,idem,{currency:String(args.asset??"USDC").toUpperCase(),metadata:{network:String(args.network??"base-sepolia")}}),idem);
  case"create_invoice":return client.request("POST","/v1/invoices",money(args,idem,{metadata:{customer_id:String(args.customer_id),description:String(args.description??"")}}),idem);
  case"create_checkout":return client.request("POST","/v1/checkouts",money(args,idem,{metadata:{description:String(args.description??"")}}),idem);
  case"create_payment_session":return client.request("POST","/v1/payment-sessions",money(args,idem,{mode:String(args.mode),merchant:args.merchant??null}),idem);
  case"get_payment_session":return client.request("GET",`/v1/payment-sessions/${encodeURIComponent(String(args.session_id))}`);
  case"revoke_payment_session":return client.request("POST",`/v1/payment-sessions/${encodeURIComponent(String(args.session_id))}/revoke`,{},idem);
  case"transfer_funds":return client.request("POST","/v1/transfers",money(args,idem,{currency:String(args.asset).toUpperCase(),to:String(args.to),network:String(args.network)}),idem);
  case"fund_spend":return client.request("POST","/v1/fund-spend",money(args,idem),idem);
  case"get_funding_movement":return client.request("GET",`/v1/funding-movements/${encodeURIComponent(String(args.movement_id))}`);
  case"get_transactions":{const q=new URLSearchParams(Object.entries(args).filter(([k,v])=>k!=="account_id"&&v!==undefined).map(([k,v])=>[k,String(v)]));return client.request("GET",`/v1/transactions?account_id=${encodeURIComponent(String(args.account_id))}&${q}`);}
  case"refund_transaction":return client.request("POST","/v1/refunds",money(args,idem,{transaction_id:String(args.transaction_id)}),idem);
  default:throw new Error(`Unknown Mandate tool: ${name}`);
 }
}
