// Worker-side adapters. Identical fan-out logic to server/adapters.js but
// keys come from `env.<NAME>` (set via `wrangler secret put`) instead of
// process.env. BYOK from req.body.keys still takes precedence.

import { SYSTEM, buildUser, parseJson } from "./prompt.js";

const TIMEOUT_MS = 20_000;

async function postJson(url, headers, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text()}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function chatCompletions({ url, defaultModel, extraHeaders = {} }) {
  return async (text, key, model) => {
    const j = await postJson(url, { authorization: `Bearer ${key}`, ...extraHeaders }, {
      model: model || defaultModel,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUser(text) },
      ],
      response_format: { type: "json_object" },
    });
    return parseJson(j?.choices?.[0]?.message?.content);
  };
}

async function anthropicRun(text, key, model) {
  const j = await postJson(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": key, "anthropic-version": "2023-06-01" },
    {
      model: model || "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: "user", content: buildUser(text) }],
    },
  );
  return parseJson(j?.content?.[0]?.text);
}

async function googleRun(text, key, model) {
  const m = model || "gemini-1.5-pro";
  const j = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`,
    {},
    {
      systemInstruction: { role: "system", parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: buildUser(text) }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    },
  );
  return parseJson(j?.candidates?.[0]?.content?.parts?.[0]?.text);
}

async function minimaxRun(text, key, model) {
  const j = await postJson(
    "https://api.minimax.chat/v1/text/chatcompletion_v2",
    { authorization: `Bearer ${key}` },
    {
      model: model || "abab6.5s-chat",
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUser(text) },
      ],
    },
  );
  return parseJson(j?.choices?.[0]?.message?.content);
}

const personal = (envName, clientField) => (req, env) =>
  req?.keys?.[clientField] || env?.[envName] || "";

export const ADAPTERS = [
  {
    name: "openai",
    keyFor: personal("OPENAI_API_KEY", "openai"),
    defaultModel: "gpt-4o",
    suggestedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4.1", "gpt-4.1-mini", "o3-mini"],
    run: chatCompletions({ url: "https://api.openai.com/v1/chat/completions", defaultModel: "gpt-4o" }),
  },
  {
    name: "anthropic",
    keyFor: personal("ANTHROPIC_API_KEY", "anthropic"),
    defaultModel: "claude-sonnet-4-6",
    suggestedModels: [
      "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6", "claude-sonnet-4-5",
      "claude-haiku-4-5-20251001", "claude-3-5-sonnet-latest", "claude-3-5-haiku-latest",
    ],
    run: anthropicRun,
  },
  {
    name: "google",
    keyFor: personal("GOOGLE_API_KEY", "google"),
    defaultModel: "gemini-1.5-pro",
    suggestedModels: ["gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    run: googleRun,
  },
  {
    name: "llama",
    keyFor: personal("TOGETHER_API_KEY", "together"),
    defaultModel: "meta-llama/Llama-3.1-70B-Instruct-Turbo",
    suggestedModels: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "meta-llama/Llama-3.1-405B-Instruct-Turbo",
      "meta-llama/Llama-3.1-70B-Instruct-Turbo",
      "meta-llama/Llama-3.1-8B-Instruct-Turbo",
    ],
    run: chatCompletions({
      url: "https://api.together.xyz/v1/chat/completions",
      defaultModel: "meta-llama/Llama-3.1-70B-Instruct-Turbo",
    }),
  },
  {
    name: "mistral",
    keyFor: personal("MISTRAL_API_KEY", "mistral"),
    defaultModel: "mistral-large-latest",
    suggestedModels: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest", "open-mixtral-8x22b"],
    run: chatCompletions({ url: "https://api.mistral.ai/v1/chat/completions", defaultModel: "mistral-large-latest" }),
  },
  {
    name: "cohere",
    keyFor: personal("COHERE_API_KEY", "cohere"),
    defaultModel: "command-r-plus",
    suggestedModels: ["command-r-plus", "command-r", "command-a-03-2025"],
    run: chatCompletions({ url: "https://api.cohere.com/v2/chat", defaultModel: "command-r-plus" }),
  },
  {
    name: "deepseek",
    keyFor: personal("DEEPSEEK_API_KEY", "deepseek"),
    defaultModel: "deepseek-chat",
    suggestedModels: ["deepseek-chat", "deepseek-reasoner", "deepseek-v3"],
    run: chatCompletions({ url: "https://api.deepseek.com/v1/chat/completions", defaultModel: "deepseek-chat" }),
  },
  {
    name: "qwen",
    keyFor: personal("QWEN_API_KEY", "qwen"),
    defaultModel: "qwen-max",
    suggestedModels: ["qwen-max", "qwen-plus", "qwen-turbo", "qwen2.5-72b-instruct"],
    run: chatCompletions({
      url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
      defaultModel: "qwen-max",
    }),
  },
  {
    name: "grok",
    keyFor: personal("XAI_API_KEY", "xai"),
    defaultModel: "grok-2-latest",
    suggestedModels: ["grok-4", "grok-3", "grok-2-latest", "grok-2-1212", "grok-beta"],
    run: chatCompletions({ url: "https://api.x.ai/v1/chat/completions", defaultModel: "grok-2-latest" }),
  },
  {
    name: "perplexity",
    keyFor: personal("PERPLEXITY_API_KEY", "perplexity"),
    defaultModel: "sonar",
    suggestedModels: ["sonar", "sonar-pro", "sonar-reasoning", "sonar-reasoning-pro"],
    run: chatCompletions({ url: "https://api.perplexity.ai/chat/completions", defaultModel: "sonar" }),
  },
  {
    name: "kimi",
    keyFor: personal("MOONSHOT_API_KEY", "moonshot"),
    defaultModel: "moonshot-v1-32k",
    suggestedModels: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-k2"],
    run: chatCompletions({ url: "https://api.moonshot.cn/v1/chat/completions", defaultModel: "moonshot-v1-32k" }),
  },
  {
    name: "minimax",
    keyFor: personal("MINIMAX_API_KEY", "minimax"),
    defaultModel: "abab6.5s-chat",
    suggestedModels: ["abab6.5s-chat", "abab6.5g-chat", "abab6.5t-chat", "MiniMax-Text-01"],
    run: minimaxRun,
  },
];

export function modelFor(adapter, req) {
  return req?.models?.[adapter.name] || "";
}
