// Thin adapters — every provider gets the same prompt and returns the same
// shape. Each adapter exports { name, keyFor(req), run(text, key) }.
//
// `keyFor(req)` resolves the per-request key in priority order:
//   1. req.keys.<provider>     (BYOK — sent by the extension or Mac app)
//   2. process.env.<PROVIDER>  (server-side fallback)
// An adapter is "active" for a request iff keyFor() returns a truthy value.
//
// Most providers speak OpenAI-compatible /chat/completions, so they share one
// helper. Anthropic, Google and MiniMax have bespoke shapes.

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

function chatCompletions({ url, model, extraHeaders = {} }) {
  return async (text, key) => {
    const j = await postJson(url, { authorization: `Bearer ${key}`, ...extraHeaders }, {
      model,
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

async function anthropic(text, key) {
  const j = await postJson(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": key, "anthropic-version": "2023-06-01" },
    {
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: "user", content: buildUser(text) }],
    },
  );
  return parseJson(j?.content?.[0]?.text);
}

async function google(text, key) {
  const j = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${key}`,
    {},
    {
      systemInstruction: { role: "system", parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: buildUser(text) }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    },
  );
  return parseJson(j?.candidates?.[0]?.content?.parts?.[0]?.text);
}

async function minimax(text, key) {
  const j = await postJson(
    "https://api.minimax.chat/v1/text/chatcompletion_v2",
    { authorization: `Bearer ${key}` },
    {
      model: "abab6.5s-chat",
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

// Featherless has two flows:
//   - Personal: req.keys.featherless (the user pasted their own subscription)
//   - Community: req.keys.featherless_community === true → server's pool key
const FEATHERLESS_KEY = (req) => {
  if (req?.keys?.featherless) return req.keys.featherless;
  if (req?.keys?.featherless_community) return process.env.FEATHERLESS_COMMUNITY_KEY || "";
  return "";
};

export const ADAPTERS = [
  {
    name: "openai",
    keyFor: PERSONAL("OPENAI_API_KEY", "openai"),
    run: chatCompletions({ url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o" }),
  },
  {
    name: "anthropic",
    keyFor: PERSONAL("ANTHROPIC_API_KEY", "anthropic"),
    run: anthropic,
  },
  {
    name: "google",
    keyFor: PERSONAL("GOOGLE_API_KEY", "google"),
    run: google,
  },
  {
    name: "llama",
    keyFor: PERSONAL("TOGETHER_API_KEY", "together"),
    run: chatCompletions({
      url: "https://api.together.xyz/v1/chat/completions",
      model: "meta-llama/Llama-3.1-70B-Instruct-Turbo",
    }),
  },
  {
    name: "mistral",
    keyFor: PERSONAL("MISTRAL_API_KEY", "mistral"),
    run: chatCompletions({ url: "https://api.mistral.ai/v1/chat/completions", model: "mistral-large-latest" }),
  },
  {
    name: "cohere",
    keyFor: PERSONAL("COHERE_API_KEY", "cohere"),
    run: chatCompletions({ url: "https://api.cohere.com/v2/chat", model: "command-r-plus" }),
  },
  {
    name: "deepseek",
    keyFor: PERSONAL("DEEPSEEK_API_KEY", "deepseek"),
    run: chatCompletions({ url: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-chat" }),
  },
  {
    name: "qwen",
    keyFor: PERSONAL("QWEN_API_KEY", "qwen"),
    run: chatCompletions({
      url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
      model: "qwen-max",
    }),
  },
  {
    name: "grok",
    keyFor: PERSONAL("XAI_API_KEY", "xai"),
    run: chatCompletions({ url: "https://api.x.ai/v1/chat/completions", model: "grok-2-latest" }),
  },
  {
    name: "perplexity",
    keyFor: PERSONAL("PERPLEXITY_API_KEY", "perplexity"),
    run: chatCompletions({ url: "https://api.perplexity.ai/chat/completions", model: "sonar" }),
  },
  {
    name: "kimi",
    keyFor: PERSONAL("MOONSHOT_API_KEY", "moonshot"),
    run: chatCompletions({ url: "https://api.moonshot.cn/v1/chat/completions", model: "moonshot-v1-32k" }),
  },
  {
    name: "minimax",
    keyFor: PERSONAL("MINIMAX_API_KEY", "minimax"),
    run: minimax,
  },
  {
    name: "featherless",
    keyFor: FEATHERLESS_KEY,
    run: chatCompletions({
      url: "https://api.featherless.ai/v1/chat/completions",
      // Featherless routes a default model when the alias is omitted on some
      // plans; we pin a reliable open-weight to keep results deterministic.
      model: "meta-llama/Meta-Llama-3.1-70B-Instruct",
    }),
  },
];
