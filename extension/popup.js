const $ = (s) => document.querySelector(s);

async function init() {
  const { endpoint } = await chrome.storage.sync.get("endpoint");
  $("#endpoint").value = endpoint || "http://localhost:8787/v1/check";
}

$("#save").addEventListener("click", async () => {
  await chrome.storage.sync.set({ endpoint: $("#endpoint").value.trim() });
  $("#status").textContent = "Saved";
  setTimeout(() => ($("#status").textContent = "Idle"), 1200);
});

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
        <span class="pill">${s.type}</span>
        <span class="meta">${Math.round(s.confidence * 100)}% · ${s.agreed_by}/12</span>
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

init();
