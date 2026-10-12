/* Zotero 9/10 integration. All private reader access is isolated here. */
(function (root) {
  "use strict";
  const C = root.PaperLensCore, L = root.PaperLensLLM;
  const PREF = "extensions.paperlens.";
  class Store {
    constructor(Z, Services) {
      this.Z = Z; this.Services = Services;
      this.base = Z.File.pathToFile(Z.DataDirectory.dir);
      this.base.append("paperlens");
      this.directory = this.base.clone(); this.directory.append("sessions");
      this.dir = this.directory.path;
      this.queues = new Map();
    }
    file(id) {
      if (!/^\d+-[A-Z0-9]{8}$/.test(id)) throw new Error("Session 标识无效。");
      const file = this.directory.clone(); file.append(id + ".json"); return file.path;
    }
    async load(id) {
      const file = this.file(id);
      if (!this.Z.File.pathToFile(file).exists()) return null;
      try { return JSON.parse(await this.Z.File.getContentsAsync(file)); }
      catch (_) { throw new Error("本地 session 无法读取；请备份后移除该 session 文件。"); }
    }
    async save(id, session) {
      const snapshot = JSON.stringify(session);
      const previous = this.queues.get(id) || Promise.resolve();
      const writing = previous.catch(() => {}).then(async () => {
        await this.Z.File.createDirectoryIfMissingAsync(this.base.path);
        await this.Z.File.createDirectoryIfMissingAsync(this.directory.path);
        await this.Z.File.putContentsAsync(this.file(id), snapshot);
      });
      this.queues.set(id,writing);
      try { await writing; } finally { if (this.queues.get(id) === writing) this.queues.delete(id); }
    }
  }
  class Application {
    constructor({id,rootURI}) {
      this.id=id; this.rootURI=rootURI; this.Z=root.Zotero; this.Services=root.Services;
      this.store = new Store(this.Z,this.Services);
      this.listeners=[]; this.panels=new Map(); this.sidebars=new Map(); this.jobs=new Map();
      this.nodes=new Set(); this.hiddenReaders=new Set(); this.closed=false;
      this.llm = new L.Client({transport:req=>this.transport(req),sleep:(ms,signal)=>this.sleep(ms,signal)});
      this.engine = new root.PaperLensSessions.Engine({llm:this.llm,store:this.store});
    }
    async startup() {
      for (const win of this.Z.getMainWindows()) this.addMenu(win);
      this.registerSidebar();
      this.listen("renderToolbar",({reader})=>{
        if(reader.type==="pdf"){
          this.applyVisibility(reader).catch(e=>this.Z.logError(e));
          this.refreshReaderSidebar(reader).catch(e=>this.Z.logError(e));
        }
      });
      this.listen("renderTextSelectionPopup",e=>this.selectionPopup(e));
      // Add entry to readers which were already open when the plugin was enabled.
      for (const reader of this.Z.Reader._readers || []) {
        await reader._initPromise;
        if(reader.type==="pdf"){
          await this.applyVisibility(reader);
          await this.refreshReaderSidebar(reader);
        }
      }
    }
    listen(type,handler) {
      this.Z.Reader.registerEventListener(type,handler,this.id);
      this.listeners.push({type,handler});
    }
    addMenu(win) {
      const doc=win.document;
      win.MozXULElement?.insertFTLIfNeeded("paperlens.ftl");
      if (doc.getElementById("paperlens-menu")) return;
      const popup=doc.getElementById("menu_ToolsPopup");
      if (!popup) return;
      const item=doc.createXULElement("menuitem");
      item.id="paperlens-menu"; item.setAttribute("label","PaperLens");
      item.addEventListener("command",()=>this.openFromMain(win));
      popup.append(item); this.nodes.add(item);
    }
    removeMenu(win) {
      win.document.getElementById("paperlens-menu")?.remove();
      win.document.querySelector('[href="paperlens.ftl"]')?.remove();
    }
    registerSidebar() {
      const icon="chrome://zotero/skin/16/universal/book.svg";
      this.paneID=this.Z.ItemPaneManager.registerSection({
        paneID:"paperlens",pluginID:this.id,
        header:{l10nID:"paperlens-section",icon},
        sidenav:{l10nID:"paperlens-sidenav",icon},
        onItemChange:props=>{
          const reader=this.sidebarReader(props.body);
          props.setEnabled(reader?.type==="pdf");
          const binding=this.sidebars.get(props.body);
          if(binding && binding.reader!==reader)this.disposeSidebar(props.body);
        },
        onRender:props=>this.renderSidebar(props),
        onDestroy:({body})=>this.disposeSidebar(body)
      });
      if(!this.paneID)throw new Error("无法注册 PaperLens 阅读器侧栏。");
    }
    sidebarReader(body) {
      const details=body.closest("item-details");
      return details?.tabID?this.Z.Reader.getByTabID(details.tabID):null;
    }
    async refreshReaderSidebar(reader) {
      await reader._initPromise;
      if(this.closed||!reader.tabID)return;
      const win=reader._window||this.Z.getMainWindow();
      const details=win.document.getElementById(reader.tabID+"-context");
      if(details)await details.render();
    }
    renderSidebar({body,doc}) {
      const reader=this.sidebarReader(body);
      if(reader?.type!=="pdf")return;
      let binding=this.sidebars.get(body);
      if(binding?.reader===reader)return binding;
      this.disposeSidebar(body);
      const {id}=this.identity(reader);
      const frame=doc.createElementNS("http://www.w3.org/1999/xhtml","iframe");
      frame.className="paperlens-sidebar";frame.setAttribute("title","PaperLens");
      frame.style.cssText="display:block;width:100%;height:160px;border:0;min-width:0;color-scheme:light dark;";
      binding={id,reader,frame,panel:null};
      binding.ready=new Promise(resolve=>binding.resolve=resolve);
      // The frame is a bundled privileged chrome document, never a remote page.
      frame.PaperLensContext={app:this,reader,embedded:true,onResize:height=>{
        const limit=Math.max(240,Math.min(1100,doc.defaultView.innerHeight*.8));
        frame.style.height=Math.ceil(Math.min(limit,Math.max(100,height)))+"px";
      },onReady:panel=>{
        if(this.sidebars.get(body)!==binding)return;
        binding.panel=panel;binding.resolve(panel);
      }};
      this.sidebars.set(body,binding);
      frame.src="chrome://paperlens/content/panel.xhtml";
      body.replaceChildren(frame);
      return binding;
    }
    disposeSidebar(body) {
      const binding=this.sidebars.get(body);if(!binding)return;
      this.sidebars.delete(body);binding.resolve(null);
      binding.frame.PaperLensContext=null;binding.frame.remove();
      if(![...this.sidebars.values()].some(b=>b.id===binding.id)&&!this.panels.has(binding.id))this.cancel(binding.id);
    }
    selectionPopup({reader,doc,params,append}) {
      if (reader.type !== "pdf" || !params.annotation?.text) return;
      const selection=params.annotation.text;
      const pageIndex=params.annotation.position?.pageIndex ?? 0;
      const button=doc.createElement("button"); button.textContent=this.t("selectionPopup");
      button.style.cssText="display:block;width:100%;margin-top:4px;padding:3px 6px;font:inherit;";
      button.addEventListener("click",()=>this.open(reader,{text:selection,pageIndex}).catch(e=>this.showError(reader,e)));
      button.className="paperlens-popup"; append(button);
    }
    async openFromMain(win) {
      try {
        let reader=this.Z.Reader.getByTabID(win.Zotero_Tabs?.selectedID);
        if (!reader) {
          const selected=win.ZoteroPane.getSelectedItems();
          let item=selected[0];
          if (item?.isRegularItem()) item=await item.getBestAttachment();
          if (!item?.isPDFAttachment()) throw new Error("请打开论文 PDF，或在文献库选中带 PDF 附件的论文。");
          reader=await this.Z.Reader.open(item.id);
        }
        await this.open(reader);
      } catch(e) { this.Services.prompt.alert(win,"PaperLens",e.message); }
    }
    identity(reader) {
      const item=this.Z.Items.get(reader.itemID);
      if (!item?.isPDFAttachment()) throw new Error("首版支持 Zotero 文献库中的 PDF 附件。");
      const parent=item.parentItem;
      return {id:item.libraryID+"-"+item.key,item,title:parent?.getField("title") || item.getField("title") || "Untitled paper"};
    }
    showError(reader,error) {
      this.Services.prompt.alert(reader._window||this.Z.getMainWindow(),"PaperLens",error.message);
    }
    async open(reader,selection) {
      await reader._initPromise;
      // Detached reader windows do not provide Zotero's item pane.
      if(!reader.tabID)return this.openFloating(reader,selection);
      const win=reader._window||this.Z.getMainWindow();
      win.Zotero_Tabs.select(reader.tabID);
      const context=win.ZoteroContextPane;
      context.mode="item";context.collapsed=false;
      let details=win.document.getElementById(reader.tabID+"-context");
      if(!details){await context._addItemContext(reader.tabID,reader.itemID,"reader");details=win.document.getElementById(reader.tabID+"-context");}
      await details.render();
      const section=details.getEnabledPane(this.paneID);
      if(!section)throw new Error("PaperLens 侧栏尚未就绪，请重新打开 PDF。");
      section.querySelector("collapsible-section").open=true;
      // Explicit rendering also handles an off-screen or previously collapsed section.
      const body=section.querySelector('[data-type="body"]');
      const binding=this.renderSidebar({body,doc:win.document});
      await details.scrollToPane(this.paneID,"instant");
      const panel=await Promise.race([binding.ready,this.Z.Promise.delay(10000).then(()=>null)]);
      if(!panel)throw new Error("PaperLens 侧栏加载失败，请重新打开 PDF。");
      if(selection)panel.acceptSelection(selection);
      return binding.frame.contentWindow;
    }
    openFloating(reader,selection) {
      const {id}=this.identity(reader);
      const existing=this.panels.get(id);
      if (existing && !existing.closed) {
        existing.focus();
        if (selection) existing.PaperLensPanel?.acceptSelection(selection);
        return existing;
      }
      const context={app:this,reader,selection};
      const win=this.Z.getMainWindow().openDialog("chrome://paperlens/content/panel.xhtml",
        "paperlens-"+id,"chrome,dialog=no,resizable,centerscreen,width=1080,height=790",context);
      this.panels.set(id,win);
      win.addEventListener("unload",()=>{
        if (this.panels.get(id)===win) this.panels.delete(id);
        // Closing the panel stops paid work; completed fragments remain resumable.
        this.cancel(id);
      },{once:true});
      return win;
    }
    config() {
      let saved;
      try { saved=JSON.parse(this.Z.Prefs.get(PREF+"config",true)||"{}"); } catch(_){ saved={}; }
      return {provider:"openai",...L.PROVIDERS[saved.provider || "openai"],language:"简体中文",
        chunkSize:10000,maxHighlights:14,...saved};
    }
    uiLanguage() {return this.Z.Prefs.get(PREF+"uiLanguage",true)==="en-US"?"en-US":"zh-CN";}
    t(key,args) {return root.PaperLensI18n.t(this.uiLanguage(),key,args);}
    setUILanguage(locale) {
      if(!["zh-CN","en-US"].includes(locale))throw new Error("Unsupported interface language");
      this.Z.Prefs.set(PREF+"uiLanguage",locale,true);
      for(const binding of this.sidebars.values())binding.panel?.applyLanguage(locale);
      for(const win of this.panels.values())win.PaperLensPanel?.applyLanguage(locale);
      for(const reader of this.Z.Reader._readers||[])for(const node of reader._iframeWindow?.document?.querySelectorAll(".paperlens-popup")||[])node.textContent=this.t("selectionPopup");
    }
    async saveConfig(config,apiKey,removeKey=false) {
      if (!L.PROVIDERS[config.provider]) throw new Error("不支持的服务商。");
      const clean={provider:config.provider,baseURL:L.endpoint(config),model:String(config.model).trim(),
        language:String(config.language||"简体中文").trim(),chunkSize:Number(config.chunkSize),
        maxHighlights:Number(config.maxHighlights)};
      if (!clean.model || !clean.language || !Number.isInteger(clean.chunkSize) || clean.chunkSize<2000 || clean.chunkSize>24000 ||
        !Number.isInteger(clean.maxHighlights)||clean.maxHighlights<1||clean.maxHighlights>40) throw new Error("请检查模型、语言、分段大小（2000–24000）和重点数（1–40）。");
      if (removeKey || apiKey?.trim()) await this.setKey(clean,removeKey?"":apiKey.trim());
      this.Z.Prefs.set(PREF+"config",JSON.stringify(clean),true);
      return clean;
    }
    realm(config) { return "PaperLens:"+config.provider+":"+L.endpoint(config); }
    getKey(config) {
      const found=this.Services.logins.findLogins("chrome://paperlens",null,this.realm(config));
      return found[0]?.password || "";
    }
    async setKey(config,key) {
      const existing=this.Services.logins.findLogins("chrome://paperlens",null,this.realm(config));
      if (!key) {for(const old of existing)await this.Services.logins.removeLogin(old);return;}
      const login=root.Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(root.Ci.nsILoginInfo);
      login.init("chrome://paperlens",null,this.realm(config),config.provider,key,"","");
      if(existing[0]) await this.Services.logins.modifyLogin(existing[0],login);
      else await this.Services.logins.addLoginAsync(login);
      for(const duplicate of existing.slice(1))await this.Services.logins.removeLogin(duplicate);
    }
    async pdf(reader,signal,onPage=()=>{}) {
      await reader._initPromise;
      const internal=reader._internalReader || reader._iframeWindow?.wrappedJSObject?.reader;
      const view=internal?._primaryView;
      await view?.initializedPromise;
      const app=view?._iframeWindow?.PDFViewerApplication;
      const pdf=app?.pdfDocument;
      if (!pdf || !view) throw new Error("当前 Zotero 阅读器接口不可用，请切回 PDF 模式并重新打开论文。");
      let labels;
      try { labels=await pdf.getPageLabels(); } catch(_){ labels=null; }
      const pages=[];
      for(let i=0;i<pdf.numPages;i++) {
        C.abort(signal); onPage(i,pdf.numPages);
        const page=await pdf.getPage(i+1);
        let data;
        if(typeof view._ensureBasicPageData==="function") data=await view._ensureBasicPageData(i,page);
        else if(typeof view._documentData?.ensurePage==="function") data=await view._documentData.ensurePage(i,page);
        else if(view._pdfPages?.[i]?.chars) data=view._pdfPages[i];
        // Zotero 10.0.6 populates the cache and resolves with undefined.
        data ||= view._pdfPages?.[i];
        if(!data?.chars) throw new Error("无法读取第 "+(i+1)+" 页的文字坐标；请确认 Zotero 9/10 阅读器兼容性。");
        const p=C.pageFromChars(Array.from(data.chars,x=>({
          c:x.c,rect:Array.from(x.rect||[]),inlineRect:x.inlineRect?Array.from(x.inlineRect):undefined,
          ignorable:x.ignorable,spaceAfter:x.spaceAfter,lineBreakAfter:x.lineBreakAfter,paragraphBreakAfter:x.paragraphBreakAfter
        })),i,labels?.[i] || i+1,Array.from(data.viewBox || page.view));
        pages.push(p);
      }
      C.abort(signal);
      return pages;
    }
    async run(id,task) {
      if(this.closed) throw new Error("插件已关闭。");
      if(this.jobs.has(id)) throw new Error("这篇论文已有任务正在运行，请等待或取消。");
      const Controller=this.Z.getMainWindow().AbortController;
      const controller=new Controller(); this.jobs.set(id,controller);
      try {return await task(controller.signal);}
      finally{if(this.jobs.get(id)===controller)this.jobs.delete(id);}
    }
    cancel(id) {this.jobs.get(id)?.abort();}
    async analyze(reader,onProgress) {
      const {id,title}=this.identity(reader),config=this.config(),key=this.getKey(config);
      return this.run(id,async signal=>{
        const pages=await this.pdf(reader,signal,(current,total)=>onProgress?.({phase:"extracting",current,total}));
        const s=await this.engine.read({id,title,pages,config,key,signal,onProgress});
        return s;
      });
    }
    async translate(reader,text,pageIndex) {
      const {id}=this.identity(reader),config=this.config(),key=this.getKey(config);
      return this.run(id,async signal=>{
        const s=await this.store.load(id);
        if(!s) throw new Error("请先建立全文阅读 session。");
        // Detect PDF replacement as well as language/provider/model changes.
        const pages=await this.pdf(reader,signal);
        if(s.signature!==this.engine.signature(pages,config)) throw new Error("论文内容或阅读设置已改变，请先重新读取全文。");
        return this.engine.translate({session:s,selection:text,pageIndex,config,key,signal});
      });
    }
    async test(config) {
      const key=this.getKey(config);
      const result=await this.llm.complete(config,key,"Reply briefly.","Say OK.",undefined,32);
      return result.text;
    }
    annotationItems(item) {
      return item.getAnnotations().filter(a=>a.getTags().some(t=>t.tag==="PaperLens:AI"));
    }
    async createHighlights(reader,session) {
      const {id,item}=this.identity(reader);
      return this.run(id,async signal=>{
        if(session.status!=="ready")throw new Error("请先完成全文阅读。");
        if(!item.isEditable()) throw new Error("当前文献库为只读，无法写入高亮。");
        const pages=await this.pdf(reader,signal);
        if(session.signature!==this.engine.signature(pages,this.config()))throw new Error("论文或模型设置已改变，请先重新读取全文。");
        const existing=this.annotationItems(item).filter(a=>a.getTags().some(t=>t.tag==="PaperLens:session:"+session.signature));
        const index=new Map(existing.map(a=>[a.annotationPageLabel+":"+C.normalize(a.annotationText),a]));
        const made=[];
        for(const h of session.highlights) {
          C.abort(signal);
          const prior=index.get(h.pageLabel+":"+C.normalize(h.quote));
          if(prior){made.push(prior);continue;}
          const annotation=await this.Z.Annotations.saveFromJSON(item,{
            key:this.Z.DataObjectUtilities.generateKey(),type:"highlight",color:"#a28ae5",
            text:h.quote,comment:"PaperLens · "+this.t({question:"categoryQuestion",method:"categoryMethod",result:"categoryResult",limitation:"categoryLimitation"}[h.category]||"categoryOther")+"\n"+h.reason,
            pageLabel:h.pageLabel,sortIndex:h.sortIndex,position:h.position,
            tags:[{name:"PaperLens:AI"},{name:"PaperLens:"+h.category},{name:"PaperLens:session:"+session.signature}]
          });
          made.push(annotation);
        }
        session.annotationKeys=made.map(a=>a.key);
        await this.store.save(id,session);
        await this.applyVisibility(reader,session);
        return made.length;
      });
    }
    async applyVisibility(reader,session) {
      const {id,item}=this.identity(reader);
      session ||= await this.store.load(id);
      if(!session)return;
      const annotations=this.annotationItems(item);
      if(session.highlightsVisible!==false) {
        await reader.setAnnotations(annotations); this.hiddenReaders.delete(reader);
      } else {
        await reader.unsetAnnotations(annotations.map(a=>a.key)); this.hiddenReaders.add(reader);
      }
    }
    async setVisibility(reader,visible) {
      const {id}=this.identity(reader);
      if(this.jobs.has(id))throw new Error("请等待当前任务完成后切换高亮。");
      const session=await this.store.load(id); if(!session)throw new Error("尚未建立 session。");
      session.highlightsVisible=!!visible; await this.store.save(id,session);
      for(const r of this.Z.Reader._readers||[]) if(r.itemID===reader.itemID)await this.applyVisibility(r,session);
      return session;
    }
    async transport({url,headers,body,signal}) {
      C.abort(signal);
      return new Promise((resolve,reject)=>{
        const xhr=new (this.Z.getMainWindow().XMLHttpRequest)();
        const cancel=()=>{xhr.abort();const e=new Error("操作已取消。");e.name="AbortError";reject(e);};
        const clean=()=>signal?.removeEventListener("abort",cancel);
        xhr.open("POST",url,true); xhr.timeout=180000;
        for(const [name,value]of Object.entries(headers))xhr.setRequestHeader(name,value);
        xhr.onload=()=>{clean();resolve({status:xhr.status,body:xhr.responseText});};
        xhr.onerror=()=>{clean();reject(new Error("网络请求失败，请检查服务地址与网络连接。"));};
        xhr.ontimeout=()=>{clean();reject(new Error("模型请求超时，可继续已完成的阅读。"));};
        xhr.onabort=()=>{clean();const e=new Error("操作已取消。");e.name="AbortError";reject(e);};
        signal?.addEventListener("abort",cancel,{once:true});
        if(signal?.aborted){cancel();return;}
        xhr.send(body);
      });
    }
    async sleep(ms,signal) {
      C.abort(signal); await this.Z.Promise.delay(ms); C.abort(signal);
    }
    async shutdown() {
      this.closed=true;
      for(const controller of this.jobs.values())controller.abort();
      for(const {type,handler}of this.listeners)this.Z.Reader.unregisterEventListener(type,handler);
      for(const body of [...this.sidebars.keys()])this.disposeSidebar(body);
      if(this.paneID)this.Z.ItemPaneManager.unregisterSection(this.paneID);
      for(const win of this.Z.getMainWindows())this.removeMenu(win);
      for(const reader of this.hiddenReaders) {
        try{await reader.setAnnotations(this.annotationItems(this.identity(reader).item));}catch(_){}
      }
      for(const win of this.panels.values())if(!win.closed)win.close();
      for(const reader of this.Z.Reader._readers||[]) {
        try{for(const node of reader._iframeWindow?.document?.querySelectorAll(".paperlens-popup")||[])node.remove();}catch(_){}
      }
      for(const node of this.nodes)try{node.remove();}catch(_){}
      this.listeners=[];this.nodes.clear();this.panels.clear();this.hiddenReaders.clear();
    }
  }
  root.PaperLensApplication=Application;
})(globalThis);
