import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import vm from "node:vm";
import assert from "node:assert/strict";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
let passed=0;
async function test(name,fn){await fn();passed++;console.log("✓ "+name);}
const prefs=new Map(),logins=[],sections=new Map();
function file(p){return {path:p,append(s){this.path+="/"+s;},clone(){return file(this.path);},exists(){return false;}};}
const Z={initializationPromise:Promise.resolve(),DataDirectory:{dir:"C:/test-data"},
 File:{pathToFile:file},Prefs:{get:k=>prefs.get(k),set:(k,v)=>prefs.set(k,v)},getMainWindows:()=>[],
 Reader:{_readers:[],registerEventListener(){},unregisterEventListener(){}},
 ItemPaneManager:{registerSection:options=>{sections.set("paperlens-pane",options);return "paperlens-pane";},unregisterSection:id=>sections.delete(id)},
 getMainWindow:()=>({AbortController}),Promise:{delay:async()=>{}},logError:()=>{},
 Notifier:{registerObserver:()=>1,unregisterObserver:()=>{}},
 Items:{get:()=>({isPDFAttachment:()=>true,libraryID:1,key:"ABCDEFGH",getField:()=>"Paper"})}};
const Services={logins:{
 findLogins:(origin,action,realm)=>logins.filter(x=>x.origin===origin&&x.realm===realm),
 addLoginAsync:async login=>{await Promise.resolve();logins.push(login);},
 modifyLogin:async(old,login)=>{await Promise.resolve();logins[logins.indexOf(old)]=login;},
 removeLogin:async login=>{logins.splice(logins.indexOf(login),1);}},
 io:{newURI:s=>s},scriptloader:{loadSubScript:(url,target)=>vm.runInNewContext(fs.readFileSync(new URL(url),"utf8"),target)}};
const Components={classes:{
 "@mozilla.org/addons/addon-manager-startup;1":{getService:()=>({registerChrome:()=>({destruct(){}})})},
 "@mozilla.org/login-manager/loginInfo;1":{createInstance:()=>({init(origin,action,realm,user,password){Object.assign(this,{origin,realm,user,password});}})}},interfaces:{},utils:{}};
