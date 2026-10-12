(function (root) {
  "use strict";
  const C = root.PaperLensCore;
  const PROVIDERS = Object.freeze({
    openai: { name: "OpenAI", baseURL: "https://api.openai.com/v1", model: "gpt-4.1-mini", protocol: "openai" },
    anthropic: { name: "Anthropic · Claude", baseURL: "https://api.anthropic.com/v1", model: "claude-sonnet-4-6", protocol: "anthropic" },
    deepseek: { name: "DeepSeek", baseURL: "https://api.deepseek.com", model: "deepseek-flash", protocol: "openai" },
    compatible: { name: "自定义 · OpenAI 兼容", baseURL: "http://localhost:11434/v1", model: "qwen3:8b", protocol: "openai" }
  });
  function endpoint(config) {
    const raw = String(config.baseURL || "").trim().replace(/\/+$/, "").replace(/\/(chat\/completions|messages)$/, "");
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash) throw new Error("API 地址不能包含密码、查询参数或片段。");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new Error("远程 API 必须使用 HTTPS，本机服务可使用 HTTP。");
    return raw;
  }
  function request(config, key, system, prompt, maxTokens = 4096, options = {}) {
    const provider = PROVIDERS[config.provider];
    if (!provider || !String(config.model).trim()) throw new Error("请先设置服务商和模型。");
    const base = endpoint(config);
    if (!key && config.provider !== "compatible") throw new Error("请先在设置中保存 API Key。");
    const headers = { "Content-Type": "application/json" };
    let body, path;
    if (provider.protocol === "anthropic") {
      headers["x-api-key"] = key;
      headers["anthropic-version"] = "2023-06-01";
      body = { model: config.model, system, messages: [{ role: "user", content: prompt }], max_tokens: maxTokens };
      path = "/messages";
    } else {
      if (key) headers.Authorization = "Bearer " + key;
      body = { model: config.model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], stream: false };
      body[config.provider === "openai" ? "max_completion_tokens" : "max_tokens"] = maxTokens;
      if (config.provider === "deepseek") {
        // Current DeepSeek defaults to thinking; this pipeline needs structured
        // source notes, not a separate reasoning stream competing for the budget.
        body.thinking = { type: "disabled" };
        if (options.json) body.response_format = { type: "json_object" };
      }
      path = "/chat/completions";
    }
    return { url: base + path, headers, body: JSON.stringify(body) };
  }
  class OutputLimitError extends Error {
    constructor(usage) {
      super("模型输出达到上限，未返回完整结果。请减小分段字符数后重新读取。");
      this.code = "OUTPUT_LIMIT";
      this.usage = usage;
    }
  }
  function response(config, raw) {
    const data = typeof raw === "string" ? C.parseJSON(raw) : raw;
    let text, usage;
    if (PROVIDERS[config.provider].protocol === "anthropic") {
      usage = { input: data.usage?.input_tokens || 0, output: data.usage?.output_tokens || 0 };
      if (data.stop_reason === "max_tokens") throw new OutputLimitError(usage);
      text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
    } else {
      const choice = data.choices?.[0];
      usage = { input: data.usage?.prompt_tokens || 0, output: data.usage?.completion_tokens || 0 };
      if (choice?.finish_reason === "length") throw new OutputLimitError(usage);
      text = choice?.message?.content;
    }
    if (typeof text !== "string" || !text.trim()) throw new Error("模型没有返回文本，可能被内容过滤或当前模型不兼容。");
    return { text, usage };
  }
  class Client {
    constructor({ transport, sleep }) { this.transport = transport; this.sleep = sleep; }
    async complete(config, key, system, prompt, signal, maxTokens = 4096, options = {}) {
      let budget = config.provider === "deepseek" && options.json ? Math.min(32768, Math.max(8192, maxTokens * 2)) : maxTokens;
      let expanded = false, failures = 0;
      const spent = { input: 0, output: 0 };
      for (;;) {
        C.abort(signal);
        try {
          const res = await this.transport({ ...request(config, key, system, prompt, budget, options), signal });
          C.abort(signal);
          if (res.status < 200 || res.status >= 300) {
            const error = new Error(res.status === 401 || res.status === 403
              ? "API 认证失败，请检查 Key、账号权限和服务地址。"
              : res.status === 429 ? "API 请求限流，请稍后继续阅读。"
                : "模型请求失败（HTTP " + res.status + "）。请检查模型名和服务设置。");
            error.status = res.status;
            throw error;
          }
          const result = response(config, res.body);
          return { ...result, usage: { input: spent.input + result.usage.input, output: spent.output + result.usage.output } };
        } catch (error) {
          C.abort(signal);
          if (error.code === "OUTPUT_LIMIT") {
            spent.input += error.usage.input; spent.output += error.usage.output;
            if (!expanded && budget < 32768) {
              expanded = true;
              budget = Math.min(32768, budget * 2);
              continue;
            }
            error.usage = { ...spent };
            throw error;
          }
          if (failures === 2 || !(error.status === 429 || error.status >= 500)) throw error;
          await this.sleep(1000 * 2 ** failures++, signal);
        }
      }
    }
    async json(config, key, system, prompt, signal, maxTokens) {
      const result = await this.complete(config, key, system + "\nReturn a single JSON object only, no Markdown.", prompt, signal, maxTokens, { json: true });
      return { data: C.parseJSON(result.text), usage: result.usage };
    }
  }
  root.PaperLensLLM = Object.freeze({ PROVIDERS, endpoint, request, response, Client });
})(globalThis);
