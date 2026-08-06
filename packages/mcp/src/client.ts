import http from "node:http";
import { readFile } from "node:fs/promises";

export interface MandateError { code:string;message:string;retryable:boolean;request_id:string;details?:Record<string,unknown> }
export class MandateApiError extends Error { constructor(public status:number,public body:MandateError){super(body.message);} }
export interface ClientOptions { socketPath?:string;baseUrl?:string;credential?:string;credentialFile?:string;timeoutMs?:number }

export class MandateClient {
 constructor(private options:ClientOptions={}){}
 private async credential(){if(this.options.credential)return this.options.credential;const file=this.options.credentialFile??process.env.MANDATE_AGENT_CREDENTIAL_FILE;if(file)return(await readFile(file,"utf8")).trim();return process.env.MANDATE_AGENT_TOKEN;}
 async request(method:string,path:string,body?:unknown,idempotencyKey?:string):Promise<unknown>{
  const token=await this.credential();const payload=body===undefined?undefined:JSON.stringify(body);const timeout=this.options.timeoutMs??15_000;
  return new Promise((resolve,reject)=>{
   const url=this.options.baseUrl??process.env.MANDATE_API_URL;const socketPath=this.options.socketPath??process.env.MANDATE_AGENT_SOCKET??process.env.MANDATE_SOCKET??`${process.env.HOME}/Library/Application Support/Mandate/mandated.sock`;
   const target=url?new URL(path,url):undefined;
   const requestPath=target?`${target.pathname}${target.search}`:path;
   const req=http.request({method,path:requestPath,hostname:target?.hostname,port:target?.port,socketPath:target?undefined:socketPath,headers:{Accept:"application/json",...(payload?{"Content-Type":"application/json","Content-Length":Buffer.byteLength(payload)}:{}),...(token?{Authorization:`Bearer ${token}`} : {}),...(idempotencyKey?{"Idempotency-Key":idempotencyKey}:{})}},res=>{
    const chunks:Buffer[]=[];res.on("data",c=>chunks.push(c));res.on("end",()=>{const text=Buffer.concat(chunks).toString("utf8");let parsed:unknown={};try{parsed=text?JSON.parse(text):{};}catch{return reject(new Error("Mandate daemon returned invalid JSON"));}if((res.statusCode??500)>=400)return reject(new MandateApiError(res.statusCode??500,parsed as MandateError));resolve(parsed);});
   });req.setTimeout(timeout,()=>req.destroy(new Error("Mandate daemon request timed out")));req.on("error",reject);if(payload)req.write(payload);req.end();
  });
 }
}
