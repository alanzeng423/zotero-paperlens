/* Pure PDF/text helpers. No Zotero or network dependency. */
(function (root) {
  "use strict";
  const VERSION = 1;
  function normalize(text) {
    return String(text || "").normalize("NFKC").replace(/\u00ad/g, "")
      .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
      .replace(/\s+/g, " ").trim();
  }
  function hash(text) {
    let a = 2166136261, b = 2246822519;
    for (let i = 0; i < text.length; i++) {
      a = Math.imul(a ^ text.charCodeAt(i), 16777619);
      b = Math.imul(b ^ text.charCodeAt(i), 3266489917);
    }
    return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
  }
  function abort(signal) {
    if (signal?.aborted) {
      const e = new Error("操作已取消，可继续已完成的阅读。");
      e.name = "AbortError";
      throw e;
    }
  }
  function parseJSON(text) {
    const raw = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    let obj;
    try { obj = JSON.parse(raw); } catch (_) { throw new Error("模型没有返回有效 JSON，请重试或更换模型。"); }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("模型返回的数据格式不正确。");
    return obj;
  }
  function string(value, limit = 12000) {
    if (typeof value !== "string") return "";
    return value.slice(0, limit);
  }
  function strings(value, max = 30) {
    return Array.isArray(value) ? value.filter(x => typeof x === "string").slice(0, max).map(x => x.slice(0, 3000)) : [];
  }
  // Offset map stays attached to original PDF characters. Model coordinates are never trusted.
  function pageFromChars(chars, pageIndex, label, viewBox) {
    let raw = "", map = [];
    chars.forEach((char, i) => {
      if (char.ignorable) return;
      for (const unit of String(char.c || "")) {
        raw += unit;
        for (let k = 0; k < unit.length; k++) map.push(i);
      }
      if (char.spaceAfter || char.lineBreakAfter || char.paragraphBreakAfter) {
        raw += " "; map.push(i);
      }
    });
    return { pageIndex, label: String(label || pageIndex + 1), text: raw, map, chars, viewBox };
  }
  function canonicalMap(page) {
    let text = "", map = [];
    // Remove whitespace for quote matching, while retaining character offsets and punctuation.
    for (let i = 0; i < page.text.length; ) {
      const unit = String.fromCodePoint(page.text.codePointAt(i));
      let n = unit.normalize("NFKC").toLowerCase().replace(/\u00ad/g, "")
        .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"');
      for (const c of n) {
        if (/\s/.test(c)) continue;
        text += c;
        for (let k = 0; k < c.length; k++) map.push(page.map?.[i] ?? i);
      }
      i += unit.length;
    }
    return { text, map };
  }
  function quoteKey(quote) {
    return normalize(quote).toLowerCase().replace(/\s/g, "");
  }
  function locateQuote(page, quote) {
    const target = quoteKey(quote);
    if (target.length < 16) return null;
    const source = canonicalMap(page);
    const start = source.text.indexOf(target);
    // Ambiguous repeated text is deliberately not annotated.
    if (start < 0 || source.text.indexOf(target, start + 1) >= 0 || !page.chars?.length) return null;
    const first = source.map[start], last = source.map[start + target.length - 1];
    const selected = page.chars.slice(first, last + 1).filter(x => !x.ignorable);
    const rects = [];
    let rect = null;
    for (const char of selected) {
      const r = char.inlineRect || char.rect;
      if (!Array.isArray(r) || r.length !== 4 || !r.every(Number.isFinite)) return null;
      const sameLine = rect && Math.abs(rect[1] - r[1]) < 2 && Math.abs(rect[3] - r[3]) < 2;
      const close = rect && r[0] >= rect[0] - 2 && r[0] <= rect[2] + 24;
      if (rect && !(sameLine && close)) { rects.push(rect); rect = null; }
      rect = rect ? [Math.min(rect[0], r[0]), Math.min(rect[1], r[1]), Math.max(rect[2], r[2]), Math.max(rect[3], r[3])] : r.slice();
      if (char.lineBreakAfter || char.paragraphBreakAfter) { rects.push(rect); rect = null; }
    }
    if (rect) rects.push(rect);
    if (!rects.length || rects.length > 80) return null;
    const height = page.viewBox?.[3] || 1000;
    const top = Math.max(0, Math.floor(height - rects[0][3]));
    return {
      position: { pageIndex: page.pageIndex, rects: rects.map(r => r.map(n => Math.round(n * 1000) / 1000)) },
      sortIndex: String(page.pageIndex).padStart(5, "0") + "|" + String(first).padStart(6, "0") + "|" + String(top).padStart(5, "0")
    };
  }
  function chunks(pages, size = 10000, overlap = 300) {
    if (!Number.isInteger(size) || size < 2000 || overlap < 0 || overlap >= size) throw new Error("全文分段设置无效。");
    const result = [];
    // A fragment never crosses a PDF page; page references remain unambiguous.
    for (const page of pages) {
      const text = normalize(page.text);
      for (let start = 0; start < text.length; ) {
        let end = Math.min(text.length, start + size);
        if (end < text.length) {
          const boundary = text.lastIndexOf(" ", end);
          if (boundary > start + size * 0.7) end = boundary;
        }
        result.push({ id: "p" + (page.pageIndex + 1) + "-" + start,
          pageIndex: page.pageIndex, pageLabel: page.label, start, end, text: text.slice(start, end) });
        if (end === text.length) break;
        start = Math.max(start + 1, end - overlap);
      }
    }
    return result;
  }
  function terms(text) {
    return new Set(normalize(text).toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) || []);
  }
  function retrieve(chunks, query, pageIndex, glossary = [], budget = 22000) {
    const expanded = query + " " + glossary.filter(t => {
      const k = normalize(t.term).toLowerCase();
      return k && normalize(query).toLowerCase().includes(k);
    }).map(t => t.term + " " + t.translation + " " + t.meaning).join(" ");
    const q = terms(expanded);
    const ranked = chunks.map((c, i) => {
      const t = terms(c.text);
      let score = c.pageIndex === pageIndex ? 12 : 0;
      for (const word of q) if (t.has(word)) score += 1;
      return { c, i, score };
    }).sort((a, b) => b.score - a.score || a.i - b.i);
    let used = 0; const selected = [];
    for (const {c} of ranked) {
      if (used + c.text.length > budget) continue;
      selected.push(c); used += c.text.length;
      if (selected.length >= 6) break;
    }
    return selected.sort((a, b) => a.pageIndex - b.pageIndex || a.start - b.start);
  }
  function validHighlights(candidates, pages, max = 14) {
    const found = [], seen = new Set();
    for (const h of candidates || []) {
      const p = pages.find(p => p.pageIndex === h.pageIndex);
      const quote = string(h.quote, 1800), key = h.pageIndex + ":" + quoteKey(quote);
      if (!p || seen.has(key)) continue;
      const match = locateQuote(p, quote);
      if (!match) continue;
      seen.add(key);
      found.push({ ...match, pageIndex: h.pageIndex, pageLabel: p.label,
        quote, reason: string(h.reason, 2000), category: string(h.category, 60) });
      if (found.length >= max) break;
    }
    return found;
  }
  root.PaperLensCore = Object.freeze({ VERSION, normalize, hash, abort, parseJSON, string, strings,
    pageFromChars, locateQuote, chunks, retrieve, validHighlights });
})(globalThis);
