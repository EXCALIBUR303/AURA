import Foundation

/// Rewrites a speakable sentence so developer terms are pronounced clearly. Only
/// the audio uses this text: captions and voice.speechProgress keep the original.
/// Rules are conservative and were checked by synthesising each term and
/// recognising it on device (RealSpeechClarityTests.pronunciationReport), then by ear.
/// Terms the voice already reads well (JSON, YAML, Xcode) are left alone: rewriting
/// YAML as "yammel" was recognised worse ("YAMO") than the original.
public enum SpeechPronunciation {
    /// Whole-token replacements (case-sensitive).
    static let terms: [String: String] = [
        "macOS": "mac O S", "iOS": "eye O S", "iPadOS": "eye pad O S", "watchOS": "watch O S", "visionOS": "vision O S", "tvOS": "T V O S",
        "SwiftUI": "Swift U I", "UIKit": "U I kit", "AppKit": "App kit", "WebKit": "Web kit", "WKWebView": "W K web view", "Xcode": "X code",
        "GitHub": "Git Hub", "GitLab": "Git Lab", "AURA": "Aura",
        "SQLite": "S Q lite", "PostgreSQL": "post gres Q L", "MySQL": "my S Q L",
        "npm": "N P M", "pnpm": "P N P M", "npx": "N P X", "README": "read me", "TODO": "to do", "OAuth": "oh auth",
        "regex": "rej ex", "nginx": "engine X", "kubectl": "cube control", "stdin": "standard in", "stdout": "standard out", "stderr": "standard error",
        "async": "a sync", "localhost": "local host", "Vite": "veet", "UUID": "U U I D", "CI/CD": "C I C D", "tsconfig": "T S config",
        "and/or": "and or", "e.g.": "for example", "i.e.": "that is", "etc.": "et cetera", "vs.": "versus", "approx.": "approximately",
    ]
    /// File extensions read after "dot".
    static let extensions: [String: String] = [
        "swift": "swift", "ts": "T S", "tsx": "T S X", "js": "J S", "jsx": "J S X", "mjs": "M J S", "json": "Jason", "md": "M D",
        "py": "pie", "yml": "Y M L", "yaml": "YAML", "toml": "T O M L", "sh": "S H", "css": "C S S", "html": "H T M L",
        "plist": "P list", "lock": "lock", "txt": "text", "glb": "G L B", "sqlite": "S Q lite", "xcodeproj": "X code project",
    ]
    /// Mixed-case words that are already pronounced as words.
    static let keepWhole: Set<String> = [
        "JavaScript", "TypeScript", "YouTube", "iPhone", "iPad", "iCloud", "PowerPoint", "LinkedIn", "WordPress", "PayPal",
        "OpenAI", "DeepMind", "FaceTime", "AirPods", "AirDrop", "MacBook", "iMac", "PlayStation", "McDonald",
    ]

