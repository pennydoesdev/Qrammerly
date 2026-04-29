// Watches editable elements, debounces input, and renders an overlay with
// underlines for each suggestion. We don't mutate the user's DOM/text — the
// overlay sits on top and forwards clicks through except where a marker is.

const DEBOUNCE_MS = 700;
const MIN_CHARS = 12;

const state = new WeakMap(); // element -> { overlay, timer, lastText, suggestions }

function isEditable(el) {
  if (!el) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT" && /^(text|search|email|url)$/i.test(el.type)) return true;
  if (el.isContentEditable) return true;
  return false;
}

function readText(el) {
  if ("value" in el) return el.value;
  return el.innerText;
}

function ensureOverlay(el) {
  let entry = state.get(el);
  if (entry?.overlay?.isConnected) return entry;

  const overlay = document.createElement("div");
  overlay.className = "qr-overlay";
  document.body.appendChild(overlay);

  entry = { overlay, timer: null, lastText: "", suggestions: [] };
  state.set(el, entry);

  const reposition = () => positionOverlay(el, overlay);
  reposition();
  window.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition);
  el.addEventListener("scroll", reposition);
  return entry;
}

function positionOverlay(el, overlay) {
  const r = el.getBoundingClientRect();
  overlay.style.top = `${r.top + window.scrollY}px`;
  overlay.style.left = `${r.left + window.scrollX}px`;
  overlay.style.width = `${r.width}px`;
  overlay.style.height = `${r.height}px`;
  const cs = getComputedStyle(el);
  overlay.style.font = cs.font;
  overlay.style.lineHeight = cs.lineHeight;
  overlay.style.padding = cs.padding;
  overlay.style.letterSpacing = cs.letterSpacing;
}

function render(el, text, suggestions) {
  const entry = state.get(el);
  if (!entry) return;
  const { overlay } = entry;
  overlay.innerHTML = "";
  if (!suggestions.length) return;

  const inner = document.createElement("div");
  inner.className = "qr-inner";
  let cursor = 0;
  for (const s of suggestions) {
    if (s.start < cursor) continue;
    inner.appendChild(document.createTextNode(text.slice(cursor, s.start)));
    const mark = document.createElement("span");
    mark.className = `qr-mark qr-${s.type || "grammar"}`;
    mark.textContent = text.slice(s.start, s.end);
    mark.dataset.replacement = s.replacement;
    mark.dataset.explanation = s.explanation;
    mark.dataset.confidence = s.confidence;
    mark.dataset.start = s.start;
    mark.dataset.end = s.end;
    mark.addEventListener("click", (ev) => showCard(ev, el, s));
    inner.appendChild(mark);
    cursor = s.end;
  }
  inner.appendChild(document.createTextNode(text.slice(cursor)));
  overlay.appendChild(inner);
}

function showCard(ev, el, s) {
  ev.stopPropagation();
  document.querySelectorAll(".qr-card").forEach((c) => c.remove());
  const card = document.createElement("div");
  card.className = "qr-card";
  card.innerHTML = `
    <div class="qr-card-head">
      <span class="qr-pill qr-${s.type}">${s.type}</span>
      <span class="qr-conf">${Math.round(s.confidence * 100)}% · ${s.agreed_by}/12</span>
    </div>
    <div class="qr-card-body">
      <div class="qr-orig">${escapeHtml(s.original)}</div>
      <div class="qr-arrow">→</div>
      <div class="qr-repl">${escapeHtml(s.replacement)}</div>
    </div>
    <div class="qr-explain">${escapeHtml(s.explanation || "")}</div>
    <div class="qr-card-actions">
      <button class="qr-btn qr-apply">Apply</button>
      <button class="qr-btn qr-ignore">Ignore</button>
    </div>
  `;
  document.body.appendChild(card);
  const r = ev.target.getBoundingClientRect();
  card.style.top = `${r.bottom + window.scrollY + 6}px`;
  card.style.left = `${r.left + window.scrollX}px`;

  card.querySelector(".qr-apply").addEventListener("click", () => {
    applyFix(el, s);
    card.remove();
  });
  card.querySelector(".qr-ignore").addEventListener("click", () => card.remove());
  setTimeout(() => document.addEventListener("click", () => card.remove(), { once: true }));
}

function applyFix(el, s) {
  const before = readText(el);
  const after = before.slice(0, s.start) + s.replacement + before.slice(s.end);
  if ("value" in el) {
    el.value = after;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    el.innerText = after;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  schedule(el);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function schedule(el) {
  const entry = ensureOverlay(el);
  positionOverlay(el, entry.overlay);
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => check(el), DEBOUNCE_MS);
}

async function check(el) {
  const entry = state.get(el);
  if (!entry) return;
  const text = readText(el);
  if (!text || text.length < MIN_CHARS) {
    entry.overlay.innerHTML = "";
    entry.lastText = text;
    return;
  }
  if (text === entry.lastText) return;
  entry.lastText = text;

  const resp = await chrome.runtime.sendMessage({ type: "qr.check", text });
  if (!resp?.ok) return;
  entry.suggestions = resp.data.suggestions || [];
  render(el, text, entry.suggestions);
}

function attach(el) {
  if (!isEditable(el) || el.dataset.qrAttached) return;
  el.dataset.qrAttached = "1";
  ensureOverlay(el);
  el.addEventListener("input", () => schedule(el));
  el.addEventListener("focus", () => schedule(el));
  el.addEventListener("blur", () => {
    const entry = state.get(el);
    if (entry) entry.overlay.innerHTML = "";
  });
}

document.querySelectorAll("textarea, input, [contenteditable='true']").forEach(attach);
new MutationObserver((muts) => {
  for (const m of muts) {
    m.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      if (isEditable(n)) attach(n);
      n.querySelectorAll?.("textarea, input, [contenteditable='true']").forEach(attach);
    });
  }
}).observe(document.documentElement, { childList: true, subtree: true });
