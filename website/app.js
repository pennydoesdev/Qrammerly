// Vanilla JS that drives the landing page's "Try it" widget, signup/login,
// and the user dashboard. Talks to the same /v1/* API the extensions use.

const API_BASE = (() => {
  // Same-origin in production, localhost in dev.
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return "http://localhost:8787";
  }
  return location.origin;
})();
document.getElementById("endpoint-display").textContent = API_BASE;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const escape = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

const TOKEN_KEY = "qrammerly.token";
const token = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

async function api(path, opts = {}) {
  const headers = { "content-type": "application/json", ...(opts.headers || {}) };
  if (token()) headers.authorization = `Bearer ${token()}`;
  const r = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
}

// ---- Try it ----------------------------------------------------------------

$("#try-check").addEventListener("click", async () => {
  const text = $("#try-text").value;
  if (!text.trim()) return;
  $("#try-meta").textContent = "Checking…";
  $("#try-results").innerHTML = "";
  try {
    const data = await api("/v1/check", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    $("#try-meta").textContent = `${data.models_used.length} models · ${data.suggestions.length} issues`;
    $("#try-results").innerHTML = data.suggestions.length === 0
      ? `<div class="muted">Looks clean.</div>`
      : data.suggestions.map((s) => `
        <div class="suggestion">
          <div class="h">
            <span class="pill ${s.type}">${escape(s.type)}</span>
            <span class="muted">${Math.round(s.confidence * 100)}% · ${s.agreed_by}/13</span>
          </div>
          <div class="body">
            <span class="orig">${escape(s.original)}</span>
            <span>→</span>
            <span class="repl">${escape(s.replacement)}</span>
          </div>
          <div class="why">${escape(s.explanation || "")}</div>
        </div>`).join("");
  } catch (e) {
    $("#try-meta").textContent = `Error: ${e.message}`;
  }
});

$("#try-stats").addEventListener("click", async () => {
  const text = $("#try-text").value;
  if (!text.trim()) return;
  const data = await api("/v1/stats", { method: "POST", body: JSON.stringify({ text }) });
  $("#try-results").innerHTML = `
    <div class="stats-grid">
      <div class="stat-tile"><div class="k">Words</div><div class="v">${data.words}</div></div>
      <div class="stat-tile"><div class="k">Sentences</div><div class="v">${data.sentences}</div></div>
      <div class="stat-tile"><div class="k">Reading ease</div><div class="v">${data.flesch_reading_ease ?? "—"}</div></div>
      <div class="stat-tile"><div class="k">Grade</div><div class="v">${data.flesch_kincaid_grade ?? "—"}</div></div>
      <div class="stat-tile"><div class="k">Vocab diversity</div><div class="v">${data.vocabulary_diversity}</div></div>
      <div class="stat-tile"><div class="k">Reading time</div><div class="v">${data.reading_time_minutes}m</div></div>
    </div>`;
});

$("#try-tone").addEventListener("click", async () => {
  const text = $("#try-text").value;
  if (!text.trim()) return;
  $("#try-meta").textContent = "Detecting tone…";
  try {
    const data = await api("/v1/tone", { method: "POST", body: JSON.stringify({ text }) });
    $("#try-meta").textContent = "";
    $("#try-results").innerHTML = `
      <div class="suggestion">
        <div class="h">
          <span class="pill style">${escape(data.primary || "neutral")}</span>
          <span class="muted">${(data.tones || []).map(escape).join(" · ")}</span>
        </div>
        <div class="why">${escape(data.summary || "")}</div>
      </div>`;
  } catch (e) {
    $("#try-meta").textContent = `Error: ${e.message}`;
  }
});

// ---- Auth ------------------------------------------------------------------

async function refreshAuthState() {
  if (!token()) {
    $("#auth-state").textContent = "Not signed in.";
    $("#dashboard").classList.add("hidden");
    return;
  }
  try {
    const me = await api("/v1/me");
    $("#auth-state").innerHTML = `Signed in as <strong>${escape(me.user.email)}</strong> · <a href="#" id="logout">log out</a>`;
    $("#logout").addEventListener("click", (e) => {
      e.preventDefault(); setToken(null); refreshAuthState();
    });
    $("#dashboard").classList.remove("hidden");
    loadDashboard();
  } catch {
    setToken(null); $("#auth-state").textContent = "Session expired.";
  }
}

async function loadDashboard() {
  const stats = await api("/v1/me/stats");
  $("#stats-grid").innerHTML = `
    <div class="stat-tile"><div class="k">Corrections</div><div class="v">${stats.corrections || 0}</div></div>
    <div class="stat-tile"><div class="k">Active days</div><div class="v">${stats.active_days || 0}</div></div>
    <div class="stat-tile"><div class="k">Avg confidence</div><div class="v">${stats.avg_confidence ? Math.round(stats.avg_confidence * 100) + "%" : "—"}</div></div>
  `;
  const { items } = await api("/v1/history?limit=20");
  $("#history-list").innerHTML = items.map((h) => `
    <div class="history-row">
      <span class="ts">${escape(h.ts)}</span>
      <span class="orig">${escape(h.original)}</span>
      <span>→</span>
      <span class="repl">${escape(h.replacement)}</span>
    </div>`).join("") || `<div class="muted">No accepted corrections yet.</div>`;
}

$("#su-submit").addEventListener("click", async () => {
  try {
    const r = await api("/v1/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: $("#su-email").value, password: $("#su-password").value }),
    });
    setToken(r.token); refreshAuthState();
  } catch (e) { $("#auth-state").textContent = `Signup failed: ${e.message}`; }
});

$("#li-submit").addEventListener("click", async () => {
  try {
    const r = await api("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: $("#li-email").value, password: $("#li-password").value }),
    });
    setToken(r.token); refreshAuthState();
  } catch (e) { $("#auth-state").textContent = `Login failed: ${e.message}`; }
});

refreshAuthState();