    public static func spoken(_ text: String) -> String {
        var words: [String] = []
        for token in text.split(separator: " ", omittingEmptySubsequences: false) {
            words.append(rewrite(String(token)))
        }
        var s = words.joined(separator: " ")
        // Operators that appear in prose about code.
        for (from, to) in [(" && ", " and "), (" || ", " or "), (" -> ", " to "), (" => ", " to "), (" != ", " is not "), (" == ", " equals ")] {
            s = s.replacingOccurrences(of: from, with: to)
        }
        return s.replacingOccurrences(of: #"\s{2,}"#, with: " ", options: .regularExpression)
    }

    /// One whitespace-separated token, keeping its surrounding punctuation.
    static func rewrite(_ token: String) -> String {
        guard !token.isEmpty else { return token }
        // Split leading/trailing punctuation that is not part of the term.
        let leading = token.prefix { "([\"'“‘".contains($0) }
        var core = String(token.dropFirst(leading.count))
        var trailing = ""
        while let last = core.last, ",;:!?)]\"'”’".contains(last) || last == "." && !core.hasSuffix("e.g.") && !core.hasSuffix("i.e.") && !core.hasSuffix("etc.") && !core.hasSuffix("vs.") && !core.hasSuffix("approx.") {
            trailing = String(last) + trailing
            core.removeLast()
        }
        guard !core.isEmpty else { return token }
        return leading + transform(core) + trailing
    }

    static func transform(_ word: String) -> String {
        if let term = terms[word] { return term }
        // Plurals and possessives of known terms (APIs, GitHub's).
        if word.hasSuffix("'s"), let term = terms[String(word.dropLast(2))] { return term + "'s" }
        if word.hasSuffix("s"), word.count > 2, let term = terms[String(word.dropLast())], term.contains(" ") { return term + "s" }
        if keepWhole.contains(word) { return word }
        // Flags: --force, -v
        if let match = word.firstMatch(of: /^(-{1,2})([a-z][a-z0-9-]*)$/) {
            return (match.1.count == 2 ? "dash dash " : "dash ") + String(match.2).replacingOccurrences(of: "-", with: " ")
        }
        // Versions: v1.2.3 / 1.2.3 (three or more parts; plain decimals read fine).
        if let match = word.firstMatch(of: /^v?(\d+(?:\.\d+){2,})$/) {
            return (word.hasPrefix("v") ? "version " : "") + String(match.1).replacingOccurrences(of: ".", with: " point ")
        }
        // Issue and pull-request numbers.
        if let match = word.firstMatch(of: /^#(\d+)$/) { return "number \(match.1)" }
        // Commit hashes: 7–12 hex characters with letters and digits.
        if word.count >= 7, word.count <= 12, word.allSatisfy(\.isHexDigit), word.contains(where: \.isLetter), word.contains(where: \.isNumber) {
            return word.lowercased().map(String.init).joined(separator: " ")
        }
        // Paths and file names: src/app/main.swift, package.json, three.js. Plain
        // decimals, abbreviations and domains are left to the synthesizer.
        let isPath = word.contains("/") && word.contains(where: \.isLetter) && word.allSatisfy({ $0.isLetter || $0.isNumber || "/._-~".contains($0) })
        if isPath || isFileName(word) {
            return word.split(separator: "/").map { fileName(String($0)) }.joined(separator: " slash ")
        }
        return identifier(word)
    }

    static func isFileName(_ word: String) -> Bool {
        let pieces = word.split(separator: ".", omittingEmptySubsequences: false)
        guard pieces.count > 1, pieces.allSatisfy({ !$0.isEmpty }), let ext = pieces.last else { return false }
        return extensions[ext.lowercased()] != nil && pieces.dropLast().contains { $0.contains(where: \.isLetter) }
    }

    static func fileName(_ part: String) -> String {
        guard isFileName(part) else { return part == "." ? "dot" : part == ".." ? "dot dot" : identifier(part) }
        let pieces = part.split(separator: ".").map(String.init)
        return pieces.dropLast().map(identifier).joined(separator: " dot ") + " dot " + extensions[pieces.last!.lowercased()]!
    }

    /// camelCase, PascalCase with several humps, and snake_case become separate words.
    static func identifier(_ word: String) -> String {
        if let term = terms[word] { return term }
        if keepWhole.contains(word) { return word }
        if word.contains("_"), word.contains(where: \.isLetter) {
            // user_id → "user I D" (a bare "id" is read as the word "id").
            return word.split(separator: "_").map { $0.lowercased() == "id" ? "I D" : identifier(String($0)) }.joined(separator: " ")
        }
        guard word.count > 3, word.contains(where: \.isLowercase), word.dropFirst().contains(where: \.isUppercase) else { return word }
        var out = ""
        let chars = Array(word)
        for (i, c) in chars.enumerated() {
            if i > 0, c.isUppercase {
                // fetchUser|Data, HTTP|Server; but not API|s (a plural acronym stays whole).
                let afterLower = chars[i - 1].isLowercase || chars[i - 1].isNumber
                let startsWord = i + 1 < chars.count && chars[i + 1].isLowercase && chars[i - 1].isUppercase && !(i + 2 == chars.count && chars[i + 1] == "s")
                if afterLower || startsWord { out.append(" ") }
            }
            out.append(c)
        }
        return out
    }
}
