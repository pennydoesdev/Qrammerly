import Foundation
import AppKit
import ApplicationServices

/// Reads and writes the *focused text* in the frontmost app via Accessibility,
/// with a per-app AppleScript fallback for Word, Pages, Outlook and Mail when
/// AX returns nothing (those apps occasionally render text on a non-AX surface).
enum TextGrabber {

    struct Captured {
        let bundleID: String
        let text: String
        let writeBack: (String) -> Bool
    }

    static func grabFocused() -> Captured? {
        guard AXIsProcessTrusted() else { return nil }
        guard let app = NSWorkspace.shared.frontmostApplication else { return nil }
        let bundleID = app.bundleIdentifier ?? "unknown"

        if let captured = grabViaAccessibility(pid: app.processIdentifier, bundleID: bundleID) {
            return captured
        }

        // AppleScript fallbacks for apps known to misbehave with AX alone.
        switch bundleID {
        case "com.microsoft.Word":      return grabViaAppleScript(bundleID, .word)
        case "com.apple.iWork.Pages":   return grabViaAppleScript(bundleID, .pages)
        case "com.microsoft.Outlook":   return grabViaAppleScript(bundleID, .outlook)
        case "com.apple.mail":          return grabViaAppleScript(bundleID, .mail)
        default: return nil
        }
    }

    // MARK: - AX path

    private static func grabViaAccessibility(pid: pid_t, bundleID: String) -> Captured? {
        let appElement = AXUIElementCreateApplication(pid)
        var focused: CFTypeRef?
        guard
            AXUIElementCopyAttributeValue(appElement, kAXFocusedUIElementAttribute as CFString, &focused) == .success,
            let focusedRef = focused,
            CFGetTypeID(focusedRef) == AXUIElementGetTypeID()
        else { return nil }
        let element = focusedRef as! AXUIElement

        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &value) == .success,
              let str = value as? String, !str.isEmpty
        else { return nil }

        let writeBack: (String) -> Bool = { newText in
            AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, newText as CFTypeRef) == .success
        }
        return Captured(bundleID: bundleID, text: str, writeBack: writeBack)
    }

    // MARK: - AppleScript path

    private enum Target { case word, pages, outlook, mail }

    private static func grabViaAppleScript(_ bundleID: String, _ target: Target) -> Captured? {
        let getScript: String
        switch target {
        case .word:
            getScript = """
            tell application "Microsoft Word"
              if (count of documents) is 0 then return ""
              return content of text object of selection
            end tell
            """
        case .pages:
            getScript = """
            tell application "Pages"
              if (count of documents) is 0 then return ""
              return body text of front document
            end tell
            """
        case .outlook:
            getScript = """
            tell application "Microsoft Outlook"
              try
                set msg to front message
                return content of msg
              on error
                return ""
              end try
            end tell
            """
        case .mail:
            getScript = """
            tell application "Mail"
              try
                return content of selection
              on error
                return ""
              end try
            end tell
            """
        }

        guard let result = runAppleScript(getScript), !result.isEmpty else { return nil }

        let writeBack: (String) -> Bool = { newText in
            let escaped = newText
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
            let setScript: String
            switch target {
            case .word:
                setScript = """
                tell application "Microsoft Word"
                  set content of text object of selection to "\(escaped)"
                end tell
                """
            case .pages:
                setScript = """
                tell application "Pages"
                  set body text of front document to "\(escaped)"
                end tell
                """
            case .outlook:
                setScript = """
                tell application "Microsoft Outlook"
                  set content of front message to "\(escaped)"
                end tell
                """
            case .mail:
                setScript = """
                tell application "Mail"
                  set content of selection to "\(escaped)"
                end tell
                """
            }
            return runAppleScript(setScript) != nil
        }

        return Captured(bundleID: bundleID, text: result, writeBack: writeBack)
    }

    @discardableResult
    private static func runAppleScript(_ source: String) -> String? {
        var error: NSDictionary?
        guard let script = NSAppleScript(source: source) else { return nil }
        let result = script.executeAndReturnError(&error)
        if error != nil { return nil }
        return result.stringValue
    }
}
