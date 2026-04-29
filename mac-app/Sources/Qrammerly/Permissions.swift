import Foundation
import AppKit
import ApplicationServices

@MainActor
final class PermissionsModel: ObservableObject {
    @Published var accessibilityGranted = false
    @Published var automationHinted = false  // we can't poll Automation; show a tip

    func refresh() {
        accessibilityGranted = AXIsProcessTrusted()
    }

    /// Prompts the user to grant Accessibility. macOS will pop the system dialog
    /// the first time, then deep-link to System Settings on subsequent calls.
    func requestAccessibility() {
        let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        let opts = [key: true] as CFDictionary
        accessibilityGranted = AXIsProcessTrustedWithOptions(opts)
    }

    /// Open the Accessibility pane directly (for a "regrant" button).
    func openAccessibilitySettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
    }

    /// Open the Automation pane directly.
    func openAutomationSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation") {
            NSWorkspace.shared.open(url)
        }
    }
}
