# Qrammerly Mac

Minimal SwiftUI app, single window, frosted background, suggestions in a side
pane. Talks to the Node.js aggregator at `http://localhost:8787/v1/check` by
default — change the endpoint from the gear menu in the title bar.

## Build

Requires macOS 13+ and Xcode 15 (or just `swift` 5.9 from the command line).

```bash
swift run
```

Or generate an Xcode project and build from the IDE:

```bash
swift package generate-xcodeproj   # legacy SwiftPM toolchains only
# – or –
open Package.swift                  # Xcode opens it directly as a Swift package
```
