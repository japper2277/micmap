import Foundation

struct StoredTranscript: Codable {
    let id: String
    let createdAt: String
    let durationSec: Double
    let transcript: String
    let language: String
}

class TranscriptStorage {
    private static let key = "savedTranscripts"

    static func save(_ record: TranscriptRecord) {
        var all = loadAll()
        let stored = StoredTranscript(
            id: record.id,
            createdAt: record.createdAt,
            durationSec: record.durationSec,
            transcript: record.transcript,
            language: record.language
        )
        all.insert(stored, at: 0)
        if let data = try? JSONEncoder().encode(all) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    static func loadAll() -> [StoredTranscript] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let transcripts = try? JSONDecoder().decode([StoredTranscript].self, from: data) else {
            return []
        }
        return transcripts
    }

    static func delete(id: String) {
        var all = loadAll()
        all.removeAll { $0.id == id }
        if let data = try? JSONEncoder().encode(all) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}
