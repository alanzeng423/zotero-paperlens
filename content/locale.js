/* One UI language at a time; changing it never invalidates a paper session. */
(function (root) {
  "use strict";
  const messages={
    "zh-CN":{
      paper:"论文",translation:"翻译",history:"记录",settings:"设置",tabs:"功能",
      unread:"未读取",reading:"正在读取",synthesizing:"正在整理",ready:"已就绪",paused:"已暂停",failed:"未完成",
      read:"读取全文",resume:"继续读取",reread:"重新读取",stop:"停止",autoHighlight:"自动标出重点",
      writeHighlights:"写入高亮",hideHighlights:"隐藏高亮",showHighlights:"显示高亮",
      notes:"逐页笔记",highlights:"重点",glossary:"术语",overview:"概述",question:"研究问题",methods:"方法",
      findings:"主要发现",limitations:"局限",readingGuide:"阅读顺序",source:"原文",sources:"来源",explanation:"说明",
      role:"段落作用",inference:"推断",uncertainties:"待核对",sourcePlaceholder:"选取或粘贴原文",page:"页码",pageLink:"第 {page} 页",
      translate:"翻译",cancel:"取消",translating:"翻译中…",emptyHistory:"暂无记录",showResult:"查看",unverified:"引用未核对",
      provider:"服务商",baseURL:"服务地址",model:"模型",apiKey:"密钥",keyPlaceholder:"留空保留已有密钥",
      outputLanguage:"译文语言",uiLanguage:"界面语言",chinese:"简体中文",english:"英语",compatible:"自定义兼容服务",
      save:"保存",test:"测试连接",removeKey:"移除密钥",advanced:"高级设置",chunkSize:"分段字符数",maxHighlights:"重点上限",
      apiDetails:"服务与用量",privacy:"正文将发送至 {endpoint}，按服务计费。",coverage:"{pages} 页 · {chunks} 段",
      blankPages:"无文字页：{pages}",usage:"输入 {input} · 输出 {output} tokens",noCalls:"尚未调用模型",
      keySaved:"已保存，留空保留",keyMissing:"未保存密钥",badEndpoint:"请检查服务地址",saved:"已保存",connecting:"连接中…",connected:"连接成功",
      keyRemoved:"密钥已移除",needKey:"请先保存密钥",needSession:"请先读取全文",badSelection:"请输入原文和有效页码",
      extracting:"提取文字",progressPage:"第 {page} 页",highlightFailure:"读取完成，高亮写入失败：{error}",highlightsWritten:"已写入 {count} 条高亮",
      panelFailure:"面板加载失败：{error}",readerMissing:"未连接阅读器",operationFailed:"操作失败，请检查设置与日志",
      categoryQuestion:"研究问题",categoryMethod:"方法",categoryResult:"结果",categoryLimitation:"局限",categoryOther:"重点",
      busy:"当前论文有任务正在运行",selectionPopup:"结合全文翻译"
    },
    "en-US":{
      paper:"Paper",translation:"Translate",history:"History",settings:"Settings",tabs:"Views",
      unread:"Not read",reading:"Reading",synthesizing:"Summarizing",ready:"Ready",paused:"Paused",failed:"Incomplete",
      read:"Read paper",resume:"Resume",reread:"Read again",stop:"Stop",autoHighlight:"Highlight key passages",
      writeHighlights:"Add highlights",hideHighlights:"Hide highlights",showHighlights:"Show highlights",
      notes:"Page notes",highlights:"Key passages",glossary:"Terms",overview:"Overview",question:"Research question",methods:"Methods",
      findings:"Findings",limitations:"Limitations",readingGuide:"Reading order",source:"Source text",sources:"Sources",explanation:"Context",
      role:"Passage role",inference:"Inference",uncertainties:"To verify",sourcePlaceholder:"Select or paste text",page:"Page",pageLink:"Page {page}",
      translate:"Translate",cancel:"Cancel",translating:"Translating…",emptyHistory:"No history",showResult:"View",unverified:"Unverified reference",
      provider:"Provider",baseURL:"Endpoint",model:"Model",apiKey:"API key",keyPlaceholder:"Leave blank to keep the saved key",
      outputLanguage:"Output language",uiLanguage:"Interface language",chinese:"Simplified Chinese",english:"English",compatible:"Custom compatible API",
      save:"Save",test:"Test connection",removeKey:"Remove key",advanced:"Advanced",chunkSize:"Chunk characters",maxHighlights:"Highlight limit",
      apiDetails:"Service and usage",privacy:"Text is sent to {endpoint}. Provider fees apply.",coverage:"{pages} pages · {chunks} chunks",
      blankPages:"Pages without text: {pages}",usage:"{input} input · {output} output tokens",noCalls:"No model calls yet",
      keySaved:"Saved; leave blank to keep",keyMissing:"No saved key",badEndpoint:"Check the endpoint",saved:"Saved",connecting:"Connecting…",connected:"Connected",
      keyRemoved:"Key removed",needKey:"Save an API key first",needSession:"Read the paper first",badSelection:"Enter source text and a valid page",
      extracting:"Extracting text",progressPage:"Page {page}",highlightFailure:"Paper read; highlights failed: {error}",highlightsWritten:"Added {count} highlights",
      panelFailure:"Panel failed to load: {error}",readerMissing:"Reader unavailable",operationFailed:"Operation failed. Check settings and logs.",
      categoryQuestion:"Question",categoryMethod:"Method",categoryResult:"Result",categoryLimitation:"Limitation",categoryOther:"Passage",
      busy:"This paper has a running task",selectionPopup:"Translate with paper context"
    }
  };
  const errors={
    "模型输出达到上限，未返回完整结果。请减小分段字符数后重新读取。":"The model reached its output limit. Reduce the chunk size and read the paper again.",
    "模型输出被截断，请减小分段大小或更换模型。":"The model reached its output limit. Reduce the chunk size or use another model.",
    "操作已取消。":"Cancelled.","插件已关闭。":"The plugin is disabled.",
    "这篇论文已有任务正在运行，请等待或取消。":"This paper has a running task. Wait or cancel it.",
    "请等待当前任务完成后切换高亮。":"Wait for the current task before toggling highlights.",
    "尚未建立 session。":"Read the paper first.","请先建立全文阅读 session。":"Read the paper first.",
    "请先完成全文阅读。":"Finish reading the paper first.",
    "论文内容或阅读设置已改变，请先重新读取全文。":"The paper or reading settings changed. Read the paper again.",
    "论文或模型设置已改变，请先重新读取全文。":"The paper or model settings changed. Read the paper again.",
    "当前文献库为只读，无法写入高亮。":"This library is read-only. Highlights cannot be added.",
    "网络请求失败，请检查服务地址与网络连接。":"Network request failed. Check the endpoint and connection.",
    "模型请求超时，可继续已完成的阅读。":"The request timed out. Completed reading progress can be resumed.",
    "不支持的服务商。":"Unsupported provider.",
    "请检查模型、语言、分段大小（2000–24000）和重点数（1–40）。":"Check the model, language, chunk size (2000–24000), and highlight limit (1–40).",
    "当前 Zotero 阅读器接口不可用，请切回 PDF 模式并重新打开论文。":"The reader interface is unavailable. Reopen the PDF.",
    "PaperLens 侧栏尚未就绪，请重新打开 PDF。":"The sidebar is unavailable. Reopen the PDF.",
    "PaperLens 侧栏加载失败，请重新打开 PDF。":"The sidebar failed to load. Reopen the PDF.",
    "本地 session 无法读取；请备份后移除该 session 文件。":"The local session cannot be read. Back it up before removing its file."
  };
  function t(locale,key,args={}) {
    const value=(messages[locale]||messages["zh-CN"])[key]||key;
    return value.replace(/\{(\w+)\}/g,(_,name)=>String(args[name]??""));
  }
  function error(locale,value) {
    const text=String(value||"");
    if(locale!=="en-US")return text;
    return errors[text]||(/[\u3400-\u9fff]/.test(text)?t(locale,"operationFailed"):text);
  }
  root.PaperLensI18n={messages,t,error};
})(globalThis);
