// Append-only training corpus on R2. One JSON object per /v1/check at
// corpus/<YYYY-MM-DD>/<uuid>.json. Equivalent to the local JSONL files used
// by the Node server, just sharded so concurrent writes don't conflict.
//
// Use ctx.waitUntil() at the call site so the response isn't blocked on R2.

const CODE_HINTS = [
  { lang: "javascript", re: /\b(const|let|=>|function|console\.log|require\(|import\s+\w+\s+from)\b/ },
  { lang: "typescript", re: /\b(interface\s+\w+|type\s+\w+\s*=|:\s*(string|number|boolean)\b)/ },
  { lang: "python",     re: /\b(def\s+\w+\(|import\s+\w+|print\(|self\.|elif\b|lambda\b)/ },
  { lang: "go",         re: /\b(package\s+main|func\s+\w+\(|fmt\.Println|:=)/ },
  { lang: "rust",       re: /\b(fn\s+\w+\(|let\s+mut\s+|impl\s+\w+|::<)/ },
  { lang: "java",       re: /\b(public\s+class|System\.out\.println|@Override)\b/ },
  { lang: "c",          re: /#include\s*<[^>]+>|\bint\s+main\s*\(/ },
  { lang: "cpp",        re: /\b(std::|cout\s*<<|namespace\s+\w+)/ },
  { lang: "ruby",       re: /\b(def\s+\w+|puts\s+|end\b|attr_accessor)/ },
  { lang: "shell",      re: /^\s*#!\s*\/(usr\/)?bin\/(env\s+)?(bash|sh)|\$\(.+\)|\becho\s+/m },
  { lang: "sql",        re: /\b(SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE)\b/i },
  { lang: "html",       re: /<\/?(html|body|div|span|a|p|h[1-6])\b/ },
  { lang: "css",        re: /[#.][\w-]+\s*\{[^}]*[\w-]+\s*:\s*[^;]+;/ },
];

function detectCode(text) {
  const fenced = text.match(/```(\w+)?\s*([\s\S]+?)```/);
  if (fenced) {
    return {
      code_block: true,
      programming_language: (fenced[1] || guessLang(fenced[2]) || "unknown").toLowerCase(),
    };
  }
  const guessed = guessLang(text);
  return { code_block: !!guessed, programming_language: guessed };
}

function guessLang(text) {
  const scored = CODE_HINTS
    .map((h) => ({ lang: h.lang, hits: (text.match(h.re) || []).length }))
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  return scored[0]?.lang || null;
}

function detectNaturalLanguage(text) {
  if (/[぀-ヿ一-鿿가-힯]/.test(text)) return "cjk";
  return "en";
}

function uuid() {
  // Workers ship `crypto.randomUUID()` so we don't need a polyfill.
  return crypto.randomUUID();
}

export async function record(env, { text, suggestions, models_used }) {
  if (!env?.CORPUS) return;
  const code = detectCode(text);
  const entry = {
    ts: new Date().toISOString(),
    lang: detectNaturalLanguage(text),
    code_block: code.code_block,
    programming_language: code.programming_language,
    text,
    models_used,
    corrections: suggestions.map((s) => ({
      original: s.original,
      replacement: s.replacement,
      type: s.type,
      explanation: s.explanation,
      confidence: s.confidence,
      agreed_by: s.agreed_by,
      applied: false,
    })),
  };
  const date = entry.ts.slice(0, 10);
  await env.CORPUS.put(`corpus/${date}/${uuid()}.json`, JSON.stringify(entry), {
    httpMetadata: { contentType: "application/json" },
  });
}

export async function recordApplied(env, { text, original, replacement }) {
  if (!env?.CORPUS) return;
  const ts = new Date().toISOString();
  const date = ts.slice(0, 10);
  await env.CORPUS.put(
    `applied/${date}/${uuid()}.json`,
    JSON.stringify({ ts, text, original, replacement }),
    { httpMetadata: { contentType: "application/json" } },
  );
}
