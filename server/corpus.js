// Append-only training corpus. Every successful /v1/check is written as a
// single JSON line to corpus/YYYY-MM-DD.jsonl. The file format is intentionally
// flat raw text so it can be loaded directly with
//   datasets.load_dataset("json", data_files="...")
// for fine-tuning a future internal model on Hugging Face.

import fs from "node:fs";
import path from "node:path";

const DIR = process.env.CORPUS_DIR || "./corpus";

// Heuristic language detection: enough to tag "is this code, and which?".
// We're not trying to be fastText. Misses gracefully default to null.
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
  // Cheap latin/cjk split; consumers can re-tag with a real detector later.
  if (/[぀-ヿ一-鿿가-힯]/.test(text)) return "cjk";
  return "en";
}

export function record({ text, suggestions, models_used }) {
  if (!DIR) return;
  fs.mkdirSync(DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(DIR, `${date}.jsonl`);
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
      // Set later by /v1/applied callbacks. Default false so trainers can
      // weight unconfirmed suggestions lower than confirmed ones.
      applied: false,
    })),
  };
  fs.appendFileSync(file, JSON.stringify(entry) + "\n");
}

// Mark a previously-recorded suggestion as applied. Append-only: we don't
// rewrite history, we just write a new "applied" event row that the HF export
// folds into the matching record.
export function recordApplied({ text, original, replacement }) {
  if (!DIR) return;
  fs.mkdirSync(DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(DIR, `${date}.applied.jsonl`);
  fs.appendFileSync(
    file,
    JSON.stringify({ ts: new Date().toISOString(), text, original, replacement }) + "\n",
  );
}
