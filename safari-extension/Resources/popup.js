const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const PROVIDER_LABELS = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  together: "Meta (Together)",
  mistral: "Mistral",
  cohere: "Cohere",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  xai: "xAI (Grok)",
  perplexity: "Perplexity",
  moonshot: "Moonshot (Kimi)",
  minimax: "MiniMax",
};

const KEY_FIELD = {
  openai: "openai", anthropic: "anthropic", google: "google",
  llama: "together", mistral: "mistral", cohere: "cohere",
  deepseek: "deepseek", qwen: "qwen", grok: "xai",
  perplexity: "perplexity", kimi: "moonshot", minimax: "minimax",
};

let providerCatalog = [];

// Per-paragraph review state.
let paragraphs = [];          // [{ text, start, end }]
let currentParagraph = -1;    // index into paragraphs
let paragraphSuggestions = []; // suggestions for the current paragraph
let currentIssue = -1;        // index into paragraphSuggestions

// ---- text utilities -------------------------------------------------------

function splitParagraphs(text) {
  const out = [];
  const re = /\S[\s\S]*?(?=\n\s*\n|$)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ text: m[0].trim(), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Client-side cache in chrome.storage.local. Same paragraph hash → no API
// call. TTL 24h. Hard-capped to 200 entries.
const CACHE_NS = "qr.cache.v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function cacheGet(hash) {
  const all = (await chrome.storage.local.get(CACHE_NS))[CACHE_NS] || {};
  const entry = all[hash];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry.payload;
}

async function cacheSet(hash, payload) {
  const all = (await chrome.storage.local.get(CACHE_NS))[CACHE_NS] || {};
  all[hash] = { ts: Date.now(), payload };
  const keys = Object.keys(all);
  if (keys.length > 200) {
    keys
      .sort((a, b) => all[a].ts - all[b].ts)
      .slice(0, keys.length - 200)
      .forEach((k) => delete all[k]);
  }
  await chrome.storage.local.set({ [CACHE_NS]: all });
}

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

// ---- config ---------------------------------------------------------------

async function loadConfig() {
  const cfg = await chrome.storage.local.get(["endpoint", "keys", "models"]);
  cfg.keys = cfg.keys || {};
  cfg.models = cfg.models || {};
  cfg.endpoint = cfg.endpoint || "https://qrammerly.com/v1/check";
  return cfg;
}

async function fetchProviderCatalog(endpoint) {
  const url = endpoint.replace(/\/v1\/check$/, "/v1/models");
  try {
    const r = await fetch(url, { method: "GET" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    return j.providers || [];
  } catch { return []; }
}

function renderKeyGrid(cfg) {
  const grid = $("#keygrid");
  grid.innerHTML = "";

  const providers = providerCatalog.length
    ? providerCatalog
    : Object.keys(KEY_FIELD).map((name) => ({ name, default: "", suggestions: [] }));

  for (const p of providers) {
    const fld = KEY_FIELD[p.name] || p.name;
    const label = PROVIDER_LABELS[fld] || p.name;
    const datalistId = `dl-${p.name}`;
    const row = document.createElement("div");
    row.className = "key-row";
    row.innerHTML = `
      <div class="key-row-label">${label}</div>
      <div class="key-row-fields">
        <input data-key="${fld}" type="password" placeholder="API key"
               value="${cfg.keys[fld] ? escape(cfg.keys[fld]) : ""}" />
        <input data-model="${p.name}" type="text" list="${datalistId}"
               placeholder="${p.default ? escape(p.default) : "model"}"
               value="${cfg.models[p.name] ? escape(cfg.models[p.name]) : ""}" />
        <datalist id="${datalistId}">
          ${(p.suggestions || []).map((m) => `<option value="${escape(m)}"></option>`).join("")}
        </datalist>
      </div>
    `;
    grid.appendChild(row);
  }
}

async function init() {
  const cfg = await loadConfig();
  $("#endpoint").value = cfg.endpoint;
  providerCatalog = await fetchProviderCatalog(cfg.endpoint);
  renderKeyGrid(cfg);
}

function bindTabs() {
  $$(".tab").forEach((t) => t.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.classList.toggle("active", x === t));
    $$(".panel").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== t.dataset.tab));
  }));
}

