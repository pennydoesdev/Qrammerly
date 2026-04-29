import Foundation
import AppKit
import Carbon

/// Registers ⌥⌘G as a global hotkey via Carbon's RegisterEventHotKey API. When
/// pressed, posts a Notification that ContentView listens for to grab the
/// focused text in the frontmost app and run a check.
@MainActor
final class HotkeyController: ObservableObject {
    static let triggered = Notification.Name("QrammerlyHotkeyTriggered")

    private var ref: EventHotKeyRef?

    func install() {
        guard ref == nil else { return }

        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard),
                                 eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, _, _ -> OSStatus in
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: HotkeyController.triggered, object: nil)
            }
            return noErr
        }, 1, &spec, nil, nil)

        var hk: EventHotKeyRef?
        let id = EventHotKeyID(signature: OSType(0x51524D4C),  // 'QRML'
                               id: 1)
        // ⌥⌘G  =>  modifiers (option | command), key code G (0x05)
        let mods = UInt32(optionKey | cmdKey)
        let code = UInt32(kVK_ANSI_G)
        RegisterEventHotKey(code, mods, id, GetApplicationEventTarget(), 0, &hk)
        ref = hk
    }

    deinit {
        if let r = ref { UnregisterEventHotKey(r) }
    }
}
