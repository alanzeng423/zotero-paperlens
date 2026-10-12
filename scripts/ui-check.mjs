import fs from "node:fs/promises";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const require=createRequire(import.meta.url);
const packagePath=process.argv[2]||process.env.PAPERLENS_PLAYWRIGHT;
const {chromium}=require(packagePath||"playwright");
const browser=await chromium.launch({channel:process.env.PAPERLENS_BROWSER_CHANNEL||"msedge",headless:true});
try{
 const page=await browser.newPage({viewport:{width:380,height:780},colorScheme:"light"});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 let html=await fs.readFile(path.join(root,"content/panel.xhtml"),"utf8");
 const css=await fs.readFile(path.join(root,"content/panel.css"),"utf8");
 html=html.replace(/<\?xml[^>]*>/,"").replace('<link rel="stylesheet" href="panel.css"/>',"<style>"+css+"</style>")
  .replace('<script src="panel.js" defer="defer"></script>',"").replace('<script src="locale.js" defer="defer"></script>',"")
  .replace(/<link[^>]+href="chrome:[^>]+\/>/g,"");
 await page.setContent(html);
 await page.evaluate(()=>{
  const quote="Our method improves sample efficiency by 25 percent.";
  let saved=null,config={provider:"openai",baseURL:"https://api.openai.com/v1",model:"gpt-4.1-mini",language:"简体中文",chunkSize:10000,maxHighlights:14};
  window.__calls={write:0,translate:0,visible:0,key:null,navigations:[]};
  let locale="zh-CN";
  const app={uiLanguage:()=>locale,setUILanguage:value=>{locale=value;window.PaperLensPanel.applyLanguage(value);},identity:()=>({id:"1-ABCDEFGH",title:"Sample-efficient learning: a reproducible evaluation"}),
   config:()=>config,getKey:()=>"mock-key-not-real",saveConfig:(c,k)=>{config=c;if(k)window.__calls.key=k;return c;},
   store:{load:async()=>saved},cancel:()=>{},test:async()=>"OK",
   analyze:async(reader,onProgress)=>{
    onProgress({phase:"extracting",current:1,total:2});onProgress({phase:"reading",current:1,total:2,pageIndex:0});
    saved={id:"1-ABCDEFGH",status:"ready",totalPages:2,totalChunks:2,usage:{input:1400,output:650},highlightsVisible:true,blankPages:[],history:[],
     notes:{p0:{summary:"第 1 页：研究问题、方法概览与实验结论。"},p1:{summary:"第 2 页：讨论、适用范围与研究局限。"}},
     rawChunks:[{id:"p0",pageIndex:0,pageLabel:"1"},{id:"p1",pageIndex:1,pageLabel:"2"}],
     digest:{overview:"论文提出提高样本效率的方法，在有限数据集上报告了 25% 的相对提升。",researchQuestion:"在样本有限时，如何提升学习效率？",
      methods:["通过一致估计改进学习过程","与基线在同一实验条件下比较"],findings:[{claim:"样本效率提高了 25%。",quote,pageIndex:0,verified:true}],
      limitations:["仅在两个数据集上验证，不能直接推广到其他领域。"],readingGuide:["先看方法的假设","再检查效率指标和实验设置","最后阅读局限"],
      glossary:[{term:"sample efficiency",translation:"样本效率",meaning:"本文讨论单位样本带来的学习收益。"}]},
     highlights:[{quote,pageIndex:0,pageLabel:"1",reason:"方法的量化结果，阅读时需要结合指标定义与实验条件。",category:"result"}]};
    onProgress({phase:"ready",current:2,total:2});return saved;
   },createHighlights:async()=>{window.__calls.write++;return 1;},
   setVisibility:async(reader,visible)=>{saved.highlightsVisible=visible;window.__calls.visible++;return saved;},
   translate:async(reader,text,pageIndex)=>{
    window.__calls.translate++;
    const result={translation:"我们的方法将样本效率提高了 25%。",explanation:"该句概括了论文的主要量化结果。这里的 25% 是相对于实验基线的变化，阅读时需要核对指标定义与数据集范围。",
     role:"连接方法设计与实验验证的主要发现。",terms:[],inference:"",uncertainties:["结论只适用于论文报告的实验设置。"],
     citations:[{pageIndex:0,pageLabel:"1",quote,supports:"该句直接支持效率提升的结论。"}],createdAt:new Date().toISOString(),usage:{input:200,output:100}};
    saved.history.unshift({selection:text,pageIndex,result});return result;
   }};
  window.arguments=[{app,embedded:true,onReady:()=>window.__calls.ready=true,
   reader:{navigate:async({pageIndex})=>window.__calls.navigations.push(pageIndex)}}];
 });
 await page.addScriptTag({content:await fs.readFile(path.join(root,"content/locale.js"),"utf8")});
 await page.addScriptTag({content:await fs.readFile(path.join(root,"content/panel.js"),"utf8")});
 await page.evaluate(()=>window.PaperLensPanel.init());
 assert.equal(await page.evaluate(()=>window.__calls.ready),true);
 assert.equal(await page.locator(".tabs").evaluate(e=>Math.round(e.getBoundingClientRect().width)),380);
 const checkWidth=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),"Sidebar must not overflow horizontally");
 await page.locator('[data-view="settings"]').click();
 await page.locator("#provider").selectOption("anthropic");
 assert.equal(await page.locator("#base-url").inputValue(),"https://api.anthropic.com/v1");
 await page.locator("#api-key").fill("fake-test-key");await page.locator("#save-settings").click();
 await checkWidth();
 assert.equal(await page.locator("#api-key").inputValue(),"");
 await page.locator('[data-view="reading"]').click();
 await page.locator("#start-reading").click();await page.waitForFunction(()=>window.PaperLensPanel.session?.status==="ready"&&!window.PaperLensPanel.busy);
 assert.equal(await page.locator("#session-status").textContent(),"已就绪");
 assert.equal(await page.evaluate(()=>window.__calls.write),1);
 assert.equal(await page.locator("#reading-notes .entry").count(),2);
 await checkWidth();
 await page.locator("#toggle-highlights").click();assert.equal(await page.locator("#toggle-highlights").textContent(),"显示高亮");
 await page.evaluate(()=>window.PaperLensPanel.acceptSelection({text:"Our method improves sample efficiency by 25 percent.",pageIndex:0}));
 await page.waitForFunction(()=>window.__calls.translate===1&&!window.PaperLensPanel.busy);
 assert.ok((await page.locator("#translation-result").textContent()).includes("25%"));
 assert.equal(await page.locator("#source-details").evaluate(node=>node.open),false);
 assert.equal(await page.locator("#translation-result details[open]").count(),0);
 assert.ok((await page.locator("#translation-result .translation").boundingBox()).y<180,"Translation should appear near the top of the pane");
 await checkWidth();
 await page.locator("#translation-result details").filter({has:page.locator(".page-link")}).locator("summary").click();
 await page.locator("#translation-result .page-link").click();assert.deepEqual(await page.evaluate(()=>window.__calls.navigations),[0]);
 await page.locator("#translation-result details").filter({has:page.locator(".page-link")}).locator("summary").click();
 await page.evaluate(()=>window.scrollTo(0,0));
 await fs.mkdir(path.join(root,"dist"),{recursive:true});await page.screenshot({path:path.join(root,"dist","sidebar-preview.png"),fullPage:true});
 await page.setViewportSize({width:280,height:780});await checkWidth();
 await page.locator('[data-view="history"]').click();assert.equal(await page.locator("#history details.entry").count(),1);
 const sessionId=await page.evaluate(()=>window.PaperLensPanel.session.id);
 await page.locator('[data-view="settings"]').click();
 await page.locator("#ui-language").selectOption("en-US");
 assert.equal(await page.locator('[data-view="settings"]').textContent(),"Settings");
 assert.equal(await page.locator("#test-connection").textContent(),"Test connection");
 assert.ok((await page.locator("[data-i18n]").allTextContents()).every(text=>!/[\u3400-\u9fff]/.test(text)),"English labels must not contain a second Chinese version");
 assert.equal(await page.evaluate(()=>window.PaperLensPanel.session.id),sessionId);
 assert.equal(await page.locator("#provider").inputValue(),"anthropic");
 await page.locator("#ui-language").selectOption("zh-CN");assert.equal(await page.locator('[data-view="settings"]').textContent(),"设置");
 assert.ok((await page.locator("[data-i18n]").allTextContents()).every(text=>!/[A-Za-z]/.test(text)),"Chinese labels must not contain an English subtitle");
 // Model output must stay inert even in the privileged Zotero window.
 await page.evaluate(()=>window.PaperLensPanel.renderTranslation({translation:'<img src=x onerror="alert(1)">',explanation:"test",role:"",terms:[],uncertainties:[],citations:[]}));
 assert.equal(await page.locator("#translation-result img").count(),0);assert.deepEqual(errors,[]);
 console.log("UI checks passed: compact results, folded details, Chinese/English switching, settings, key clearing, sessions, highlights, citations, history and inert model text.");
 console.log("Preview uses synthetic paper/model data, not a live Zotero or provider.");
}finally{await browser.close();}
