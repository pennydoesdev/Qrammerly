import SwiftUI
import AppKit

@main
struct QrammerlyApp: App {
    @StateObject private var permissions = PermissionsModel()
    @StateObject private var hotkey = HotkeyController()

    var body: some Scene {
        WindowGroup("Qrammerly") {
            ContentView()
                .environmentObject(permissions)
                .environmentObject(hotkey)
                .frame(minWidth: 760, minHeight: 540)
                .background(VisualEffectBlur())
                .onAppear {
                    permissions.refresh()
                    hotkey.install()
                }
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentSize)
    }
}

struct VisualEffectBlur: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let v = NSVisualEffectView()
        v.material = .underWindowBackground
        v.blendingMode = .behindWindow
        v.state = .active
        return v
    }
    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {}
}
