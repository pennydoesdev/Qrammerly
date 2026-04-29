import SwiftUI
import AppKit

// MARK: - Brand

enum Brand {
    static let sun     = Color(red: 1.000, green: 0.745, blue: 0.043) // #FFBE0B
    static let flame   = Color(red: 0.984, green: 0.337, blue: 0.027) // #FB5607
    static let magenta = Color(red: 1.000, green: 0.000, blue: 0.431) // #FF006E
    static let iris    = Color(red: 0.514, green: 0.220, blue: 0.925) // #8338EC
    static let sky     = Color(red: 0.227, green: 0.525, blue: 1.000) // #3A86FF
    static let gradient = LinearGradient(
        colors: [iris, magenta, flame],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    /// Use Montserrat when installed; fall back to system rounded otherwise.
    static func font(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        if NSFont(name: "Montserrat", size: size) != nil {
            return .custom("Montserrat", size: size).weight(weight)
        }
        return .system(size: size, weight: weight, design: .rounded)
    }
}

// MARK: - View model

@MainActor
final class CheckerVM: ObservableObject {
    @Published var text: String = ""
    @Published var suggestions: [Suggestion] = []
    @Published var modelsUsed: [String] = []
    @Published var isChecking = false
    @Published var endpoint: String = UserDefaults.standard.string(forKey: "qr.endpoint")
        ?? "http://localhost:8787/v1/check"
    @Published var errorMessage: String?
    @Published var capturedFrom: String?  // bundle ID we grabbed text from

    /// API keys keyed by adapter "client field" name (openai, anthropic, …).
    /// NOTE: stored in UserDefaults for now. Production builds should move
    /// these to Keychain — the API surface is the same.
    @Published var keys: [String: String] =
        (UserDefaults.standard.dictionary(forKey: "qr.keys") as? [String: String]) ?? [:]
    @Published var modelOverrides: [String: String] =
        (UserDefaults.standard.dictionary(forKey: "qr.models") as? [String: String]) ?? [:]
    @Published var providerCatalog: [ProviderInfo] = []

    /// Caller for writing accepted fixes back to the source app.
    var writeBack: ((String) -> Bool)?

    private var debounceTask: Task<Void, Never>?

    func saveSettings() {
        UserDefaults.standard.set(endpoint, forKey: "qr.endpoint")
        UserDefaults.standard.set(keys, forKey: "qr.keys")
        UserDefaults.standard.set(modelOverrides, forKey: "qr.models")
    }

    func refreshCatalog() async {
        let url = URL(string: endpoint) ?? URL(string: "http://localhost:8787/v1/check")!
        let client = CheckerClient(endpoint: url)
        let catalog = await client.fetchProviderCatalog()
        if !catalog.isEmpty { self.providerCatalog = catalog }
    }

    func scheduleCheck() {
        debounceTask?.cancel()
        let snapshot = text
        debounceTask = Task {
            try? await Task.sleep(nanoseconds: 700_000_000)
            if Task.isCancelled { return }
            await runCheck(snapshot)
        }
    }

