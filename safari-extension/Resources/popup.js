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
  featherless: "Featherless",
};

// Adapter-name → key-field mapping. Most are identical, but Llama uses the
// `together` field and Grok uses `xai` because that's what those provider
// platforms call themselves.
const KEY_FIELD = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  llama: "together",
  mistral: "mistral",
  cohere: "cohere",
  deepseek: "deepseek",
  qwen: "qwen",
  grok: "xai",
  perplexity: "perplexity",
  kimi: "moonshot",
  minimax: "minimax",
  featherless: "featherless",
};

let providerCatalog = []; // [{ name, default, suggestions }]

async function loadConfig() {
  const cfg = await chrome.storage.local.get(["endpoint", "keys", "models", "featherless_mode"]);
  cfg.keys = cfg.keys || {};
  cfg.models = cfg.models || {};
  cfg.featherless_mode = cfg.featherless_mode || "off";
  cfg.endpoint = cfg.endpoint || "http://localhost:8787/v1/check";
  return cfg;
}

async function fetchProviderCatalog(endpoint) {
  // Derive the /v1/models URL from /v1/check.
  const url = endpoint.replace(/\/v1\/check$/, "/v1/models");
  try {
    const r = await fetch(url, { method: "GET" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    return j.providers || [];
  } catch {
    // Fallback: no catalog available, render empty rows.
    return [];
  }
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

  $("#fl-key").value = cfg.keys.featherless || "";
  const fl = document.querySelector(`input[name="fl"][value="${cfg.featherless_mode}"]`);
  if (fl) fl.checked = true;
}

function bindTabs() {
  $$(".tab").forEach((t) => t.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.classList.toggle("active", x === t));
    $$(".panel").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== t.dataset.tab));
  }));
}

async function saveKeys() {
  const cfg = await loadConfig();
  const keys = { ...cfg.keys };
  const models = { ...cfg.models };

  for (const input of $$("#keygrid input[data-key]")) {
    const v = input.value.trim();
    if (v) keys[input.dataset.key] = v;
    else delete keys[input.dataset.key];
  }
  for (const input of $$("#keygrid input[data-model]")) {
    const v = input.value.trim();
    if (v) models[input.dataset.model] = v;
    else delete models[input.dataset.model];
  }
  await chrome.storage.local.set({ keys, models });
  flash("Saved");
}

async function saveFeatherless() {
  const mode = (document.querySelector('input[name="fl"]:checked') || {}).value || "off";
  const cfg = await loadConfig();
  const keys = { ...cfg.keys };
  if (mode === "personal") {
    keys.featherless = $("#fl-key").value.trim();
    delete keys.featherless_community;
  } else if (mode === "community") {
    delete keys.featherless;
    keys.featherless_community = true;
  } else {
    delete keys.featherless;
    delete keys.featherless_community;
  }
  await chrome.storage.local.set({ keys, featherless_mode: mode });
  flash("Featherless saved");
}

async function saveEndpoint() {
  const v = $("#endpoint").value.trim();
  await chrome.storage.local.set({ endpoint: v });
  // Refresh the catalog from the new endpoint so suggestions stay accurate.
  providerCatalog = await fetchProviderCatalog(v);
  const cfg = await loadConfig();
  renderKeyGrid(cfg);
  flash("Endpoint saved");
}

function flash(text) {
  $("#status").textContent = text;
  setTimeout(() => ($("#status").textContent = "Idle"), 1200);
}

$("#save-keys").addEventListener("click", saveKeys);
$("#save-fl").addEventListener("click", saveFeatherless);
$("#save-endpoint").addEventListener("click", saveEndpoint);

$("#check").addEventListener("click", async () => {
  const text = $("#input").value;
  if (!text.trim()) return;
  $("#status").textContent = "Checking…";
  $("#results").innerHTML = "";
  const r = await chrome.runtime.sendMessage({ type: "qr.check", text });
  if (!r?.ok) {
    $("#status").textContent = "Error";
    $("#meta").textContent = r?.error || "request failed";
    return;
  }
  const { suggestions, models_used } = r.data;
  $("#status").textContent = "Idle";
  $("#meta").textContent = `${models_used.length} models · ${suggestions.length} issues`;

  if (!suggestions.length) {
    $("#results").innerHTML = '<div class="empty">Looks clean.</div>';
    return;
  }
  $("#results").innerHTML = suggestions.map((s) => `
    <div class="suggestion">
      <div class="h">
        <span class="pill ${s.type}">${s.type}</span>
        <span class="meta">${Math.round(s.confidence * 100)}% · ${s.agreed_by}/13</span>
      </div>
      <div class="body">
        <span class="orig">${escape(s.original)}</span>
        <span>→</span>
        <span class="repl">${escape(s.replacement)}</span>
      </div>
      <div class="why">${escape(s.explanation || "")}</div>
    </div>
  `).join("");
});

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

bindTabs();
init();
