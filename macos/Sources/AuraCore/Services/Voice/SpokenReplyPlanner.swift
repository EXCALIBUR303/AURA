import Foundation

/// The pause after a spoken sentence (SpeechPace.pause gives its length).
public enum SpokenPause: Equatable, Sendable {
    case none
    /// Between sentences of one paragraph.
    case sentence
    /// After a paragraph, heading, list item or on-screen notice.
    case paragraph
}

/// A sentence ready to be spoken.
public struct SpokenSegment: Equatable, Sendable {
    public var text: String
    public var pause: SpokenPause
    public init(_ text: String, pause: SpokenPause = .sentence) {
        self.text = text
        self.pause = pause
    }
    /// Segments are the same sentence when their text is; the pause is presentation.
    public static func == (a: SpokenSegment, b: SpokenSegment) -> Bool { a.text == b.text }
}

/// Turns streamed Markdown into complete, speakable sentences. Pure: fed the
/// reply's text in any chunking, it yields the same sentences.
///
/// - Only complete sentences are emitted while text streams; the rest waits for `finish()`.
/// - Fenced code is never read: the first block in a reply becomes "I've put the code on screen."
/// - Tables become "There's a table on screen."; URLs are never spoken (link text is).
/// - Markdown markers (#, *, _, `, >, list bullets) are dropped; numbered items keep their number.
public struct SpokenReplyPlanner: Sendable {
    /// Raw text of the current line not yet spoken.
    private var pending = ""
    /// Part of the current line was already spoken (its Markdown line start is consumed).
    private var lineContinues = false
    private var inFence = false
    private var announcedCode = false
    private var announcedTable = false
    /// Speakable text carried over from earlier lines of the same paragraph.
    private var sentenceBuffer = ""
    /// Speech for one reply is capped; the rest stays on screen.
    public static let maxSpokenCharacters = 4000
    private var spokenCharacters = 0
    private var truncated = false

    public init() {}

    /// Appends streamed text; returns the sentences it completed.
    public mutating func append(_ delta: String) -> [SpokenSegment] {
        pending += delta
        var out: [SpokenSegment] = []
        // A line's Markdown role is known once it ends.
        while let newline = pending.firstIndex(of: "\n") {
            let line = String(pending[..<newline])
            pending.removeSubrange(...newline)
            out += consume(line: line)
            lineContinues = false
        }
        // Within an unfinished line, complete sentences can already be spoken,
        // unless the line might still turn out to be code or a table.
        if !inFence, !pending.isEmpty, lineContinues || !Self.mightBeStructure(pending) {
            let raw = lineContinues ? pending : Self.lineStart(pending).text
            let (ready, rest) = Self.splitSentences(raw, final: false)
            if !ready.isEmpty {
                var sentences = ready.map(Self.speakable(inline:))
                if !sentenceBuffer.isEmpty {
                    sentences[0] = sentenceBuffer + " " + sentences[0]
                    sentenceBuffer = ""
                }
                out += emit(sentences)
                pending = rest
                lineContinues = true
            }
        }
        return out
    }

    /// The reply ended: returns everything left.
    public mutating func finish() -> [SpokenSegment] {
        var out: [SpokenSegment] = []
        if !pending.isEmpty {
            out += consume(line: pending)
            pending = ""
        }
        lineContinues = false
        let (ready, rest) = Self.splitSentences(sentenceBuffer, final: true)
        sentenceBuffer = ""
        let last = ready + (rest.isEmpty ? [] : [rest])
        out += emit(Array(last.dropLast())) + emit(Array(last.suffix(1)), pause: .paragraph)
        return out
    }

