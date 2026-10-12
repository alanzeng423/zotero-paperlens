(function (root) {
  "use strict";
  const C = root.PaperLensCore;
  const PROVIDERS = Object.freeze({
    openai: { name: "OpenAI", baseURL: "https://api.openai.com/v1", model: "gpt-4.1-mini", protocol: "openai" },
    anthropic: { name: "Anthropic · Claude", baseURL: "https://api.anthropic.com/v1", model: "claude-sonnet-4-6", protocol: "anthropic" },
    deepseek: { name: "DeepSeek", baseURL: "https://api.deepseek.com", model: "deepseek-chat", protocol: "openai" },
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
  function request(config, key, system, prompt, maxTokens = 4096) {
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
      path = "/chat/completions";
    }
    return { url: base + path, headers, body: JSON.stringify(body) };
  }
  function response(config, raw) {
    const data = typeof raw === "string" ? C.parseJSON(raw) : raw;
    let text, usage;
    if (PROVIDERS[config.provider].protocol === "anthropic") {
      if (data.stop_reason === "max_tokens") throw new Error("模型输出被截断，请减小分段大小或更换模型。");
      text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
      usage = { input: data.usage?.input_tokens || 0, output: data.usage?.output_tokens || 0 };
    } else {
      const choice = data.choices?.[0];
      if (choice?.finish_reason === "length") throw new Error("模型输出被截断，请减小分段大小或更换模型。");
      text = choice?.message?.content;
      usage = { input: data.usage?.prompt_tokens || 0, output: data.usage?.completion_tokens || 0 };
    }
    if (typeof text !== "string" || !text.trim()) throw new Error("模型没有返回文本，可能被内容过滤或当前模型不兼容。");
    return { text, usage };
  }
  class Client {
    constructor({ transport, sleep }) { this.transport = transport; this.sleep = sleep; }
    async complete(config, key, system, prompt, signal, maxTokens) {
      for (let attempt = 0; attempt < 3; attempt++) {
        C.abort(signal);
        try {
          const res = await this.transport({ ...request(config, key, system, prompt, maxTokens), signal });
          C.abort(signal);
          if (res.status < 200 || res.status >= 300) {
            const error = new Error(res.status === 401 || res.status === 403
              ? "API 认证失败，请检查 Key、账号权限和服务地址。"
              : res.status === 429 ? "API 请求限流，请稍后继续阅读。"
                : "模型请求失败（HTTP " + res.status + "）。请检查模型名和服务设置。");
            error.status = res.status;
            throw error;
          }
          return response(config, res.body);
        } catch (error) {
          C.abort(signal);
          if (attempt === 2 || !(error.status === 429 || error.status >= 500)) throw error;
          await this.sleep(1000 * 2 ** attempt, signal);
        }
      }
    }
    async json(config, key, system, prompt, signal, maxTokens) {
      const result = await this.complete(config, key, system + "\nReturn a single JSON object only, no Markdown.", prompt, signal, maxTokens);
      return { data: C.parseJSON(result.text), usage: result.usage };
    }
  }
  root.PaperLensLLM = Object.freeze({ PROVIDERS, endpoint, request, response, Client });
})(globalThis);
