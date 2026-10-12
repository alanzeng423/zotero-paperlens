/* Injected only into the temporary test XPI by check-install.py --sidebar. */
(async function () {
  "use strict";
  const result={ok:false,checks:[]};
  const check=(name,value)=>{if(!value)throw new Error(name);result.checks.push(name);};
  const data=Zotero.File.pathToFile(Zotero.DataDirectory.dir);
  const output=data.parent.clone();output.append("sidebar-probe.json");
  const mark=async stage=>{result.stage=stage;await Zotero.File.putContentsAsync(output.path,JSON.stringify(result,null,2));};
  function pdf(text) {
    const stream="BT /F1 12 Tf 50 720 Td ("+text+") Tj ET";
    const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Length "+stream.length+" >>\nstream\n"+stream+"\nendstream"];
    let bytes="%PDF-1.4\n",offsets=[0];
    objects.forEach((object,i)=>{offsets.push(bytes.length);bytes+=(i+1)+" 0 obj\n"+object+"\nendobj\n";});
    const start=bytes.length;bytes+="xref\n0 6\n0000000000 65535 f \n";
    for(const offset of offsets.slice(1))bytes+=String(offset).padStart(10,"0")+" 00000 n \n";
    return bytes+"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+start+"\n%%EOF\n";
  }
  async function paper(title,text) {
    await mark("creating "+title);
    const item=new Zotero.Item("journalArticle");item.setField("title",title);await item.saveTx();
    const file=data.clone();file.append(title+".pdf");await Zotero.File.putContentsAsync(file.path,pdf(text));
    const attachment=await Zotero.Attachments.importFromFile({file,parentItemID:item.id});
    await mark("opening "+title);
    return Zotero.Reader.open(attachment.id);
  }
  try {
    await Zotero.uiReadyPromise;
    const app=Zotero.PaperLens,win=Zotero.getMainWindow();
    await Zotero.Libraries.get(Zotero.Libraries.userLibraryID).waitForDataLoad("item");
    check("native section registered",!!app.paneID);
    const reader=await paper("PaperLens test A","Our method improves sample efficiency by 25 percent.");
    await mark("initializing reader A");await reader._initPromise;
    await mark("clicking native sidebar entry A");
    win.ZoteroContextPane.collapsed=false;
    await Zotero.Promise.delay(200);
    const button=[...win.ZoteroContextPane.sidenav.querySelectorAll(".btn[data-pane]")].find(node=>node.dataset.pane===app.paneID);
    check("native entry visible before menu use",!!button&&!button.parentElement.hidden);
    button.click();
    for(let i=0;i<100&&!([...app.sidebars.values()].some(binding=>binding.reader===reader&&binding.panel));i++)await Zotero.Promise.delay(50);
    const a=[...app.sidebars.values()].find(b=>b.reader===reader);
    check("sidebar document loaded in Zotero",!!a?.panel);
    check("sidebar title belongs to paper A",a.panel.$("paper-title").textContent==="PaperLens test A");
    check("compact embedded layout",a.frame.contentDocument.body.classList.contains("embedded"));
    check("real Zotero button controls",a.panel.$("start-reading").namespaceURI==="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul");
    check("native controls are visible",a.panel.$("start-reading").getBoundingClientRect().height>15);
    a.panel.$("start-reading").click();await Zotero.Promise.delay(50);
    check("native read button command works",a.panel.currentView==="settings");
    const originalConfig=JSON.stringify(app.config());app.setUILanguage("en-US");
    check("one English UI",a.panel.$("test-connection").getAttribute("label")==="Test connection");
    check("UI language preserves reading configuration",JSON.stringify(app.config())===originalConfig);
    app.setUILanguage("zh-CN");check("Chinese UI restored",a.panel.$("test-connection").getAttribute("label")==="测试连接");
    a.panel.$("api-key").value="fake-native-ui-test-key";a.panel.$("save-settings").click();
    for(let i=0;i<100&&app.getKey(app.config())!=="fake-native-ui-test-key";i++)await Zotero.Promise.delay(20);
    check("native save button stores the key",app.getKey(app.config())==="fake-native-ui-test-key");
    check("saved key input cleared",a.panel.$("api-key").value==="");
    await app.saveConfig(app.config(),"",true);
    check("right navigation icon present",[...win.ZoteroContextPane.sidenav.querySelectorAll("[data-pane]")].some(node=>node.dataset.pane===app.paneID));
    check("top toolbar entry removed",!reader._iframeWindow.document.querySelector(".paperlens-toolbar"));
    const pages=await app.pdf(reader);
    check("actual PDF text extracted",pages[0].text.includes("sample efficiency"));
    // No API keys or external model calls: unopened sessions only route text.
    await app.open(reader,{text:"Our method improves sample efficiency by 25 percent.",pageIndex:0});
    check("selection routed to sidebar",a.panel.$("selection").value.includes("sample efficiency"));
    check("translation view shown",!a.panel.$("view-translation").hidden);
    a.panel.view("settings");check("settings view shown",!a.panel.$("view-settings").hidden);
    const other=await paper("PaperLens test B","The second paper evaluates a different research question.");
    await other._initPromise;await app.open(other);
    const b=[...app.sidebars.values()].find(binding=>binding.reader===other);
    check("paper B has its own session context",!!b?.panel&&a.id!==b.id);
    await app.open(reader,{text:"Paper A selected again.",pageIndex:0});
    check("switching tabs returns to paper A",win.Zotero_Tabs.selectedID===reader.tabID&&a.panel.$("selection").value==="Paper A selected again.");
    check("paper B selection unaffected",b.panel.$("selection").value==="");
    const frame=a.frame;win.ZoteroContextPane.collapsed=true;win.ZoteroContextPane.collapsed=false;
    await app.open(reader);check("collapse preserves sidebar context",a.frame===frame&&a.panel.id===a.id);
    result.ok=true;
  } catch(error) {
    result.error=String(error);result.stack=error.stack;Zotero.logError(error);
  } finally {
    await Zotero.File.putContentsAsync(output.path,JSON.stringify(result,null,2));
    Zotero.debug("PaperLens sidebar probe: "+JSON.stringify(result));
  }
})();