    private mutating func consume(line raw: String) -> [SpokenSegment] {
        if lineContinues {
            // The rest of a line whose start was already spoken.
            let (ready, rest) = Self.splitSentences(Self.speakable(inline: raw), final: false)
            sentenceBuffer = rest
            return emit(ready)
        }
        let line = raw.trimmingCharacters(in: .whitespaces)
        if line.hasPrefix("```") || line.hasPrefix("~~~") {
            inFence.toggle()
            if inFence, !announcedCode {
                announcedCode = true
                return flushSentence() + emit(["I've put the code on screen."], pause: .paragraph)
            }
            return []
        }
        if inFence { return [] }
        if line.hasPrefix("|") || line.range(of: #"^:?-{3,}:?(\s*\|\s*:?-{3,}:?)*\s*\|?$"#, options: .regularExpression) != nil, line.contains("|") {
            guard !announcedTable else { return [] }
            announcedTable = true
            return flushSentence() + emit(["There's a table on screen."], pause: .paragraph)
        }
        if line.isEmpty { return flushSentence() }
        if line.range(of: #"^(-{3,}|\*{3,}|_{3,})$"#, options: .regularExpression) != nil { return flushSentence() }

        let start = Self.lineStart(line)
        var text = Self.speakable(inline: start.text)
        var out: [SpokenSegment] = []
        if start.structural {
            // A heading or list item is its own sentence even without punctuation.
            out += flushSentence()
            if let last = text.last, !".!?:;".contains(last) { text += "." }
        }
        let joined = sentenceBuffer.isEmpty ? text : sentenceBuffer + " " + text
        let (ready, rest) = Self.splitSentences(joined, final: false)
        sentenceBuffer = rest
        out += emit(ready)
        if start.structural || sentenceBuffer.count > 300 { out += flushSentence() }
        return out
    }

    /// Strips a line's Markdown start (heading, quote, bullet, number).
    static func lineStart(_ line: String) -> (text: String, structural: Bool) {
        var text = line.trimmingCharacters(in: .whitespaces)
        var structural = false
        if let match = text.range(of: #"^#{1,6}\s+"#, options: .regularExpression) { text.removeSubrange(match); structural = true }
        if let match = text.range(of: #"^>\s?"#, options: .regularExpression) { text.removeSubrange(match) }
        if let match = text.range(of: #"^[-*+]\s+(\[[ xX]\]\s+)?"#, options: .regularExpression) { text.removeSubrange(match); structural = true }
        if let match = text.range(of: #"^\d+[.)]\s+"#, options: .regularExpression) {
            let number = text[match].filter(\.isNumber)
            text.replaceSubrange(match, with: "\(number). ")
            structural = true
        }
        return (text, structural)
    }

    private mutating func flushSentence() -> [SpokenSegment] {
        let rest = sentenceBuffer.trimmingCharacters(in: .whitespaces)
        sentenceBuffer = ""
        return rest.isEmpty ? [] : emit([rest], pause: .paragraph)
    }

    private mutating func emit(_ sentences: [String], pause: SpokenPause = .sentence) -> [SpokenSegment] {
        var out: [SpokenSegment] = []
        for sentence in sentences {
            let text = sentence.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty, text.contains(where: { $0.isLetter || $0.isNumber }), !truncated else { continue }
            if spokenCharacters + text.count > Self.maxSpokenCharacters {
                truncated = true
                out.append(SpokenSegment("The rest is on screen.", pause: .paragraph))
                break
            }
            spokenCharacters += text.count
            out.append(SpokenSegment(text, pause: pause))
        }
        return out
    }

    /// Text that may become a fence or table once its line completes.
    static func mightBeStructure(_ partialLine: String) -> Bool {
        let line = partialLine.trimmingCharacters(in: .whitespaces)
        return line.isEmpty || line.hasPrefix("`") || line.hasPrefix("~") || line.hasPrefix("|") || line.hasPrefix(":-") || line.hasPrefix("--")
    }

    /// Inline Markdown → plain speakable text.
    static func speakable(inline text: String) -> String {
        var s = text
        // Images say nothing; links keep their text; bare URLs are dropped.
        s = s.replacingOccurrences(of: #"!\[[^\]]*\]\([^)]*\)"#, with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: #"\[([^\]]+)\]\([^)]*\)"#, with: "$1", options: .regularExpression)
        s = s.replacingOccurrences(of: #"<?https?://[^\s>)]+>?"#, with: "", options: .regularExpression)
        // Inline code is read as its text.
        s = s.replacingOccurrences(of: #"`([^`]*)`"#, with: "$1", options: .regularExpression)
        // Emphasis markers.
        s = s.replacingOccurrences(of: #"(\*\*|__|\*|_|~~)(?=\S)(.+?)(?<=\S)\1"#, with: "$2", options: .regularExpression)
        s = s.replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression)
        // Markers left unbalanced by a sentence split are never read out.
        s = s.replacingOccurrences(of: #"\*+|`+|~~"#, with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: #"\s{2,}"#, with: " ", options: .regularExpression)
        return s
    }

    /// Splits off complete sentences. A sentence ends at . ! ? followed by a
    /// space and a capital, digit or quote, skipping common abbreviations and decimals.
    static func splitSentences(_ text: String, final: Bool) -> (ready: [String], rest: String) {
        var ready: [String] = []
        var current = ""
        let chars = Array(text)
        var i = 0
        while i < chars.count {
            let c = chars[i]
            current.append(c)
            if ".!?".contains(c) {
                // Absorb closing punctuation and quotes.
                while i + 1 < chars.count, ".!?\"')”’".contains(chars[i + 1]) { i += 1; current.append(chars[i]) }
                let nextIsBoundary = i + 1 < chars.count && chars[i + 1] == " "
                let afterSpace = i + 2 < chars.count ? chars[i + 2] : nil
                if nextIsBoundary, let after = afterSpace, after.isUppercase || after.isNumber || "\"'“‘(".contains(after),
                   !endsWithAbbreviation(current) {
                    ready.append(current.trimmingCharacters(in: .whitespaces))
                    current = ""
                    i += 1 // skip the space
                }
            }
            i += 1
        }
        if final {
            let rest = current.trimmingCharacters(in: .whitespaces)
            if !rest.isEmpty { ready.append(rest) }
            return (ready, "")
        }
        return (ready, current.trimmingCharacters(in: .whitespaces).isEmpty ? "" : current)
    }

    static let abbreviations: Set<String> = ["e.g.", "i.e.", "etc.", "vs.", "mr.", "mrs.", "ms.", "dr.", "st.", "no.", "fig.", "approx."]

    static func endsWithAbbreviation(_ sentence: String) -> Bool {
        // A list number ("1.") on its own starts its item; it does not end a sentence.
        if sentence.trimmingCharacters(in: .whitespaces).range(of: #"^\d+\.$"#, options: .regularExpression) != nil { return true }
        guard let last = sentence.split(separator: " ").last?.lowercased() else { return false }
        return abbreviations.contains(last) || last.count == 2 && last.first!.isLetter && last.hasSuffix(".")
    }
}