    func runCheck(_ snapshot: String) async {
        guard snapshot.trimmingCharacters(in: .whitespacesAndNewlines).count >= 12 else {
            self.suggestions = []
            return
        }
        self.isChecking = true
        defer { self.isChecking = false }
        do {
            let url = URL(string: endpoint) ?? URL(string: "http://localhost:8787/v1/check")!
            let client = CheckerClient(endpoint: url)
            let resp = try await client.check(snapshot, keys: keys, models: modelOverrides)
            self.suggestions = resp.suggestions
            self.modelsUsed = resp.models_used
            self.errorMessage = nil
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    func apply(_ s: Suggestion) {
        guard s.start <= text.count, s.end <= text.count, s.start <= s.end else { return }
        let startIdx = text.index(text.startIndex, offsetBy: s.start)
        let endIdx = text.index(text.startIndex, offsetBy: s.end)
        text.replaceSubrange(startIdx..<endIdx, with: s.replacement)
        suggestions.removeAll { $0.id == s.id }
        _ = writeBack?(text)
        scheduleCheck()
    }

    func ingest(captured: TextGrabber.Captured) {
        self.text = captured.text
        self.capturedFrom = captured.bundleID
        self.writeBack = captured.writeBack
        Task { await runCheck(captured.text) }
    }
}

// MARK: - Root

struct ContentView: View {
    @StateObject private var vm = CheckerVM()
    @EnvironmentObject private var permissions: PermissionsModel
    @State private var showSettings = false

    var body: some View {
        VStack(spacing: 0) {
            TitleBar(showSettings: $showSettings, vm: vm)
            if !permissions.accessibilityGranted {
                PermissionBanner()
            }
            HStack(spacing: 0) {
                Editor(vm: vm)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                Divider()
                SuggestionsPane(vm: vm)
                    .frame(width: 340)
            }
            FooterBar(vm: vm)
        }
        .sheet(isPresented: $showSettings) { SettingsSheet(vm: vm) }
        .onReceive(NotificationCenter.default.publisher(for: HotkeyController.triggered)) { _ in
            if let captured = TextGrabber.grabFocused() {
                vm.ingest(captured: captured)
                NSApp.activate(ignoringOtherApps: true)
            } else if !permissions.accessibilityGranted {
                permissions.requestAccessibility()
            }
        }
    }
}

// MARK: - Title bar

private struct TitleBar: View {
    @Binding var showSettings: Bool
    @ObservedObject var vm: CheckerVM

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(Brand.gradient)
                    .shadow(color: Brand.magenta.opacity(0.32), radius: 10, y: 4)
                Text("Q")
                    .font(Brand.font(16, weight: .heavy))
                    .foregroundColor(.white)
            }
            .frame(width: 32, height: 32)

            VStack(alignment: .leading, spacing: 0) {
                Text("Qrammerly").font(Brand.font(14, weight: .heavy))
                Text("⌥⌘G to grab focused text")
                    .font(Brand.font(10, weight: .semibold))
                    .foregroundColor(.secondary)
            }

            Spacer()
            if vm.isChecking { ProgressView().controlSize(.small) }

            Button { showSettings = true } label: {
                Image(systemName: "slider.horizontal.3")
            }
            .buttonStyle(.borderless)
            .help("Settings")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
        .overlay(Divider(), alignment: .bottom)
    }
}

// MARK: - Permission banner

private struct PermissionBanner: View {
    @EnvironmentObject var permissions: PermissionsModel

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.shield.fill").foregroundColor(.white)
            VStack(alignment: .leading, spacing: 2) {
                Text("Accessibility permission required")
                    .font(Brand.font(12, weight: .bold)).foregroundColor(.white)
                Text("Qrammerly needs Accessibility to read text from Word, Pages, Outlook, Mail and other apps.")
                    .font(Brand.font(11)).foregroundColor(.white.opacity(0.85))
            }
            Spacer()
            Button("Grant…") { permissions.requestAccessibility() }
                .buttonStyle(.borderedProminent).tint(.white)
                .foregroundColor(Brand.magenta)
            Button("Open Settings") { permissions.openAccessibilitySettings() }
                .buttonStyle(.bordered).tint(.white)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(Brand.gradient)
    }
}

// MARK: - Editor

private struct Editor: View {
    @ObservedObject var vm: CheckerVM

    var body: some View {
        ZStack(alignment: .topLeading) {
            if vm.text.isEmpty {
                Text("Press ⌥⌘G in any app to grab text — or just type here.")
                    .foregroundColor(.secondary)
                    .font(Brand.font(13))
                    .padding(.horizontal, 22)
                    .padding(.top, 22)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $vm.text)
                .font(Brand.font(15))
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
                .onChange(of: vm.text) { _ in vm.scheduleCheck() }
        }
        .background(Color.clear)
    }
}

// MARK: - Suggestions

