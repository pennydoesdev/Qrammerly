# Qrammerly — Safari

Safari Web Extensions are bundled and signed inside a host macOS / iOS app, so
the layout here is split into two parts:

- `Resources/` — the cross-browser MV3 web extension (identical assets to
  Chrome/Edge/Firefox).
- An Xcode-generated wrapper app, **not** committed here because Xcode regenerates
  it. Generate it with the steps below.

## Generating the Xcode wrapper

Apple ships a converter that turns a web extension into a Safari project:

```bash
xcrun safari-web-extension-converter \
  Resources/ \
  --project-location . \
  --bundle-identifier com.pennydoesdev.qrammerly \
  --app-name Qrammerly \
  --no-prompt --force --copy-resources
```

This produces `Qrammerly.xcodeproj`. Open it in Xcode and:

1. Select the **Qrammerly Extension** target → Signing & Capabilities → set your
   team.
2. Build & run the host app once. macOS adds the extension to *System Settings →
   Extensions → Safari Extensions*; toggle it on.
3. In Safari → Settings → Extensions, enable **Qrammerly** and grant access to
   the websites you want it to proofread.

## Distributing

Submit the host app to the Mac App Store (or notarise + ship as a `.dmg`) so
Safari users get the extension via the App Store flow Apple requires.

## Why the Resources/ folder

When the Xcode project is regenerated, point it at `Resources/` so the JS, CSS,
HTML and manifest stay version-controlled here. The wrapper Xcode project is a
build artefact and is gitignored at the repo root.
