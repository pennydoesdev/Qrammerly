// Tone detection + goal-aware proofreading. Mirrors server/features.js.
// Picks the strongest available frontier provider for which env or BYOK
// has a key, then issues a single short prompt.

import { ADAPTERS } from "./adapters.js";

const TONE_SYSTEM = `You analyze the *tone* of a piece of writing. Reply with
strict JSON: {"tones": ["...", "..."], "primary": "...", "summary": "<= 1
sentence"}. The tones array contains 1-4 short labels from this set: confident,
neutral, friendly, formal, informal, optimistic, concerned, urgent, joyful,
appreciative, assertive, analytical, curious, persuasive. The primary is the
single best-fit label.`;

const GOAL_SYSTEM = (goals) => `You proofread text *with respect to the
following goals*: audience=${goals.audience || "general"}, formality=${
  goals.formality || "neutral"}, intent=${goals.intent || "inform"}, domain=${
  goals.domain || "general"}. Find issues that conflict with these goals.
Reply with strict JSON:
{"suggestions":[{"original":"...","replacement":"...","type":"style","explanation":"why"}]}.
"original" must be a literal substring of the user's text.`;

const ENDPOINTS = {
  openai: "https://api.openai.com/v1/chat/completions",
  llama: "https://api.together.xyz/v1/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
  cohere: "https://api.cohere.com/v2/chat",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
  grok: "https://api.x.ai/v1/chat/completions",
  perplexity: "https://api.perplexity.ai/chat/completions",
  kimi: "https://api.moonshot.cn/v1/chat/completions",
};

const MODELS = {
  openai: "gpt-4o",
  llama: "meta-llama/Llama-3.1-70B-Instruct-Turbo",
  mistral: "mistral-large-latest",
  cohere: "command-r-plus",
  deepseek: "deepseek-chat",
  qwen: "qwen-max",
  grok: "grok-2-latest",
  perplexity: "sonar",
  kimi: "moonshot-v1-32k",
};

function pickAdapter(req, env) {
  const order = ["openai", "anthropic", "google"];
  for (const name of order) {
    const a = ADAPTERS.find((x) => x.name === name);
    if (a && a.keyFor(req, env)) return { a, key: a.keyFor(req, env) };
  }
  for (const a of ADAPTERS) {
    const k = a.keyFor(req, env);
    if (k) return { a, key: k };
  }
  return null;
}

function safeJson(raw) {
  if (!raw) return null;
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(raw.slice(s, e + 1)); } catch { return null; }
}

async function chatOpenAICompat(name, key, system, text, modelOverride) {
  const url = ENDPOINTS[name] || ENDPOINTS.openai;
  const model = modelOverride || MODELS[name] || MODELS.openai;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, temperature: 0.2,
      messages: [{ role: "system", content: system }, { role: "user", content: text }],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error(`${name} ${r.status}`);
  const j = await r.json();
  return safeJson(j?.choices?.[0]?.message?.content);
}

async function chatAnthropic(key, system, text, modelOverride) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: modelOverride || "claude-sonnet-4-6", max_tokens: 512, system,
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}`);
  const j = await r.json();
  return safeJson(j?.content?.[0]?.text);
}

async function chatGoogle(key, system, text, modelOverride) {
  const m = modelOverride || "gemini-1.5-pro";
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { role: "system", parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    },
  );
  if (!r.ok) throw new Error(`google ${r.status}`);
  const j = await r.json();
  return safeJson(j?.candidates?.[0]?.content?.parts?.[0]?.text);
}

async function runWithSystem(picked, text, system, parse, req, env) {
  const { a, key } = picked;
  const override = req?.models?.[a.name];
  if (a.name === "anthropic") return parse(await chatAnthropic(key, system, text, override));
  if (a.name === "google")    return parse(await chatGoogle(key, system, text, override));
  return parse(await chatOpenAICompat(a.name, key, system, text, override));
}

const parseTone = (j) => ({
  tones: Array.isArray(j?.tones) ? j.tones.slice(0, 4) : [],
  primary: j?.primary || null,
  summary: j?.summary || "",
});
const parseSuggestions = (j) => ({ suggestions: Array.isArray(j?.suggestions) ? j.suggestions : [] });

export async function detectTone(env, req, text) {
  const picked = pickAdapter(req, env);
  if (!picked) return { tones: [], primary: null, summary: "" };
  return runWithSystem(picked, text, TONE_SYSTEM, parseTone, req, env);
}

export async function proofreadForGoals(env, req, text, goals) {
  const picked = pickAdapter(req, env);
  if (!picked) return { suggestions: [] };
  return runWithSystem(picked, text, GOAL_SYSTEM(goals || {}), parseSuggestions, req, env);
}