private struct SuggestionsPane: View {
    @ObservedObject var vm: CheckerVM

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Suggestions").font(Brand.font(12, weight: .bold))
                Spacer()
                Text("\(vm.suggestions.count)")
                    .font(Brand.font(11, weight: .semibold)).foregroundColor(.secondary)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            Divider()

            if vm.suggestions.isEmpty {
                VStack(spacing: 8) {
                    ZStack {
                        Circle().fill(Brand.gradient).frame(width: 44, height: 44).opacity(0.2)
                        Image(systemName: "checkmark")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(Brand.gradient)
                    }
                    Text(vm.text.isEmpty ? "No text yet" : "Looks clean")
                        .font(Brand.font(12, weight: .semibold))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(vm.suggestions) { s in
                            SuggestionCard(s: s) { vm.apply(s) }
                        }
                    }
                    .padding(12)
                }
            }
        }
        .background(.thickMaterial)
    }
}

private struct SuggestionCard: View {
    let s: Suggestion
    let onApply: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(s.type.uppercased())
                    .font(Brand.font(9, weight: .bold))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(typeColor.opacity(0.18))
                    .foregroundColor(typeColor)
                    .clipShape(Capsule())
                Spacer()
                Text("\(Int(s.confidence * 100))% · \(s.agreed_by)/13")
                    .font(Brand.font(10, weight: .semibold)).foregroundColor(.secondary)
            }
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(s.original).strikethrough().foregroundColor(.secondary)
                Text("→").foregroundColor(.secondary)
                Text(s.replacement).fontWeight(.bold)
            }
            .font(Brand.font(13))
            if !s.explanation.isEmpty {
                Text(s.explanation).font(Brand.font(11)).foregroundColor(.secondary)
            }
            HStack {
                Spacer()
                Button("Apply") { onApply() }
                    .controlSize(.small)
                    .buttonStyle(.borderedProminent)
                    .tint(Brand.magenta)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.black.opacity(0.06), lineWidth: 1)
        )
    }

    private var typeColor: Color {
        switch s.type {
        case "spelling":    return Brand.magenta
        case "grammar":     return Brand.flame
        case "punctuation": return Brand.sun
        case "clarity":     return Brand.sky
        case "style":       return Brand.iris
        default:            return .gray
        }
    }
}

// MARK: - Footer

private struct FooterBar: View {
    @ObservedObject var vm: CheckerVM

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(vm.errorMessage == nil ? Color.green : Color.red)
                .frame(width: 6, height: 6)
            if let err = vm.errorMessage {
                Text(err).font(Brand.font(11)).foregroundColor(.secondary)
            } else if let from = vm.capturedFrom {
                Text("Captured from \(from) · \(vm.modelsUsed.count) models")
                    .font(Brand.font(11)).foregroundColor(.secondary)
                    .lineLimit(1).truncationMode(.tail)
            } else {
                Text(vm.modelsUsed.isEmpty
                     ? "Awaiting input"
                     : "\(vm.modelsUsed.count) models · \(vm.modelsUsed.joined(separator: ", "))")
                    .font(Brand.font(11)).foregroundColor(.secondary)
                    .lineLimit(1).truncationMode(.tail)
            }
            Spacer()
            Text("\(vm.text.count) chars").font(Brand.font(11)).foregroundColor(.secondary)
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(.ultraThinMaterial)
        .overlay(Divider(), alignment: .top)
    }
}

// MARK: - Settings

private struct SettingsSheet: View {
    @ObservedObject var vm: CheckerVM
    @EnvironmentObject var permissions: PermissionsModel
    @Environment(\.dismiss) private var dismiss

    private let providerLabels: [String: String] = [
        "openai": "OpenAI",
        "anthropic": "Anthropic",
        "google": "Google",
        "llama": "Meta (Together)",
        "mistral": "Mistral",
        "cohere": "Cohere",
        "deepseek": "DeepSeek",
        "qwen": "Qwen",
        "grok": "xAI (Grok)",
        "perplexity": "Perplexity",
        "kimi": "Moonshot (Kimi)",
        "minimax": "MiniMax",
    ]

