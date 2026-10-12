/* Local reader UI. All paper/model text stays inert via textContent. */
"use strict";
window.PaperLensPanel={
  app:null,reader:null,session:null,id:null,busy:false,selection:null,result:null,locale:"zh-CN",native:false,currentView:"reading",
  $(id){return document.getElementById(id);},
  t(key,args){return window.PaperLensI18n.t(this.locale,key,args);},
  error(error){return window.PaperLensI18n.error(this.locale,error?.message||error);},
  text(node,value){if(node.namespaceURI==="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul")node.setAttribute("label",value);else node.textContent=value;},
  element(tag,text,className){
    const namespace=this.native&&tag==="button"?"http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul":"http://www.w3.org/1999/xhtml";
    const node=document.createElementNS(namespace,tag);
    if(namespace.includes("there.is.only.xul"))node.setAttribute("native","true");
    if(text!==undefined)this.text(node,text);if(className)node.setAttribute("class",className);return node;
  },
  on(node,handler){node.addEventListener(this.native&&node.namespaceURI.includes("there.is.only.xul")?"command":"click",event=>{event.preventDefault();handler(event);});},
  action(id,handler){this.on(this.$(id),handler);},
  nativeControls(){
    if(!this.native)return;
    for(const button of [...document.querySelectorAll("button")]){
      const replacement=this.element("button",button.textContent);
      for(const attr of button.attributes)replacement.setAttribute(attr.name,attr.value);
      replacement.setAttribute("native","true");button.replaceWith(replacement);
    }
    const parent=window.frameElement?.ownerDocument?.defaultView||this.app.Z.getMainWindow();
    const copyTheme=()=>{
      const style=parent.getComputedStyle(parent.document.documentElement);
      for(const key of ["--fill-primary","--fill-secondary","--material-sidepane","--material-background","--color-border","--color-invalid","--accent-blue"]){
        const value=style.getPropertyValue(key);if(value)document.documentElement.style.setProperty(key,value);
      }
      const font=parent.getComputedStyle(parent.document.body||parent.document.documentElement).font;
      if(font)document.body.style.font=font;
    };
    copyTheme();
    this.themeObserver=new MutationObserver(copyTheme);this.themeObserver.observe(parent.document.documentElement,{attributes:true});
    window.addEventListener("unload",()=>this.themeObserver.disconnect(),{once:true});
  },
  notify(text,error=false){const node=this.$("notice");node.hidden=false;node.textContent=text;node.classList.toggle("error",error);},
  clearNotice(){this.$("notice").hidden=true;},
  view(name){
    this.currentView=name;
    for(const node of document.querySelectorAll(".view"))node.hidden=node.id!=="view-"+name;
    for(const node of document.querySelectorAll(".nav")){const selected=node.dataset.view===name;node.classList.toggle("active",selected);node.setAttribute("aria-selected",String(selected));node.setAttribute("tabindex",selected?"0":"-1");}
    if(!this.busy)this.clearNotice();
  },
  applyLanguage(locale){
    this.locale=locale;document.documentElement.lang=locale;this.$("ui-language").value=locale;
    for(const node of document.querySelectorAll("[data-i18n]"))this.text(node,this.t(node.dataset.i18n));
    for(const node of document.querySelectorAll("[data-i18n-placeholder]"))node.setAttribute("placeholder",this.t(node.dataset.i18nPlaceholder));
    for(const node of document.querySelectorAll("[data-i18n-aria]"))node.setAttribute("aria-label",this.t(node.dataset.i18nAria));
    this.clearNotice();this.keyStatus();this.meta();this.renderSession();this.renderHistory();
    if(this.result)this.renderTranslation(this.result,false);
    if(this.lastProgress&&this.busy)this.progress(this.lastProgress);
    this.sourceSummary();
  },
  async init(){
    const context=window.arguments?.[0]||window.frameElement?.PaperLensContext;
    if(!context)throw new Error(this.t("readerMissing"));
    const {app,reader,selection,embedded,onReady,onResize}=context;this.app=app;this.reader=reader;this.native=!!app.Z;
    document.body.classList.toggle("embedded",!!embedded);
    const identity=app.identity(reader);this.id=identity.id;this.$("paper-title").textContent=identity.title;document.title="PaperLens · "+identity.title;
    this.nativeControls();this.settings();
    this.applyLanguage(app.uiLanguage?.()||"zh-CN");
    for(const button of document.querySelectorAll("[data-view]"))this.on(button,()=>this.view(button.dataset.view));
    this.$("panel-tabs").addEventListener("keydown",event=>{
      const tabs=[...document.querySelectorAll(".nav")],index=tabs.findIndex(tab=>tab.dataset.view===this.currentView);
      let next;if(event.key==="ArrowRight")next=(index+1)%tabs.length;else if(event.key==="ArrowLeft")next=(index+tabs.length-1)%tabs.length;else if(event.key==="Home")next=0;else if(event.key==="End")next=tabs.length-1;
      if(next!==undefined){event.preventDefault();this.view(tabs[next].dataset.view);tabs[next].focus();}
    });
    this.action("start-reading",()=>this.read());this.action("cancel",()=>app.cancel(this.id));
    this.action("cancel-translation",()=>app.cancel(this.id));this.action("translate",()=>this.translate());
    this.action("write-highlights",()=>this.writeHighlights());this.action("toggle-highlights",()=>this.visibility());
    this.$("selection").addEventListener("input",()=>this.sourceSummary());
    this.$("provider").addEventListener("change",()=>{
      const presets={openai:["https://api.openai.com/v1","gpt-4.1-mini"],anthropic:["https://api.anthropic.com/v1","claude-sonnet-4-6"],deepseek:["https://api.deepseek.com","deepseek-chat"],compatible:["http://localhost:11434/v1","qwen3:8b"]};
      const preset=presets[this.$("provider").value];this.$("base-url").value=preset[0];this.$("model").value=preset[1];this.$("api-key").value="";this.keyStatus();
    });
    this.$("ui-language").addEventListener("change",()=>{const locale=this.$("ui-language").value;if(app.setUILanguage)app.setUILanguage(locale);else this.applyLanguage(locale);});
    this.$("base-url").addEventListener("change",()=>this.keyStatus());
    this.$("settings-form").addEventListener("submit",event=>{event.preventDefault();this.saveSettings();});
    this.action("save-settings",()=>this.saveSettings());this.action("test-connection",()=>this.test());this.action("remove-key",()=>this.removeKey());
    await this.refresh();this.view("reading");onReady?.(this);
    if(onResize){this.sizeObserver=new ResizeObserver(()=>onResize(Math.ceil(document.body.getBoundingClientRect().height)));this.sizeObserver.observe(document.body);window.addEventListener("unload",()=>this.sizeObserver.disconnect(),{once:true});}
    if(selection)this.acceptSelection(selection);
  },
  configFields(){return {provider:this.$("provider").value,baseURL:this.$("base-url").value,model:this.$("model").value,language:this.$("language").value,chunkSize:Number(this.$("chunk-size").value),maxHighlights:Number(this.$("max-highlights").value)};},
  settings(){const config=this.app.config();for(const [id,key]of Object.entries({provider:"provider","base-url":"baseURL",model:"model",language:"language","chunk-size":"chunkSize","max-highlights":"maxHighlights"}))this.$(id).value=config[key];},
  keyStatus(){try{this.$("key-status").textContent=this.t(this.app.getKey(this.configFields())?"keySaved":"keyMissing");}catch(_){this.$("key-status").textContent=this.t("badEndpoint");}},
  meta(){
    const config=this.app.config();this.$("privacy").textContent=this.t("privacy",{endpoint:config.baseURL});
    this.$("start-reading").setAttribute("title",this.$("privacy").textContent);
    const session=this.session;this.$("coverage").textContent=session?this.t("coverage",{pages:session.totalPages,chunks:session.totalChunks}):"";
    if(session?.blankPages?.length)this.$("coverage").textContent+=" · "+this.t("blankPages",{pages:session.blankPages.map(index=>index+1).join(", ")});
    this.$("usage").textContent=session?this.t("usage",{input:session.usage.input.toLocaleString(),output:session.usage.output.toLocaleString()}):this.t("noCalls");
  },
  async saveSettings(){try{const config=await this.app.saveConfig(this.configFields(),this.$("api-key").value);this.$("api-key").value="";this.keyStatus();this.meta();this.notify(this.t("saved"));return config;}catch(error){this.notify(this.error(error),true);return null;}},
  async test(){const config=await this.saveSettings();if(!config)return;const button=this.$("test-connection");button.disabled=true;this.notify(this.t("connecting"));try{await this.app.test(config);this.notify(this.t("connected"));}catch(error){this.notify(this.error(error),true);}finally{button.disabled=false;}},
  async removeKey(){try{await this.app.saveConfig(this.configFields(),"",true);this.$("api-key").value="";this.keyStatus();this.notify(this.t("keyRemoved"));}catch(error){this.notify(this.error(error),true);}},
  setBusy(value){
    this.busy=value;for(const id of ["start-reading","translate","write-highlights","toggle-highlights","save-settings","test-connection","remove-key"])this.$(id).disabled=value;
    this.$("cancel").hidden=!value;this.$("cancel-translation").hidden=!value;
    this.$("ui-language").disabled=value;
  },
  async refresh(){this.session=await this.app.store.load(this.id);this.meta();this.renderSession();this.renderHistory();},
  renderSession(){
    const session=this.session,ready=session?.status==="ready";
    const status={reading:"reading",synthesizing:"synthesizing",ready:"ready",paused:"paused",error:"failed"};
    this.$("session-status").textContent=this.t(status[session?.status]||"unread");
    this.$("understanding").hidden=!ready;this.$("reading-intro").hidden=ready;
    this.text(this.$("start-reading"),this.t(ready?"reread":session?"resume":"read"));
    this.text(this.$("toggle-highlights"),this.t(session?.highlightsVisible===false?"showHighlights":"hideHighlights"));
    if(!ready)return;
    const target=this.$("digest");target.replaceChildren();
    const findings=this.block(this.t("findings")),list=this.element("ul");
    for(const finding of session.digest.findings){const item=this.element("li",finding.claim);if(finding.verified)item.append(this.element("span"," "),this.pageButton(finding.pageIndex));list.append(item);}
    findings.append(list);target.append(this.block(this.t("overview"),session.digest.overview),findings);
    const question=this.details(this.t("question"),session.digest.researchQuestion);target.append(question);
    target.append(this.listDetails(this.t("methods"),session.digest.methods),this.listDetails(this.t("limitations"),session.digest.limitations),this.listDetails(this.t("readingGuide"),session.digest.readingGuide));
    const notes=this.$("reading-notes");notes.replaceChildren();
    for(const part of session.rawChunks||[]){const note=session.notes[part.id];if(!note)continue;const entry=this.element("div",undefined,"entry");entry.append(this.pageButton(part.pageIndex),this.element("p",note.summary));notes.append(entry);}
    const highlights=this.$("highlights");highlights.replaceChildren();
    for(const highlight of session.highlights){const entry=this.element("div",undefined,"entry");entry.append(this.pageButton(highlight.pageIndex,highlight.pageLabel),this.element("p",highlight.quote,"quote"),this.element("p",highlight.reason,"muted"));highlights.append(entry);}
    this.renderTerms(this.$("glossary"),session.digest.glossary);
  },
  block(title,body){const node=this.element("section",undefined,"block");if(title)node.append(this.element("h3",title));if(body)node.append(this.element("p",body));return node;},
  details(title,body){const node=this.element("details");node.append(this.element("summary",title));if(body)node.append(this.element("p",body));return node;},
  listBlock(title,items){const node=this.block(title),list=this.element("ul");for(const item of items||[])list.append(this.element("li",item));node.append(list);return node;},
  listDetails(title,items){const node=this.details(title),list=this.element("ul");for(const item of items||[])list.append(this.element("li",item));node.append(list);return node;},
  pageButton(pageIndex,label){const button=this.element("button",this.t("pageLink",{page:label??pageIndex+1}),"page-link");this.on(button,()=>this.reader.navigate({pageIndex}));return button;},
  renderTerms(target,terms){target.replaceChildren();for(const term of terms||[]){const entry=this.element("div",undefined,"term");entry.append(this.element("strong",term.translation||term.term),this.element("span",term.term&&term.translation?" · "+term.term:""));if(term.meaning)entry.append(this.element("small",term.meaning));target.append(entry);}},
  progress(progress){
    this.lastProgress=progress;const labels={extracting:"extracting",reading:"reading",synthesizing:"synthesizing",ready:"ready"};
    this.$("progress-wrap").hidden=progress.phase==="ready";this.$("progress-label").textContent=this.t(labels[progress.phase]||"reading");
    this.$("progress-count").textContent=(progress.current||0)+" / "+(progress.total||0)+(progress.pageIndex!==undefined?" · "+this.t("progressPage",{page:progress.pageIndex+1}):"");
    this.$("progress").value=progress.total?100*(progress.current||0)/progress.total:0;this.$("session-status").textContent=this.t(labels[progress.phase]||"reading");
  },
  async read(){
    if(this.busy)return;const config=this.app.config();if(!this.app.getKey(config)&&config.provider!=="compatible"){this.view("settings");this.notify(this.t("needKey"),true);return;}
    this.setBusy(true);this.clearNotice();
    try{this.session=await this.app.analyze(this.reader,progress=>this.progress(progress));
      if(this.$("auto-highlight").checked){try{await this.app.createHighlights(this.reader,this.session);}catch(error){this.notify(this.t("highlightFailure",{error:this.error(error)}),true);}}
      await this.refresh();
    }catch(error){if(error.name!=="AbortError")this.notify(this.error(error),true);await this.refresh();}
    finally{this.setBusy(false);this.$("progress-wrap").hidden=true;}
  },
  async writeHighlights(){if(!this.session||this.busy)return;this.setBusy(true);try{const count=await this.app.createHighlights(this.reader,this.session);await this.refresh();this.notify(this.t("highlightsWritten",{count}));}catch(error){this.notify(this.error(error),true);}finally{this.setBusy(false);}},
  async visibility(){if(!this.session||this.busy)return;try{this.session=await this.app.setVisibility(this.reader,this.session.highlightsVisible===false);this.renderSession();}catch(error){this.notify(this.error(error),true);}},
  sourceSummary(){this.$("source-summary").textContent=this.t("source");},
  acceptSelection(selection){
    if(this.busy){this.notify(this.t("busy"));return;}
    this.selection=selection;this.result=null;this.$("translation-result").replaceChildren();this.$("selection").value=selection.text;this.$("selection-page").value=selection.pageIndex+1;this.sourceSummary();this.view("translation");
    if(this.session?.status==="ready")this.translate();else{this.$("source-details").open=true;this.notify(this.t("needSession"));}
  },
  async translate(){
    if(this.busy)return;if(this.session?.status!=="ready"){this.notify(this.t("needSession"),true);return;}
    const text=this.$("selection").value,pageIndex=Number(this.$("selection-page").value)-1;
    if(!text.trim()||!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=this.session.totalPages){this.notify(this.t("badSelection"),true);return;}
    this.setBusy(true);this.clearNotice();this.text(this.$("translate"),this.t("translating"));
    try{const result=await this.app.translate(this.reader,text,pageIndex);this.renderTranslation(result);await this.refresh();}
    catch(error){if(error.name!=="AbortError")this.notify(this.error(error),true);}
    finally{this.setBusy(false);this.text(this.$("translate"),this.t("translate"));}
  },
  renderTranslation(result,collapseSource=true){
    this.result=result;const target=this.$("translation-result");target.replaceChildren();
    target.append(this.element("p",result.translation,"translation"));if(result.explanation)target.append(this.block(this.t("explanation"),result.explanation));
    if(result.role)target.append(this.details(this.t("role"),result.role));
    if(result.terms?.length){const terms=this.details(this.t("glossary")+" ("+result.terms.length+")"),list=this.element("div");this.renderTerms(list,result.terms);terms.append(list);target.append(terms);}
    if(result.inference)target.append(this.details(this.t("inference"),result.inference));
    if(result.uncertainties?.length)target.append(this.listDetails(this.t("uncertainties"),result.uncertainties));
    if(result.citations?.length){const sources=this.details(this.t("sources")+" ("+result.citations.length+")");
      for(const citation of result.citations){const entry=this.element("div",undefined,"entry");entry.append(this.pageButton(citation.pageIndex,citation.pageLabel),this.element("p",citation.quote,"quote"));if(citation.supports)entry.append(this.element("p",citation.supports,"muted"));sources.append(entry);}target.append(sources);
    }
    if(collapseSource)this.$("source-details").open=false;
  },
  renderHistory(){
    const target=this.$("history");target.replaceChildren();
    for(const entry of this.session?.history||[]){const node=this.details(this.t("pageLink",{page:entry.pageIndex+1})+" · "+new Date(entry.result.createdAt).toLocaleString(this.locale));node.classList.add("entry");
      node.append(this.element("p",entry.result.translation));const button=this.element("button",this.t("showResult"));this.on(button,()=>{this.$("selection").value=entry.selection;this.$("selection-page").value=entry.pageIndex+1;this.sourceSummary();this.renderTranslation(entry.result);this.view("translation");});node.append(button);target.append(node);
    }
    if(!target.children.length)target.append(this.element("p",this.t("emptyHistory"),"muted"));
  }
};
window.addEventListener("DOMContentLoaded",()=>window.PaperLensPanel.init().catch(error=>window.PaperLensPanel.notify(window.PaperLensPanel.t("panelFailure",{error:window.PaperLensPanel.error(error)}),true)),{once:true});
