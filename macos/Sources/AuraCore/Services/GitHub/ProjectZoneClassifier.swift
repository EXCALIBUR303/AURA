import Foundation

/// Suggests a studio zone (Hardware Lab, Software Studio, AI / LLM Lab) for
/// a repository from its topics, name, description and primary language.
/// Deterministic and explainable: every suggestion lists the signals that
/// matched. Ambiguous repositories (no signal, or a tie) get no suggestion.
/// Suggestions are never applied automatically.
public enum ProjectZoneClassifier {
    typealias Zone = ProjectZoneSuggestion.Zone

    static let keywords: [Zone: Set<String>] = [
        .hardware: [
            "hardware", "firmware", "embedded", "arduino", "esp32", "esp8266", "stm32", "rp2040", "raspberry", "raspberrypi",
            "pcb", "kicad", "fpga", "verilog", "vhdl", "robot", "robotics", "iot", "microcontroller", "mcu", "electronics",
            "circuit", "schematic", "sensor", "sensors", "drone", "3dprinting", "cnc", "rtos", "zephyr", "platformio",
        ],
        .aiLab: [
            "ai", "ml", "llm", "llms", "gpt", "nlp", "rag", "agent", "agents", "chatbot", "transformer", "transformers",
            "pytorch", "tensorflow", "keras", "huggingface", "langchain", "ollama", "openai", "anthropic", "claude",
            "embedding", "embeddings", "neural", "diffusion", "finetune", "finetuning", "inference", "machinelearning",
            "deeplearning", "computervision", "vision", "dataset", "datasets", "prompt", "prompts", "mlops",
        ],
        .software: [
            "web", "app", "apps", "website", "frontend", "backend", "api", "cli", "server", "ios", "macos", "android",
            "react", "nextjs", "vue", "svelte", "swiftui", "electron", "tauri", "node", "nodejs", "django", "flask",
            "fastapi", "rails", "saas", "dashboard", "extension", "library", "sdk", "plugin", "portfolio",
        ],
    ]

    static let languages: [String: (Zone, Int)] = [
        "C": (.hardware, 1), "C++": (.hardware, 1), "Assembly": (.hardware, 2), "Verilog": (.hardware, 3),
        "SystemVerilog": (.hardware, 3), "VHDL": (.hardware, 3), "OpenSCAD": (.hardware, 3), "KiCad Layout": (.hardware, 3),
        "Jupyter Notebook": (.aiLab, 2),
        "TypeScript": (.software, 1), "JavaScript": (.software, 1), "Swift": (.software, 1), "Kotlin": (.software, 1),
        "Go": (.software, 1), "Rust": (.software, 1), "Java": (.software, 1), "Ruby": (.software, 1), "PHP": (.software, 1),
        "Dart": (.software, 1), "HTML": (.software, 1), "CSS": (.software, 1), "Vue": (.software, 1), "Svelte": (.software, 1),
    ]

    /// Suggestions for repositories with no zone in `records`.
    public static func suggestions(for repositories: [RepositorySummary], records: [ProjectRecord]) -> [ProjectZoneSuggestion] {
        let assigned = Set(records.filter { $0.zone != nil }.map(\.id))
        return repositories.filter { !assigned.contains($0.fullName) }.compactMap(suggest)
    }

    public static func suggest(_ repo: RepositorySummary) -> ProjectZoneSuggestion? {
        var scores: [Zone: Int] = [:]
        var reasons: [Zone: [String]] = [:]
        func add(_ zone: Zone, _ points: Int, _ reason: String) {
            scores[zone, default: 0] += points
            if !(reasons[zone]?.contains(reason) ?? false) { reasons[zone, default: []].append(reason) }
        }

        for topic in repo.topics.map({ $0.lowercased() }) {
            let compact = topic.replacingOccurrences(of: "-", with: "")
            for (zone, words) in keywords where words.contains(topic) || words.contains(compact) {
                add(zone, 3, "topic: \(topic)")
            }
        }
        for word in Set(words(in: repo.name) + words(in: repo.description ?? "")) {
            for (zone, words) in keywords where words.contains(word) { add(zone, 2, "keyword: \(word)") }
        }
        if let language = repo.primaryLanguage, let (zone, points) = languages[language] {
            add(zone, points, "language: \(language)")
        }

        let ranked = scores.sorted { $0.value > $1.value }
        guard let best = ranked.first, best.value > 0 else { return nil }
        if ranked.count > 1, ranked[1].value == best.value { return nil }
        let confidence: ProjectZoneSuggestion.Confidence = best.value >= 4 ? .high : best.value >= 2 ? .medium : .low
        return ProjectZoneSuggestion(id: repo.fullName, zone: best.key, reasons: reasons[best.key] ?? [], confidence: confidence)
    }

    /// Lowercased words; splits on punctuation and camelCase ("sampleFirmware" → sample, firmware).
    static func words(in text: String) -> [String] {
        var spaced = ""
        var previous: Character?
        for character in text {
            if let previous, character.isUppercase, previous.isLowercase { spaced.append(" ") }
            spaced.append(character)
            previous = character
        }
        return spaced.lowercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber }).map(String.init)
    }
}
