import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import vm from "node:vm";
import assert from "node:assert/strict";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const context=vm.createContext({URL,AbortController,Date,console,Map,Set});
for(const name of ["core","llm","session"])vm.runInContext(await fs.readFile(path.join(root,"src",name+".js"),"utf8"),context);
const C=context.PaperLensCore,L=context.PaperLensLLM,Engine=context.PaperLensSessions.Engine;
let passed=0;
async function test(name,fn){await fn();passed++;console.log("✓ "+name);}
function check(value,message){assert.ok(value,message);}
function equal(a,b){assert.equal(JSON.stringify(a),JSON.stringify(b));}
function makePage(text,pageIndex=0){
  const chars=Array.from(text,(c,i)=>({c,rect:[i*4,20,i*4+4,30],inlineRect:[i*4,20,i*4+4,30]}));
  return C.pageFromChars(chars,pageIndex,String(pageIndex+1),[0,0,800,1000]);
}
const quote="Our method improves sample efficiency by 25 percent.";
const pages=[makePage("Abstract. "+quote+" Method: consistent estimation.",0),makePage("Discussion. Only two datasets were tested; further evaluation is required.",1)];
const config={provider:"openai",baseURL:"https://api.openai.com/v1",model:"gpt-4.1-mini",language:"简体中文",chunkSize:2000,maxHighlights:14};
function fixture(){
  const records=new Map();let readCalls=0,synthesisCalls=0,translationCalls=0;
  const store={async load(id){return records.has(id)?structuredClone(records.get(id)):null;},async save(id,value){records.set(id,structuredClone(value));}};
  const llm={async json(cfg,key,system,prompt,signal){
    C.abort(signal);const input=JSON.parse(prompt);
    if(input.task.startsWith("Read this")){
      readCalls++;return {data:{summary:"详细阅读："+input.source.text,facts:[{claim:"效率有所提升",quote:input.source.pageIndex===0?quote:"Only two datasets were tested",pageIndex:input.source.pageIndex}],
        glossary:[{term:"sample efficiency",translation:"样本效率",meaning:"本文衡量单位样本的学习收益"}],
        highlights:input.source.pageIndex===0?[{quote,pageIndex:0,category:"result",reason:"量化发现"}]:[]},usage:{input:100,output:50}};
    }
    if(input.task.startsWith("Translate")){
      translationCalls++;return {data:{translation:"我们的方法将样本效率提高了 25%。",explanation:"在这篇论文中，该句报告方法的定量收益。",role:"主要发现",terms:[],inference:"",uncertainties:[],
        citations:[{pageIndex:0,quote,supports:"效率提升的直接证据"},{pageIndex:1,quote:"Invented evidence that does not exist",supports:"错误"}]},usage:{input:200,output:100}};
    }
    synthesisCalls++;return {data:{overview:"提出改进样本效率的方法，并报告初步实验结果。",researchQuestion:"如何提高样本效率？",methods:["一致估计"],findings:[{claim:"提升 25%",quote,pageIndex:0}],
      limitations:["只有两个数据集"],glossary:[],readingGuide:["先读方法","再核对实验"]},usage:{input:300,output:150}};
  }};
  return {engine:new Engine({store,llm}),store,records,llm,counts:()=>({readCalls,synthesisCalls,translationCalls})};
}
await test("normalize whitespace, ligatures, soft hyphens",()=>equal(C.normalize("  eﬃcient \n method\u00ad "),"efficient method"));
await test("JSON fences accepted; invalid and array JSON rejected",()=>{
  equal(C.parseJSON('```json\n{"ok":true}\n```'),{ok:true});
  assert.throws(()=>C.parseJSON("[]"));assert.throws(()=>C.parseJSON("broken"));
});
await test("character offset map preserves astral Unicode",()=>{
  const p=makePage("A😀B");equal(p.map,[0,1,1,2]);equal(p.text,"A😀B");
});
await test("page chunking covers every character including final fragment",()=>{
  const text=("0123456789abcdef ").repeat(1200),p={text,pageIndex:0,label:"1"};
  const parts=C.chunks([p],2000,300),n=C.normalize(text);
  check(parts.length>1);equal(parts[0].start,0);equal(parts.at(-1).end,n.length);
  for(let i=1;i<parts.length;i++)check(parts[i].start<=parts[i-1].end,"no omitted range");
  for(const c of parts)equal(c.text,n.slice(c.start,c.end));
});
await test("chunk IDs and page indices remain distinct",()=>{
  const parts=C.chunks([{text:"One page.",pageIndex:0,label:"i"},{text:"Second page.",pageIndex:1,label:"ii"}],2000);
  equal(parts.map(x=>x.pageIndex),[0,1]);check(parts[0].id!==parts[1].id);
});
await test("chunk size guards prevent invalid or endless splitting",()=>{
  assert.throws(()=>C.chunks(pages,100));assert.throws(()=>C.chunks(pages,2000,2000));
});
await test("highlight uses source geometry and original character offsets",()=>{
  const h=C.locateQuote(pages[0],quote);check(h);equal(h.position.pageIndex,0);
  equal(h.position.rects[0][0],10*4);check(/^\d{5}\|\d{6}\|\d{5}$/.test(h.sortIndex));
});
await test("invented and ambiguous quotations are not annotated",()=>{
  equal(C.locateQuote(pages[0],"Invented finding that never appears in this document"),null);
  equal(C.locateQuote(makePage(quote+" "+quote),quote),null);
});
await test("highlights deduplicate, enforce page and cap",()=>{
  const h=C.validHighlights([{quote,pageIndex:0},{quote,pageIndex:0},{quote,pageIndex:1}],pages,1);
  equal(h.length,1);
});
await test("retrieval prefers current page and respects context budget",()=>{
  const parts=C.chunks(pages,2000);const selected=C.retrieve(parts,"sample efficiency",0,[],65);
  check(selected.reduce((n,x)=>n+x.text.length,0)<=65);
  const larger=C.retrieve(parts,"sample efficiency",0,[],1000);equal(larger[0].pageIndex,0);
});
await test("OpenAI and DeepSeek use their correct headers and token fields",()=>{
  const a=L.request(config,"secret","sys","user",100);
  equal(a.url,"https://api.openai.com/v1/chat/completions");equal(a.headers.Authorization,"Bearer secret");
  equal(JSON.parse(a.body).max_completion_tokens,100);
  const b=L.request({...config,provider:"deepseek",baseURL:"https://api.deepseek.com",model:"deepseek-chat"},"secret","s","u",100);
  equal(JSON.parse(b.body).max_tokens,100);check(!("max_completion_tokens"in JSON.parse(b.body)));
});
await test("Anthropic uses Messages API and system field",()=>{
  const r=L.request({...config,provider:"anthropic",baseURL:"https://api.anthropic.com/v1",model:"claude-sonnet-4-6"},"secret","system","user",200);
  equal(r.url,"https://api.anthropic.com/v1/messages");equal(r.headers["x-api-key"],"secret");equal(JSON.parse(r.body).system,"system");
});
await test("remote insecure URL and credential-bearing URL rejected",()=>{
  assert.throws(()=>L.endpoint({baseURL:"http://example.com/v1"}));
  assert.throws(()=>L.endpoint({baseURL:"https://user:password@example.com/v1"}));
  assert.throws(()=>L.endpoint({baseURL:"https://example.com/v1?key=secret"}));
  equal(L.endpoint({baseURL:"http://localhost:11434/v1"}),"http://localhost:11434/v1");
});
await test("endpoint suffix is normalized and hosted API key is required",()=>{
  equal(L.endpoint({baseURL:"https://api.openai.com/v1/chat/completions/"}),"https://api.openai.com/v1");
  assert.throws(()=>L.request(config,"","s","u"));
  check(L.request({...config,provider:"compatible",baseURL:"http://localhost:11434/v1"},"","s","u"));
});
await test("truncated outputs are rejected for both protocols",()=>{
  assert.throws(()=>L.response(config,{choices:[{finish_reason:"length",message:{content:"partial"}}]}));
  assert.throws(()=>L.response({...config,provider:"anthropic"},{stop_reason:"max_tokens",content:[{type:"text",text:"partial"}]}));
});
await test("429 retry succeeds and 401 is never retried",async()=>{
  let count=0;
  const client=new L.Client({sleep:async()=>{},transport:async()=>++count===1?{status:429,body:""}:{status:200,body:JSON.stringify({choices:[{finish_reason:"stop",message:{content:"ok"}}]})}});
  equal((await client.complete(config,"key","s","u")).text,"ok");equal(count,2);
  count=0;client.transport=async()=>{count++;return {status:401,body:"never expose secrets"};};
  await assert.rejects(()=>client.complete(config,"key","s","u"),/认证失败/);equal(count,1);
});
await test("pre-aborted request makes no API call",async()=>{
  let count=0;const signal={aborted:true};
  const client=new L.Client({sleep:async()=>{},transport:async()=>{count++;}});
  await assert.rejects(()=>client.complete(config,"key","s","u",signal),{name:"AbortError"});equal(count,0);
});
await test("session reads every page, then synthesizes and anchors highlights",async()=>{
  const f=fixture();const s=await f.engine.read({id:"1-ABCDEFGH",title:"Test",pages,config,key:"key"});
  equal(s.status,"ready");equal(f.counts(),{readCalls:2,synthesisCalls:1,translationCalls:0});
  equal(s.highlights.length,1);check(s.digest.findings[0].verified);equal(s.digest.glossary.length,1);
  equal(s.usage,{input:500,output:250});check(!JSON.stringify(s).includes('"key"'));
});
await test("ready session is reused with zero new reading calls",async()=>{
  const f=fixture(),args={id:"1-ABCDEFGH",title:"Test",pages,config,key:"key"};
  await f.engine.read(args);await f.engine.read(args);equal(f.counts().readCalls,2);equal(f.counts().synthesisCalls,1);
});
await test("model/language/PDF geometry changes invalidate session fingerprint",()=>{
  const f=fixture(),a=f.engine.signature(pages,config);
  check(a!==f.engine.signature(pages,{...config,language:"English"}));
  check(a!==f.engine.signature(pages,{...config,model:"another"}));
  const moved=structuredClone(pages);moved[0].chars[0].rect[0]+=1;check(a!==f.engine.signature(moved,config));
});
await test("cancelled reading resumes without rereading completed fragments",async()=>{
  const f=fixture(),signal={aborted:false};const original=f.llm.json;let calls=0;
  f.llm.json=async(...args)=>{calls++;if(calls===2){signal.aborted=true;C.abort(signal);}return original(...args);};
  const args={id:"1-ABCDEFGH",title:"Test",pages,config,key:"key"};
  await assert.rejects(()=>f.engine.read({...args,signal}),{name:"AbortError"});
  equal((await f.store.load(args.id)).status,"paused");equal(f.counts().readCalls,1);
  signal.aborted=false;f.llm.json=original;
  const s=await f.engine.read({...args,signal});equal(s.status,"ready");equal(f.counts().readCalls,2);
});
await test("blank/scanned paper never becomes a ready session",async()=>{
  const f=fixture();await assert.rejects(()=>f.engine.read({id:"1-ABCDEFGH",title:"Scan",pages:[makePage("")],config,key:"key"}),/OCR/);
  equal(f.counts().readCalls,0);
});
await test("failed fragment cannot be mistaken for full-paper understanding",async()=>{
  const f=fixture();f.llm.json=async()=>{throw new Error("network failure");};
  await assert.rejects(()=>f.engine.read({id:"1-ABCDEFGH",title:"T",pages,config,key:"key"}),/network/);
  equal((await f.store.load("1-ABCDEFGH")).status,"error");
});
await test("contextual translation retains only verifiable citations and caches output",async()=>{
  const f=fixture();const session=await f.engine.read({id:"1-ABCDEFGH",title:"T",pages,config,key:"key"});
  const args={session,selection:quote,pageIndex:0,config,key:"key"};
  const r=await f.engine.translate(args);equal(r.citations.length,1);equal(r.citations[0].quote,quote);
  const cached=await f.engine.translate(args);check(cached.cached);equal(f.counts().translationCalls,1);
});
await test("translation requires a complete session and bounded selection",async()=>{
  const f=fixture();
  await assert.rejects(()=>f.engine.translate({session:{status:"paused"},selection:quote,config,key:"key"}),/全文阅读/);
  const session=await f.engine.read({id:"1-ABCDEFGH",title:"T",pages,config,key:"key"});
  await assert.rejects(()=>f.engine.translate({session,selection:"x".repeat(12001),config,key:"key"}),/12000/);
});
await test("hierarchical synthesis reads all fragments of long papers",async()=>{
  const records=new Map(),seen=new Set();let reduceCalls=0;
  const store={async load(id){return records.get(id);},async save(id,s){records.set(id,structuredClone(s));}};
  const bigPages=Array.from({length:40},(_,i)=>({pageIndex:i,label:String(i+1),text:"Source for page "+i}));
  const llm={async json(cfg,key,system,prompt){
    const p=JSON.parse(prompt);
    if(p.task.startsWith("Read this")){seen.add(p.source.pageIndex);return {data:{summary:"Evidence ".repeat(250),facts:[],glossary:[],highlights:[]},usage:{input:1,output:1}};}
    if(p.task.startsWith("Combine")){reduceCalls++;return {data:{summary:"Combined evidence",facts:[],glossary:[]},usage:{input:1,output:1}};}
    return {data:{overview:"Overall analysis",researchQuestion:"A question",methods:["A method"],findings:[{claim:"Result"}]},usage:{input:1,output:1}};
  }};
  const engine=new Engine({store,llm});const s=await engine.read({id:"1-LONGTEXT",title:"Long",pages:bigPages,config,key:"key"});
  equal(seen.size,40);check(reduceCalls>1);equal(s.status,"ready");
});
console.log("\n"+passed+" tests passed. These are offline logic tests; no live model calls or Zotero GUI involved.");
