import Foundation

struct Suggestion: Identifiable, Decodable, Hashable {
    let id = UUID()
    let start: Int
    let end: Int
    let original: String
    let replacement: String
    let type: String
    let explanation: String
    let confidence: Double
    let agreed_by: Int

    enum CodingKeys: String, CodingKey {
        case start, end, original, replacement, type, explanation, confidence, agreed_by
    }
}

struct CheckResponse: Decodable {
    let models_used: [String]
    let suggestions: [Suggestion]
}