    /// Adapter name → key field name (mirrors the JS KEY_FIELD map).
    private let keyFieldFor: [String: String] = [
        "openai": "openai", "anthropic": "anthropic", "google": "google",
        "llama": "together", "mistral": "mistral", "cohere": "cohere",
        "deepseek": "deepseek", "qwen": "qwen", "grok": "xai",
        "perplexity": "perplexity", "kimi": "moonshot",
        "minimax": "minimax",
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Settings").font(Brand.font(15, weight: .heavy))

            VStack(alignment: .leading, spacing: 6) {
                Text("API endpoint").font(Brand.font(11, weight: .semibold)).foregroundColor(.secondary)
                TextField("http://localhost:8787/v1/check", text: $vm.endpoint)
                    .textFieldStyle(.roundedBorder)
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Keys & models").font(Brand.font(11, weight: .semibold)).foregroundColor(.secondary)
                    Spacer()
                    Button("Refresh") {
                        Task { await vm.refreshCatalog() }
                    }
                    .controlSize(.small)
                }
                Text("Models are optional — leave empty to use the provider's default.")
                    .font(Brand.font(10)).foregroundColor(.secondary)

                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(vm.providerCatalog) { p in
                            providerRow(p)
                        }
                    }
                }
                .frame(maxHeight: 280)
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("Permissions").font(Brand.font(11, weight: .semibold)).foregroundColor(.secondary)
                HStack {
                    Image(systemName: permissions.accessibilityGranted ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .foregroundColor(permissions.accessibilityGranted ? .green : .red)
                    Text("Accessibility")
                    Spacer()
                    Button("Open…") { permissions.openAccessibilitySettings() }
                        .controlSize(.small)
                }
                HStack {
                    Image(systemName: "info.circle").foregroundColor(.secondary)
                    Text("Automation (Word, Pages, Outlook, Mail)")
                    Spacer()
                    Button("Open…") { permissions.openAutomationSettings() }
                        .controlSize(.small)
                }
                .font(Brand.font(12))
            }

            HStack {
                Spacer()
                Button("Done") {
                    vm.saveSettings()
                    dismiss()
                }
                .buttonStyle(.borderedProminent).tint(Brand.magenta)
            }
        }
        .padding(20)
        .frame(width: 520)
        .task { await vm.refreshCatalog() }
    }

    @ViewBuilder
    private func providerRow(_ p: ProviderInfo) -> some View {
        let keyField = keyFieldFor[p.name] ?? p.name
        let label = providerLabels[p.name] ?? p.name
        HStack(alignment: .center, spacing: 8) {
            Text(label)
                .font(Brand.font(11, weight: .semibold))
                .frame(width: 110, alignment: .leading)
            SecureField("API key", text: keyBinding(keyField))
                .textFieldStyle(.roundedBorder)
            modelPicker(provider: p)
        }
    }

    @ViewBuilder
    private func modelPicker(provider p: ProviderInfo) -> some View {
        let binding = modelBinding(p.name)
        HStack(spacing: 4) {
            TextField(p.default, text: binding).textFieldStyle(.roundedBorder)
            Menu {
                Button("Default (\(p.default))") {
                    vm.modelOverrides[p.name] = nil
                }
                Divider()
                ForEach(p.suggestions, id: \.self) { m in
                    Button(m) { vm.modelOverrides[p.name] = m }
                }
            } label: {
                Image(systemName: "chevron.down")
            }
            .menuStyle(.borderlessButton)
            .frame(width: 28)
        }
    }

    private func keyBinding(_ field: String) -> Binding<String> {
        Binding(
            get: { vm.keys[field] ?? "" },
            set: { v in
                if v.isEmpty { vm.keys.removeValue(forKey: field) } else { vm.keys[field] = v }
            }
        )
    }

    private func modelBinding(_ provider: String) -> Binding<String> {
        Binding(
            get: { vm.modelOverrides[provider] ?? "" },
            set: { v in
                if v.isEmpty { vm.modelOverrides.removeValue(forKey: provider) } else { vm.modelOverrides[provider] = v }
            }
        )
    }
}
