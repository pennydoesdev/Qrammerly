import Foundation

actor CheckerClient {
    var endpoint: URL

    init(endpoint: URL = URL(string: "http://localhost:8787/v1/check")!) {
        self.endpoint = endpoint
    }

    func check(_ text: String) async throws -> CheckResponse {
        var req = URLRequest(url: endpoint)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["text": text])
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(CheckResponse.self, from: data)
    }
}
