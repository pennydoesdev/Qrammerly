# Qrammarly — Firefox

Firefox supports WebExtensions MV3 from version 115 onward. The same content
script and popup work via the `chrome.*` API namespace (Firefox aliases it).

## Install (developer / temporary)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `manifest.json` from this folder.

The add-on is removed when you restart Firefox; for a permanent install you
need to package and sign it via [addons.mozilla.org](https://addons.mozilla.org/developers/).

## Notes

- Firefox MV3 uses `background.scripts` (event pages) instead of Chrome's
  `service_worker`. The actual JS is identical.
- The `browser_specific_settings.gecko.id` is required by Firefox; replace it
  with your own add-on ID before submission.
