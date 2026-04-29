// Thin adapters — every provider gets the same prompt and returns the same
// shape. Each adapter exports:
//   { name, keyFor(req), defaultModel, suggestedModels, run(text, key, model) }
//
// `keyFor(req)` resolves a per-request key in priority order:
//   1. req.keys.<provider>     (BYOK — sent by the extension or Mac app)
//   2. process.env.<PROVIDER>  (server-side fallback)
//
// `run(text, key, model)` falls back to `defaultModel` when `model` is empty.
//
// `suggestedModels` is a curated, non-exhaustive list of popular options that
// the UI shows as autocomplete suggestions. Users can also type any other
// model name supported by that provider.

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

// OpenAI-compatible /chat/completions
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

const PERSONAL = (envName, clientField) => (req) =>
  req?.keys?.[clientField] || process.env[envName] || "";

const FEATHERLESS_KEY = (req) => {
  if (req?.keys?.featherless) return req.keys.featherless;
  if (req?.keys?.featherless_community) return process.env.FEATHERLESS_COMMUNITY_KEY || "";
  return "";
};

export const ADAPTERS = [
  {
    name: "openai",
    keyFor: PERSONAL("OPENAI_API_KEY", "openai"),
    defaultModel: "gpt-4o",
    suggestedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4.1", "gpt-4.1-mini", "o3-mini"],
    run: chatCompletions({ url: "https://api.openai.com/v1/chat/completions", defaultModel: "gpt-4o" }),
  },
  {
    name: "anthropic",
    keyFor: PERSONAL("ANTHROPIC_API_KEY", "anthropic"),
    defaultModel: "claude-sonnet-4-6",
    suggestedModels: [
      "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6", "claude-sonnet-4-5",
      "claude-haiku-4-5-20251001", "claude-3-5-sonnet-latest", "claude-3-5-haiku-latest",
    ],
    run: anthropicRun,
  },
  {
    name: "google",
    keyFor: PERSONAL("GOOGLE_API_KEY", "google"),
    defaultModel: "gemini-1.5-pro",
    suggestedModels: ["gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    run: googleRun,
  },
  {
    name: "llama",
    keyFor: PERSONAL("TOGETHER_API_KEY", "together"),
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
    keyFor: PERSONAL("MISTRAL_API_KEY", "mistral"),
    defaultModel: "mistral-large-latest",
    suggestedModels: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest", "open-mixtral-8x22b"],
    run: chatCompletions({ url: "https://api.mistral.ai/v1/chat/completions", defaultModel: "mistral-large-latest" }),
  },
  {
    name: "cohere",
    keyFor: PERSONAL("COHERE_API_KEY", "cohere"),
    defaultModel: "command-r-plus",
    suggestedModels: ["command-r-plus", "command-r", "command-a-03-2025"],
    run: chatCompletions({ url: "https://api.cohere.com/v2/chat", defaultModel: "command-r-plus" }),
  },
  {
    name: "deepseek",
    keyFor: PERSONAL("DEEPSEEK_API_KEY", "deepseek"),
    defaultModel: "deepseek-chat",
    suggestedModels: ["deepseek-chat", "deepseek-reasoner", "deepseek-v3"],
    run: chatCompletions({ url: "https://api.deepseek.com/v1/chat/completions", defaultModel: "deepseek-chat" }),
  },
  {
    name: "qwen",
    keyFor: PERSONAL("QWEN_API_KEY", "qwen"),
    defaultModel: "qwen-max",
    suggestedModels: ["qwen-max", "qwen-plus", "qwen-turbo", "qwen2.5-72b-instruct"],
    run: chatCompletions({
      url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
      defaultModel: "qwen-max",
    }),
  },
  {
    name: "grok",
    keyFor: PERSONAL("XAI_API_KEY", "xai"),
    defaultModel: "grok-2-latest",
    suggestedModels: ["grok-4", "grok-3", "grok-2-latest", "grok-2-1212", "grok-beta"],
    run: chatCompletions({ url: "https://api.x.ai/v1/chat/completions", defaultModel: "grok-2-latest" }),
  },
  {
    name: "perplexity",
    keyFor: PERSONAL("PERPLEXITY_API_KEY", "perplexity"),
    defaultModel: "sonar",
    suggestedModels: ["sonar", "sonar-pro", "sonar-reasoning", "sonar-reasoning-pro"],
    run: chatCompletions({ url: "https://api.perplexity.ai/chat/completions", defaultModel: "sonar" }),
  },
  {
    name: "kimi",
    keyFor: PERSONAL("MOONSHOT_API_KEY", "moonshot"),
    defaultModel: "moonshot-v1-32k",
    suggestedModels: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-k2"],
    run: chatCompletions({ url: "https://api.moonshot.cn/v1/chat/completions", defaultModel: "moonshot-v1-32k" }),
  },
  {
    name: "minimax",
    keyFor: PERSONAL("MINIMAX_API_KEY", "minimax"),
    defaultModel: "abab6.5s-chat",
    suggestedModels: ["abab6.5s-chat", "abab6.5g-chat", "abab6.5t-chat", "MiniMax-Text-01"],
    run: minimaxRun,
  },
  {
    name: "featherless",
    keyFor: FEATHERLESS_KEY,
    defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct",
    // Featherless hosts hundreds of models — these are popular ones.
    suggestedModels: [
      "meta-llama/Meta-Llama-3.1-70B-Instruct",
      "meta-llama/Meta-Llama-3.1-8B-Instruct",
      "Qwen/Qwen2.5-72B-Instruct",
      "mistralai/Mistral-Nemo-Instruct-2407",
      "deepseek-ai/DeepSeek-V3",
      "google/gemma-2-27b-it",
    ],
    run: chatCompletions({
      url: "https://api.featherless.ai/v1/chat/completions",
      defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct",
    }),
  },
];

/// Helper: pull the per-request model override (if any) for a given adapter.
export function modelFor(adapter, req) {
  return req?.models?.[adapter.name] || "";
}
