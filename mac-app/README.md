# Qrammarly Mac

SwiftUI app with a frosted background, brand gradient title bar, side
suggestions pane, and a global hotkey that grabs the focused text from the
frontmost app, runs it through the aggregator, and writes the accepted fix
back.

## Build

Requires macOS 13+ and Xcode 15 (or `swift` 5.9 from the command line).

```bash
swift run
# or open Package.swift in Xcode and Run
```

## Permissions

The first time you press the hotkey, macOS will prompt for **Accessibility**.
You can also grant it preemptively from the Settings sheet inside the app.

| Permission           | Required for                              |
| -------------------- | ----------------------------------------- |
| Accessibility        | Reading and writing the focused text in any AX-compliant app (Apple Mail, Notes, TextEdit, browsers, IDEs, …) |
| Automation           | AppleScript fallback into Microsoft Word, Apple Pages, Microsoft Outlook, and Apple Mail |
| Network (client)     | Talking to your local aggregator and provider APIs |

Both usage rationales live in `Info.plist`; entitlements live in
`Qrammarly.entitlements`.

## Hotkey

<kbd>⌥</kbd><kbd>⌘</kbd><kbd>G</kbd> — grab focused text, check, show
suggestions. After applying a fix Qrammarly writes the corrected text back to
the source app via Accessibility (or AppleScript for Word/Pages/Outlook/Mail).

## App compatibility

| App                  | Mechanism                  |
| -------------------- | -------------------------- |
| Microsoft Word       | AX + Word AppleScript fallback   |
| Apple Pages          | AX + Pages AppleScript fallback  |
| Microsoft Outlook    | AX + Outlook AppleScript fallback|
| Apple Mail           | AX (works directly)        |
| Gmail / Google Docs / Outlook web | Use the Chrome (or Edge/Firefox/Safari) extension — Mac app also works via AX on the browser surface |
| Notes, TextEdit, IDEs, any AX-compliant text view | AX directly  |