// ---- save handlers --------------------------------------------------------

async function saveKeys() {
  const cfg = await loadConfig();
  const keys = { ...cfg.keys };
  const models = { ...cfg.models };

  for (const input of $$("#keygrid input[data-key]")) {
    const v = input.value.trim();
    if (v) keys[input.dataset.key] = v; else delete keys[input.dataset.key];
  }
  for (const input of $$("#keygrid input[data-model]")) {
    const v = input.value.trim();
    if (v) models[input.dataset.model] = v; else delete models[input.dataset.model];
  }
  await chrome.storage.local.set({ keys, models });
  flash("Saved");
}

async function saveEndpoint() {
  const v = $("#endpoint").value.trim();
  await chrome.storage.local.set({ endpoint: v });
  providerCatalog = await fetchProviderCatalog(v);
  renderKeyGrid(await loadConfig());
  flash("Endpoint saved");
}

function flash(text) {
  $("#status").textContent = text;
  setTimeout(() => ($("#status").textContent = "Idle"), 1200);
}

// ---- paragraph + issue stepping -------------------------------------------

async function checkClicked() {
  const text = $("#input").value;
  if (!text.trim()) return;
  paragraphs = splitParagraphs(text);
  if (!paragraphs.length) return;
  currentParagraph = 0;
  await loadParagraph();
}

async function loadParagraph() {
  const p = paragraphs[currentParagraph];
  $("#paragraph-nav").classList.remove("hidden");
  $("#para-counter").textContent = `Paragraph ${currentParagraph + 1} of ${paragraphs.length}`;
  $("#prev-para").disabled = currentParagraph === 0;
  $("#next-para").disabled = currentParagraph >= paragraphs.length - 1;

  $("#paragraph-preview").classList.remove("hidden");
  $("#paragraph-preview").textContent = p.text;
  $("#meta").textContent = "Checking…";
  $("#status").textContent = "Checking…";

  // Cache check.
  const hash = await sha256Hex(p.text);
  let payload = await cacheGet(hash);
  if (payload) {
    $("#meta").textContent = `${payload.models_used.length} models · ${payload.suggestions.length} issues · cached`;
  } else {
    const r = await chrome.runtime.sendMessage({ type: "qr.check", text: p.text });
    if (!r?.ok) {
      $("#meta").textContent = `Error: ${r?.error || "request failed"}`;
      $("#status").textContent = "Error";
      return;
    }
    payload = r.data;
    await cacheSet(hash, payload);
    $("#meta").textContent = `${payload.models_used.length} models · ${payload.suggestions.length} issues`;
  }

  $("#status").textContent = "Idle";
  paragraphSuggestions = payload.suggestions || [];
  currentIssue = paragraphSuggestions.length ? 0 : -1;
  highlightParagraph();
  renderCurrentIssue();
}

function highlightParagraph() {
  const p = paragraphs[currentParagraph];
  const text = p.text;
  if (!paragraphSuggestions.length) {
    $("#paragraph-preview").textContent = text;
    return;
  }
  const sorted = [...paragraphSuggestions].sort((a, b) => a.start - b.start);
  let html = "";
  let cursor = 0;
  sorted.forEach((s, i) => {
    if (s.start < cursor) return;
    html += escape(text.slice(cursor, s.start));
    const active = paragraphSuggestions.indexOf(s) === currentIssue ? "active" : "";
    html += `<span class="qr-mark qr-${s.type} ${active}" data-i="${paragraphSuggestions.indexOf(s)}">${escape(text.slice(s.start, s.end))}</span>`;
    cursor = s.end;
  });
  html += escape(text.slice(cursor));
  $("#paragraph-preview").innerHTML = html;
  $$("#paragraph-preview .qr-mark").forEach((el) => {
    el.addEventListener("click", () => {
      currentIssue = Number(el.dataset.i);
      highlightParagraph();
      renderCurrentIssue();
    });
  });
}

