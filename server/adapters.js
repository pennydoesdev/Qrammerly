// Thin adapters — every provider gets the same prompt and returns the same
// shape. Each adapter exports { name, enabled(), run(text) }.
//
// Most of these talk OpenAI-compatible /chat/completions, so we share one
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

// ---- OpenAI-compatible chat completions ------------------------------------
function chatCompletions({ url, key, model, extraHeaders = {} }) {
  return async (text) => {
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

// ---- Anthropic -------------------------------------------------------------
async function anthropic(text) {
  const j = await postJson(
    "https://api.anthropic.com/v1/messages",
    {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    {
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: "user", content: buildUser(text) }],
    },
  );
  return parseJson(j?.content?.[0]?.text);
}

// ---- Google Gemini ---------------------------------------------------------
async function google(text) {
  const key = process.env.GOOGLE_API_KEY;
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

// ---- MiniMax ---------------------------------------------------------------
async function minimax(text) {
  const j = await postJson(
    "https://api.minimax.chat/v1/text/chatcompletion_v2",
    { authorization: `Bearer ${process.env.MINIMAX_API_KEY}` },
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

// ---- Adapter list ----------------------------------------------------------
export const ADAPTERS = [
  {
    name: "openai",
    enabled: () => !!process.env.OPENAI_API_KEY,
    run: (t) => chatCompletions({
      url: "https://api.openai.com/v1/chat/completions",
      key: process.env.OPENAI_API_KEY,
      model: "gpt-4o",
    })(t),
  },
  {
    name: "anthropic",
    enabled: () => !!process.env.ANTHROPIC_API_KEY,
    run: anthropic,
  },
  {
    name: "google",
    enabled: () => !!process.env.GOOGLE_API_KEY,
    run: google,
  },
  {
    name: "llama",
    enabled: () => !!process.env.TOGETHER_API_KEY,
    run: (t) => chatCompletions({
      url: "https://api.together.xyz/v1/chat/completions",
      key: process.env.TOGETHER_API_KEY,
      model: "meta-llama/Llama-3.1-70B-Instruct-Turbo",
    })(t),
  },
  {
    name: "mistral",
    enabled: () => !!process.env.MISTRAL_API_KEY,
    run: (t) => chatCompletions({
      url: "https://api.mistral.ai/v1/chat/completions",
      key: process.env.MISTRAL_API_KEY,
      model: "mistral-large-latest",
    })(t),
  },
  {
    name: "cohere",
    enabled: () => !!process.env.COHERE_API_KEY,
    // Cohere's /v2/chat is OpenAI-shaped enough for our purposes.
    run: (t) => chatCompletions({
      url: "https://api.cohere.com/v2/chat",
      key: process.env.COHERE_API_KEY,
      model: "command-r-plus",
    })(t),
  },
  {
    name: "deepseek",
    enabled: () => !!process.env.DEEPSEEK_API_KEY,
    run: (t) => chatCompletions({
      url: "https://api.deepseek.com/v1/chat/completions",
      key: process.env.DEEPSEEK_API_KEY,
      model: "deepseek-chat",
    })(t),
  },
  {
    name: "qwen",
    enabled: () => !!process.env.QWEN_API_KEY,
    run: (t) => chatCompletions({
      url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
      key: process.env.QWEN_API_KEY,
      model: "qwen-max",
    })(t),
  },
  {
    name: "grok",
    enabled: () => !!process.env.XAI_API_KEY,
    run: (t) => chatCompletions({
      url: "https://api.x.ai/v1/chat/completions",
      key: process.env.XAI_API_KEY,
      model: "grok-2-latest",
    })(t),
  },
  {
    name: "perplexity",
    enabled: () => !!process.env.PERPLEXITY_API_KEY,
    run: (t) => chatCompletions({
      url: "https://api.perplexity.ai/chat/completions",
      key: process.env.PERPLEXITY_API_KEY,
      model: "sonar",
    })(t),
  },
  {
    name: "kimi",
    enabled: () => !!process.env.MOONSHOT_API_KEY,
    run: (t) => chatCompletions({
      url: "https://api.moonshot.cn/v1/chat/completions",
      key: process.env.MOONSHOT_API_KEY,
      model: "moonshot-v1-32k",
    })(t),
  },
  {
    name: "minimax",
    enabled: () => !!process.env.MINIMAX_API_KEY,
    run: minimax,
  },
];
