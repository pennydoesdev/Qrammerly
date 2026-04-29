import SwiftUI

@MainActor
final class CheckerVM: ObservableObject {
    @Published var text: String = ""
    @Published var suggestions: [Suggestion] = []
    @Published var modelsUsed: [String] = []
    @Published var isChecking = false
    @Published var endpoint: String = "http://localhost:8787/v1/check"
    @Published var errorMessage: String?

    private var debounceTask: Task<Void, Never>?

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
            let resp = try await client.check(snapshot)
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
        scheduleCheck()
    }
}

struct ContentView: View {
    @StateObject private var vm = CheckerVM()
    @State private var showSettings = false

    var body: some View {
        VStack(spacing: 0) {
            TitleBar(showSettings: $showSettings, vm: vm)
            HStack(spacing: 0) {
                Editor(vm: vm)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                Divider()
                SuggestionsPane(vm: vm)
                    .frame(width: 320)
            }
            FooterBar(vm: vm)
        }
        .sheet(isPresented: $showSettings) { SettingsSheet(vm: vm) }
    }
}

private struct TitleBar: View {
    @Binding var showSettings: Bool
    @ObservedObject var vm: CheckerVM

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(LinearGradient(colors: [.black, Color(white: 0.18)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                Text("Q").font(.system(size: 14, weight: .bold)).foregroundColor(.white)
            }
            .frame(width: 26, height: 26)

            Text("Qrammerly")
                .font(.system(size: 13, weight: .semibold))

            Spacer()

            if vm.isChecking {
                ProgressView().controlSize(.small)
            }

            Button { showSettings = true } label: {
                Image(systemName: "slider.horizontal.3")
            }
            .buttonStyle(.borderless)
            .help("Settings")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
        .overlay(Divider(), alignment: .bottom)
    }
}

private struct Editor: View {
    @ObservedObject var vm: CheckerVM

    var body: some View {
        ZStack(alignment: .topLeading) {
            if vm.text.isEmpty {
                Text("Start typing or paste your draft here…")
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 22)
                    .padding(.top, 22)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $vm.text)
                .font(.system(size: 15))
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
                .onChange(of: vm.text) { _ in vm.scheduleCheck() }
        }
        .background(Color.clear)
    }
}

private struct SuggestionsPane: View {
    @ObservedObject var vm: CheckerVM

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Suggestions").font(.system(size: 12, weight: .semibold))
                Spacer()
                Text("\(vm.suggestions.count)")
                    .font(.system(size: 11)).foregroundColor(.secondary)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            Divider()

            if vm.suggestions.isEmpty {
                VStack(spacing: 6) {
                    Image(systemName: "checkmark.circle")
                        .font(.system(size: 28, weight: .light))
                        .foregroundColor(.secondary)
                    Text(vm.text.isEmpty ? "No text yet" : "Looks clean")
                        .font(.system(size: 12))
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
                    .font(.system(size: 9, weight: .semibold))
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(typeColor.opacity(0.18))
                    .foregroundColor(typeColor)
                    .clipShape(Capsule())
                Spacer()
                Text("\(Int(s.confidence * 100))% · \(s.agreed_by)/12")
                    .font(.system(size: 10)).foregroundColor(.secondary)
            }
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(s.original)
                    .strikethrough()
                    .foregroundColor(.secondary)
                Text("→").foregroundColor(.secondary)
                Text(s.replacement)
                    .fontWeight(.semibold)
            }
            .font(.system(size: 13))
            if !s.explanation.isEmpty {
                Text(s.explanation).font(.system(size: 11)).foregroundColor(.secondary)
            }
            HStack {
                Spacer()
                Button("Apply") { onApply() }
                    .controlSize(.small)
                    .buttonStyle(.borderedProminent)
                    .tint(.black)
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
        case "spelling", "grammar":  return Color(red: 0.82, green: 0.25, blue: 0.25)
        case "punctuation":          return Color(red: 0.94, green: 0.64, blue: 0.19)
        case "clarity":              return Color(red: 0.18, green: 0.50, blue: 0.93)
        case "style":                return Color(red: 0.18, green: 0.71, blue: 0.49)
        default:                     return .gray
        }
    }
}

private struct FooterBar: View {
    @ObservedObject var vm: CheckerVM

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(vm.errorMessage == nil ? Color.green : Color.red)
                .frame(width: 6, height: 6)
            if let err = vm.errorMessage {
                Text(err).font(.system(size: 11)).foregroundColor(.secondary)
            } else {
                Text(vm.modelsUsed.isEmpty
                     ? "Awaiting input"
                     : "\(vm.modelsUsed.count) models · \(vm.modelsUsed.joined(separator: ", "))")
                    .font(.system(size: 11)).foregroundColor(.secondary)
                    .lineLimit(1).truncationMode(.tail)
            }
            Spacer()
            Text("\(vm.text.count) chars").font(.system(size: 11)).foregroundColor(.secondary)
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(.ultraThinMaterial)
        .overlay(Divider(), alignment: .top)
    }
}

private struct SettingsSheet: View {
    @ObservedObject var vm: CheckerVM
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Settings").font(.system(size: 14, weight: .semibold))
            VStack(alignment: .leading, spacing: 6) {
                Text("API endpoint").font(.system(size: 11)).foregroundColor(.secondary)
                TextField("http://localhost:8787/v1/check", text: $vm.endpoint)
                    .textFieldStyle(.roundedBorder)
            }
            HStack {
                Spacer()
                Button("Done") { dismiss() }
                    .buttonStyle(.borderedProminent).tint(.black)
            }
        }
        .padding(20)
        .frame(width: 380)
    }
}
