// Service worker: proxies grammar checks so content scripts don't need
// host_permissions for the user's chosen API host (it can be localhost during
// development, a hosted server in production).

const DEFAULT_ENDPOINT = "http://localhost:8787/v1/check";

async function getEndpoint() {
  const { endpoint } = await chrome.storage.sync.get("endpoint");
  return endpoint || DEFAULT_ENDPOINT;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "qr.check") return false;
  (async () => {
    try {
      const endpoint = await getEndpoint();
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: msg.text }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      sendResponse({ ok: true, data: await r.json() });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // keep channel open for async sendResponse
});
