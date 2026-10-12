var PaperLensScope = null;
var PaperLensChromeHandle = null;

async function startup({ id, rootURI }) {
  await Zotero.initializationPromise;
  const loader = Components.classes["@mozilla.org/addons/addon-manager-startup;1"].getService(Components.interfaces.amIAddonManagerStartup);
  PaperLensChromeHandle = loader.registerChrome(Services.io.newURI(rootURI + "manifest.json"),
    [["content", "paperlens", "content/"]]);
  PaperLensScope = { Zotero, Services, Cc:Components.classes, Ci:Components.interfaces, Cu:Components.utils, ChromeUtils, URL };
  PaperLensScope.globalThis = PaperLensScope;
  Services.scriptloader.loadSubScript(rootURI + "content/locale.js", PaperLensScope, "UTF-8");
  for (const file of ["core", "llm", "session", "zotero"]) {
    Services.scriptloader.loadSubScript(rootURI + "src/" + file + ".js", PaperLensScope, "UTF-8");
  }
  const app = new PaperLensScope.PaperLensApplication({ id, rootURI });
  Zotero.PaperLens = app;
  await app.startup();
  Zotero.debug?.("PaperLens: startup complete");
}
async function shutdown() {
  if (Zotero.PaperLens) await Zotero.PaperLens.shutdown();
  delete Zotero.PaperLens;
  PaperLensScope = null;
  PaperLensChromeHandle?.destruct();
  PaperLensChromeHandle = null;
}
function onMainWindowLoad({ window }) { Zotero.PaperLens?.addMenu(window); }
function onMainWindowUnload({ window }) { Zotero.PaperLens?.removeMenu(window); }
function install() {}
function uninstall() {}