function renderCurrentIssue() {
  if (currentIssue < 0 || !paragraphSuggestions.length) {
    $("#results").innerHTML = paragraphSuggestions.length === 0
      ? '<div class="empty">Looks clean.</div>'
      : '<div class="empty">No issue selected.</div>';
    $("#issue-nav").classList.add("hidden");
    return;
  }
  const s = paragraphSuggestions[currentIssue];
  $("#issue-nav").classList.remove("hidden");
  $("#issue-counter").textContent = `Issue ${currentIssue + 1} of ${paragraphSuggestions.length}`;
  $("#prev-issue").disabled = currentIssue === 0;
  $("#next-issue").disabled = currentIssue >= paragraphSuggestions.length - 1;

  $("#results").innerHTML = `
    <div class="suggestion">
      <div class="h">
        <span class="pill ${escape(s.type)}">${escape(s.type)}</span>
        <span class="meta">${Math.round(s.confidence * 100)}% · ${s.agreed_by}/12</span>
      </div>
      <div class="body">
        <span class="orig">${escape(s.original)}</span>
        <span>→</span>
        <span class="repl">${escape(s.replacement)}</span>
      </div>
      <div class="why">${escape(s.explanation || "")}</div>
      <div class="actions">
        <button class="primary" id="apply-issue">Apply</button>
        <button class="ghost" id="skip-issue">Skip</button>
      </div>
    </div>
  `;
  $("#apply-issue").addEventListener("click", () => applyCurrentIssue());
  $("#skip-issue").addEventListener("click", () => stepIssue(+1));
}

function applyCurrentIssue() {
  const s = paragraphSuggestions[currentIssue];
  const p = paragraphs[currentParagraph];
  const fullBefore = $("#input").value;
  const absoluteStart = p.start + s.start;
  const absoluteEnd = p.start + s.end;
  const fullAfter = fullBefore.slice(0, absoluteStart) + s.replacement + fullBefore.slice(absoluteEnd);
  $("#input").value = fullAfter;

  // Tell the corpus the user accepted this fix.
  chrome.runtime.sendMessage({
    type: "qr.applied",
    text: p.text, original: s.original, replacement: s.replacement,
  }).catch(() => {});

  // Adjust offsets for remaining suggestions in this paragraph.
  const delta = s.replacement.length - (s.end - s.start);
  paragraphSuggestions = paragraphSuggestions
    .filter((_, i) => i !== currentIssue)
    .map((x, _i, arr) => ({
      ...x,
      start: x.start > s.start ? x.start + delta : x.start,
      end: x.end > s.start ? x.end + delta : x.end,
    }));
  // Update paragraph text in our cached array.
  paragraphs[currentParagraph] = {
    ...p,
    text: p.text.slice(0, s.start) + s.replacement + p.text.slice(s.end),
    end: p.end + delta,
  };
  // Shift later paragraph offsets.
  for (let i = currentParagraph + 1; i < paragraphs.length; i++) {
    paragraphs[i] = { ...paragraphs[i], start: paragraphs[i].start + delta, end: paragraphs[i].end + delta };
  }

  if (currentIssue >= paragraphSuggestions.length) currentIssue = paragraphSuggestions.length - 1;
  highlightParagraph();
  renderCurrentIssue();
}

function stepIssue(delta) {
  if (!paragraphSuggestions.length) return;
  currentIssue = Math.max(0, Math.min(paragraphSuggestions.length - 1, currentIssue + delta));
  highlightParagraph();
  renderCurrentIssue();
}

async function stepParagraph(delta) {
  const next = currentParagraph + delta;
  if (next < 0 || next >= paragraphs.length) return;
  currentParagraph = next;
  await loadParagraph();
}

// ---- bindings -------------------------------------------------------------

$("#save-keys").addEventListener("click", saveKeys);
$("#save-endpoint").addEventListener("click", saveEndpoint);
$("#check").addEventListener("click", checkClicked);
$("#prev-para").addEventListener("click", () => stepParagraph(-1));
$("#next-para").addEventListener("click", () => stepParagraph(+1));
$("#prev-issue").addEventListener("click", () => stepIssue(-1));
$("#next-issue").addEventListener("click", () => stepIssue(+1));

bindTabs();
init();