const scope={Zotero:Z,Services,Components,ChromeUtils:{},URL};
// Deliberately no global Cc/Ci/Cu aliases: bootstrap should use Components explicitly.
vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(root,"bootstrap.js"),"utf8"),scope);
await test("bootstrap loads without implicit Cc/Ci/Cu globals",async()=>{
 const rootURI=new URL("../",import.meta.url).href;
 await scope.startup({id:"paperlens@alanzeng.local",rootURI});assert.ok(Z.PaperLens);
});
const app=Z.PaperLens;
await test("native section is restricted to the PDF reader context",async()=>{
 const options=sections.get(app.paneID);assert.equal(options.sidenav.l10nID,"paperlens-sidenav");
 const reader={type:"pdf",tabID:"paper-a"};Z.Reader.getByTabID=id=>id===reader.tabID?reader:null;
 const body={closest:()=>({tabID:reader.tabID})};let enabled;
 options.onItemChange({body,setEnabled:v=>enabled=v});assert.equal(enabled,true);
 options.onItemChange({body:{closest:()=>({})},setEnabled:v=>enabled=v});assert.equal(enabled,false);
});
await test("sidebar binds the owning tab and preserves its frame on re-render",async()=>{
 const reader={type:"pdf",tabID:"paper-a",itemID:1};Z.Reader.getByTabID=id=>id===reader.tabID?reader:null;
 const doc={createElementNS:()=>({style:{},setAttribute(){},remove(){this.removed=true;}})};
 const body={closest:()=>({tabID:reader.tabID}),replaceChildren(frame){this.frame=frame;}};
 const binding=app.renderSidebar({body,doc});assert.equal(binding.reader,reader);
 assert.equal(binding.frame.PaperLensContext.embedded,true);
 assert.equal(app.renderSidebar({body,doc}),binding);
 const panel={};binding.frame.PaperLensContext.onReady(panel);assert.equal(await binding.ready,panel);
 let canceled=0;const cancel=app.cancel;app.cancel=()=>canceled++;
 const second={...body};app.renderSidebar({body:second,doc});
 app.disposeSidebar(body);assert.equal(canceled,0);
 app.disposeSidebar(second);assert.equal(canceled,1);app.cancel=cancel;
});
await test("selection opens the native pane of its own reader tab",async()=>{
 const selected=[],selection={text:"Selected source sentence.",pageIndex:0};let received;
 const reader={type:"pdf",tabID:"paper-a",itemID:1,_initPromise:Promise.resolve()};
 const body={closest:()=>({tabID:reader.tabID})};
 const section={querySelector:s=>s==="collapsible-section"?{open:false}:body};
 const details={render:async()=>{},getEnabledPane:()=>section,scrollToPane:async id=>selected.push(id)};
 const context={mode:"notes",collapsed:true};
 reader._window={Zotero_Tabs:{select:id=>selected.push(id)},ZoteroContextPane:context,document:{getElementById:()=>details}};
 const render=app.renderSidebar;app.renderSidebar=()=>({ready:Promise.resolve({acceptSelection:s=>received=s}),frame:{contentWindow:{}}});
 await app.open(reader,selection);assert.equal(context.mode,"item");assert.equal(context.collapsed,false);
 assert.deepEqual(selected,[reader.tabID,app.paneID]);assert.equal(received,selection);app.renderSidebar=render;
});
await test("Zotero 10.0.6 PDF extraction accepts cache-populating void method",async()=>{
 const chars=[..."A complete paper page."].map((c,i)=>({c,rect:[i,0,i+1,10],inlineRect:[i,0,i+1,10]}));
 const pdf={numPages:1,getPageLabels:async()=>["i"],getPage:async()=>({view:[0,0,100,100]})};
 const view={initializedPromise:Promise.resolve(),_iframeWindow:{PDFViewerApplication:{pdfDocument:pdf}},_pdfPages:[],
  async _ensureBasicPageData(i){this._pdfPages[i]={chars,viewBox:[0,0,100,100]};}};
 const pages=await app.pdf({_initPromise:Promise.resolve(),_internalReader:{_primaryView:view}});
 assert.equal(pages.length,1);assert.equal(pages[0].text,"A complete paper page.");assert.equal(pages[0].label,"i");
});
await test("API key is saved asynchronously and omitted from preferences",async()=>{
 await app.saveConfig(app.config(),"fake-key-1");assert.equal(app.getKey(app.config()),"fake-key-1");
 assert.ok(!JSON.stringify([...prefs]).includes("fake-key-1"));
 await app.saveConfig(app.config(),"fake-key-2");assert.equal(logins.length,1);assert.equal(app.getKey(app.config()),"fake-key-2");
});
await test("credential write failure preserves the existing key",async()=>{
 const original=Services.logins.modifyLogin;Services.logins.modifyLogin=async()=>{throw new Error("storage unavailable");};
 await assert.rejects(()=>app.saveConfig(app.config(),"fake-key-3"),/storage unavailable/);
 assert.equal(app.getKey(app.config()),"fake-key-2");Services.logins.modifyLogin=original;
});
await test("credential removal is scoped to the provider and base URL",async()=>{
 const other={...app.config(),provider:"deepseek",baseURL:"https://api.deepseek.com",model:"deepseek-chat"};
 await app.saveConfig(other,"other-fake-key");assert.equal(logins.length,2);
 await app.saveConfig(other,"",true);assert.equal(logins.length,1);assert.equal(app.getKey(other),"");
});
await scope.shutdown();assert.equal(Z.PaperLens,undefined);
assert.equal(sections.size,0);
console.log("\n"+passed+" Zotero adapter regressions passed with mocked platform interfaces.");
