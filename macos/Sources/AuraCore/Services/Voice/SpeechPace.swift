import Foundation

/// Maps the user-facing speaking pace (Preferences.voice.speechRate: 1 = the voice's
/// natural pace) to AVSpeechUtterance.rate.
///
/// The native rate (0–1, default 0.5) is not linear in speed. Measured on macOS 27
/// by rendering a fixed 35-word passage with AVSpeechSynthesizer.write and timing
/// the audio (docs/PHASE3C_D_REAL_AUDIO.md §3):
/// - Apple's neural, Siri and compact voices (Simone, Riya, Daniel): below 0.5 the
///   pace falls gently (0.3 ≈ 0.82×, 0 ≈ 0.56×); above 0.5 it climbs steeply
///   (0.55 ≈ 1.30×, 0.6 ≈ 1.60×). The old "rate × multiplier" mapping turned 1.2
///   into 0.6, about 310 words a minute.
/// - Eloquence voices (Reed, Flo, Eddy…) slow down more below 0.5 (0 ≈ 0.41×).
/// The curves are relative to each voice's own pace at 0.5, so one table serves a
/// family; the pace is found by interpolating the inverse of the measured curve.
public enum SpeechPace {
    public static let range = Preferences.Voice.speechRateRange
    public static let defaultPace = Preferences.Voice.defaultSpeechRate

    /// (AVSpeechUtterance.rate, words per minute ÷ words per minute at 0.5).
    static let appleCurve: [(rate: Double, pace: Double)] = [
        (0.00, 0.56), (0.05, 0.60), (0.10, 0.65), (0.15, 0.69), (0.20, 0.73), (0.25, 0.78), (0.30, 0.82),
        (0.35, 0.86), (0.40, 0.91), (0.45, 0.95), (0.50, 1.00), (0.55, 1.30), (0.60, 1.60),
    ]
    static let eloquenceCurve: [(rate: Double, pace: Double)] = [
        (0.00, 0.41), (0.05, 0.45), (0.10, 0.49), (0.15, 0.53), (0.20, 0.57), (0.25, 0.64), (0.30, 0.70),
        (0.35, 0.76), (0.40, 0.82), (0.45, 0.89), (0.50, 1.00), (0.55, 1.27), (0.60, 1.62),
    ]

    static func curve(voiceIdentifier: String?) -> [(rate: Double, pace: Double)] {
        voiceIdentifier?.contains(".eloquence.") == true ? eloquenceCurve : appleCurve
    }

    /// The AVSpeechUtterance.rate that speaks at `pace` × the voice's natural pace.
    public static func utteranceRate(pace: Double, voiceIdentifier: String?) -> Float {
        let pace = pace.isFinite ? min(max(pace, range.lowerBound), range.upperBound) : defaultPace
        let table = curve(voiceIdentifier: voiceIdentifier)
        guard let upper = table.firstIndex(where: { $0.pace >= pace }) else { return Float(table.last!.rate) }
        guard upper > 0 else { return Float(table[0].rate) }
        let a = table[upper - 1], b = table[upper]
        let t = (pace - a.pace) / (b.pace - a.pace)
        return Float(a.rate + t * (b.rate - a.rate))
    }

    /// Silence after a sentence (seconds). AVSpeechSynthesizer pauses ~0.33 s between
    /// sentences inside one utterance at its default rate; AURA renders each sentence
    /// on its own, which loses that pause, so it is added back, longer at slower paces.
    public static func pause(after kind: SpokenPause, pace: Double) -> Double {
        let pace = pace.isFinite ? min(max(pace, range.lowerBound), range.upperBound) : defaultPace
        switch kind {
        case .none: return 0
        case .sentence: return 0.36 / pace
        case .paragraph: return 0.68 / pace
        }
    }
}
