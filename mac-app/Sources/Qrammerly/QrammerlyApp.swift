import SwiftUI

@main
struct QrammerlyApp: App {
    var body: some Scene {
        WindowGroup("Qrammerly") {
            ContentView()
                .frame(minWidth: 720, minHeight: 520)
                .background(VisualEffectBlur())
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
