import Foundation

actor CheckerClient {
    var endpoint: URL

    init(endpoint: URL = URL(string: "http://localhost:8787/v1/check")!) {
        self.endpoint = endpoint
    }

    func check(_ text: String, keys: [String: String] = [:], models: [String: String] = [:]) async throws -> CheckResponse {
        var req = URLRequest(url: endpoint)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = ["text": text]
        if !keys.isEmpty   { body["keys"] = keys }
        if !models.isEmpty { body["models"] = models }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(CheckResponse.self, from: data)
    }

    func fetchProviderCatalog() async -> [ProviderInfo] {
        let url = endpoint.deletingLastPathComponent().appendingPathComponent("models")
        guard let (data, resp) = try? await URLSession.shared.data(from: url),
              let http = resp as? HTTPURLResponse, http.statusCode == 200,
              let decoded = try? JSONDecoder().decode(ProviderCatalogResponse.self, from: data)
        else { return [] }
        return decoded.providers
    }
}

struct ProviderInfo: Decodable, Identifiable {
    var id: String { name }
    let name: String
    let `default`: String
    let suggestions: [String]
}

struct ProviderCatalogResponse: Decodable {
    let providers: [ProviderInfo]
}
