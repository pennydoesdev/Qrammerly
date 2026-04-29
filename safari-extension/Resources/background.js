// Service worker: proxies grammar checks so content scripts don't need to know
// about API hosts, and attaches the user's BYOK keys (stored locally) to every
// request so the server can fan out to whichever providers the user has
// enabled. Keys never leave the device except to your local server.

const DEFAULT_ENDPOINT = "http://localhost:8787/v1/check";

async function getConfig() {
  const { endpoint, keys } = await chrome.storage.local.get(["endpoint", "keys"]);
  return {
    endpoint: endpoint || DEFAULT_ENDPOINT,
    keys: keys || {},
  };
}

async function postCheck(text) {
  const { endpoint, keys } = await getConfig();
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, keys }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function postApplied({ text, original, replacement }) {
  const { endpoint } = await getConfig();
  const url = endpoint.replace(/\/v1\/check$/, "/v1/applied");
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, original, replacement }),
  }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "qr.check") {
        sendResponse({ ok: true, data: await postCheck(msg.text) });
      } else if (msg?.type === "qr.applied") {
        await postApplied(msg);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "unknown message" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // keep channel open for async sendResponse
});
