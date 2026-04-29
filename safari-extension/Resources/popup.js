const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const KEY_FIELDS = [
  "openai", "anthropic", "google", "together", "mistral", "cohere",
  "deepseek", "qwen", "xai", "perplexity", "moonshot", "minimax", "featherless",
];

async function loadConfig() {
  const cfg = await chrome.storage.local.get(["endpoint", "keys", "featherless_mode"]);
  cfg.keys = cfg.keys || {};
  cfg.featherless_mode = cfg.featherless_mode || "off";
  cfg.endpoint = cfg.endpoint || "http://localhost:8787/v1/check";
  return cfg;
}

async function init() {
  const cfg = await loadConfig();
  $("#endpoint").value = cfg.endpoint;
  for (const f of KEY_FIELDS) {
    const el = document.querySelector(`input[data-key="${f}"]`);
    if (el) el.value = cfg.keys[f] || "";
  }
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
  for (const f of KEY_FIELDS) {
    const el = document.querySelector(`input[data-key="${f}"]`);
    if (el) keys[f] = el.value.trim();
  }
  await chrome.storage.local.set({ keys });
  flash("Keys saved");
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
  await chrome.storage.local.set({ endpoint: $("#endpoint").value.trim() });
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
