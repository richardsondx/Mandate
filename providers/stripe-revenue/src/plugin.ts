import { JsonValue, ProviderContext, ProviderError, ProviderHealth, ProviderManifest, ProviderOperation, ProviderPlugin, ProviderResult, SyncPage, providerFetch, requireStrings } from "@mandate/provider-sdk";

type Config = { mode: "mock"|"sandbox"|"live"; secretKey?: string; baseUrl: string; successUrl: string; cancelUrl: string };
const defaults: Config = { mode: "mock", baseUrl: "https://api.stripe.com", successUrl: "http://127.0.0.1:7741/payment/success", cancelUrl: "http://127.0.0.1:7741/payment/cancel" };

export class StripeRevenuePlugin implements ProviderPlugin {
  readonly manifest: ProviderManifest = { id:"stripe-revenue", displayName:"Stripe Revenue", version:"0.1.0", protocolVersion:"1.0", capabilities:["revenue.checkout","revenue.invoice","revenue.refund"], assets:[], networks:[], currencies:["USD"], regions:["global"], environments:["sandbox","live"], configurationSchema:{type:"object",properties:{mode:{enum:["mock","sandbox","live"]},secretKey:{type:"string"},successUrl:{type:"string"},cancelUrl:{type:"string"}}}, secretFields:["secretKey"], healthChecks:["authentication","balance_access"] };
  private config: Config = defaults; private active = false;
  async validateConfiguration(input: Record<string,JsonValue>) { const c={...defaults,...input} as Config; const errors=c.mode==="mock"?[]:requireStrings(input,["secretKey"]); if(c.mode==="sandbox"&&c.secretKey&&!c.secretKey.startsWith("sk_test_")) errors.push("sandbox requires an sk_test_ key"); if(!/^https:\/\//.test(c.baseUrl)) errors.push("baseUrl must use https"); return {valid:!errors.length,errors}; }
  async initialize(input: Record<string,JsonValue>) { const v=await this.validateConfiguration(input); if(!v.valid) throw new ProviderError({code:"invalid_configuration",message:v.errors.join("; "),retryable:false}); this.config={...defaults,...input} as Config; this.active=true; return this.health(); }
  async capabilities(){return this.manifest.capabilities;}
  private headers(context?:ProviderContext){return {Authorization:`Bearer ${this.config.secretKey}`,"Content-Type":"application/x-www-form-urlencoded",...(context?.idempotencyKey?{"Idempotency-Key":context.idempotencyKey}:{})};}
  private async request(path:string, init:RequestInit={}) { return providerFetch(`${this.config.baseUrl}${path}`,{...init,headers:{...this.headers(),...(init.headers as Record<string,string>|undefined)}}); }
  async health():Promise<ProviderHealth>{if(!this.active)return{state:"disconnected",checkedAt:new Date().toISOString()};if(this.config.mode==="mock")return{state:"sandbox",checkedAt:new Date().toISOString(),message:"Mock Stripe revenue"};await this.request("/v1/balance");return{state:this.config.mode==="live"?"live":"sandbox",checkedAt:new Date().toISOString()};}
  async execute(op:ProviderOperation,ctx:ProviderContext):Promise<ProviderResult>{
    if(!this.active)throw new ProviderError({code:"not_initialized",message:"Provider is not initialized",retryable:false}); if(this.config.mode==="mock")return this.mock(op,ctx);
    if(op.capability==="revenue.checkout"){
      const amount=String(op.input.amountAtomic),currency=String(op.input.currency??"USD").toLowerCase(),description=String(op.input.description??"Mandate payment");
      const body=new URLSearchParams({mode:"payment",success_url:this.config.successUrl,cancel_url:this.config.cancelUrl,"line_items[0][price_data][currency]":currency,"line_items[0][price_data][unit_amount]":amount,"line_items[0][price_data][product_data][name]":description,"line_items[0][quantity]":"1","metadata[mandate_request_id]":ctx.requestId});
      const r=await this.request("/v1/checkout/sessions",{method:"POST",headers:this.headers(ctx),body}); return{externalId:String(r.id),status:String(r.status??"open"),data:r};
    }
    if(op.capability==="revenue.invoice"){
      const customer=String(op.input.customerId??""); if(!customer)throw new ProviderError({code:"invalid_input",message:"customerId is required",retryable:false});
      const item=new URLSearchParams({customer,currency:String(op.input.currency??"USD").toLowerCase(),amount:String(op.input.amountAtomic),description:String(op.input.description??"Mandate invoice")});
      await this.request("/v1/invoiceitems",{method:"POST",headers:this.headers(ctx),body:item});
      const invoice=await this.request("/v1/invoices",{method:"POST",headers:this.headers(ctx),body:new URLSearchParams({customer,collection_method:"send_invoice",days_until_due:String(op.input.daysUntilDue??30),"metadata[mandate_request_id]":ctx.requestId})});
      const finalized=await this.request(`/v1/invoices/${invoice.id}/finalize`,{method:"POST",headers:this.headers(ctx),body:new URLSearchParams()}); return{externalId:String(finalized.id),status:String(finalized.status??"open"),data:finalized};
    }
    if(op.capability==="revenue.refund") { const body=new URLSearchParams({payment_intent:String(op.input.paymentIntentId),...(op.input.amountAtomic?{amount:String(op.input.amountAtomic)}:{})}); const r=await this.request("/v1/refunds",{method:"POST",headers:this.headers(ctx),body});return{externalId:String(r.id),status:String(r.status??"pending"),data:r}; }
    throw new ProviderError({code:"unsupported_operation",message:op.capability,retryable:false});
  }
  private mock(op:ProviderOperation,ctx:ProviderContext):ProviderResult{const prefix=op.capability==="revenue.checkout"?"cs_test":op.capability==="revenue.invoice"?"in_test":"re_test";return{externalId:`${prefix}_${ctx.idempotencyKey??ctx.requestId}`,status:op.capability==="revenue.refund"?"pending":"open",data:{currency:op.input.currency??"USD",amountAtomic:op.input.amountAtomic??"0",url:`https://checkout.stripe.test/${prefix}`}};}
  async retrieveStatus(externalId:string):Promise<ProviderResult>{if(this.config.mode==="mock")return{externalId,status:"open",data:{}};const kind=externalId.startsWith("cs_")?"checkout/sessions":externalId.startsWith("in_")?"invoices":"refunds";const r=await this.request(`/v1/${kind}/${externalId}`);return{externalId,status:String(r.status??"unknown"),data:r};}
  async incrementalSync(cursor?:string,_ctx?:ProviderContext):Promise<SyncPage>{if(this.config.mode==="mock")return{events:[],cursor:cursor??"0",hasMore:false};const q=new URLSearchParams({limit:"100",...(cursor?{starting_after:cursor}:{})});const r=await this.request(`/v1/events?${q}`);const data=(r.data??[]) as Array<Record<string,JsonValue>>;return{events:data.map(e=>({externalEventId:String(e.id),type:String(e.type),occurredAt:new Date(Number(e.created)*1000).toISOString(),data:e})),cursor:data.length?String(data.at(-1)?.id):cursor,hasMore:Boolean(r.has_more)};}
  async fullReconciliation(ctx:ProviderContext){return this.incrementalSync(undefined,ctx);} async shutdown(){this.active=false;}
}
