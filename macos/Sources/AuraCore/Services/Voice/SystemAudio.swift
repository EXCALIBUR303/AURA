@preconcurrency import AVFoundation
import CoreAudio
import Foundation
import Speech

// Live audio for AURA.app: microphone capture, device monitoring and permissions.
// Nothing here runs until the voice controller asks; nothing records at launch.

// MARK: capture

/// Captures the default input device with AVAudioEngine. Voice processing
/// (echo cancellation) is deliberately off: AURA is half-duplex, and in the D0
/// spike voice processing made engine start fail (-10875) on a Bluetooth headset.
public struct EngineAudioInput: AudioInputSource {
    let devices: any AudioDeviceMonitoring

    public init(devices: any AudioDeviceMonitoring) {
        self.devices = devices
    }

    public func start() async throws -> any AudioCapture {
        guard let device = devices.currentInput() else { throw VoiceAudioError.noInputDevice }
        return try EngineCapture.start(device: device)
    }
}

final class EngineCapture: AudioCapture, @unchecked Sendable {
    let device: VoiceDevice?
    let events: AsyncStream<AudioInputEvent>
    private let continuation: AsyncStream<AudioInputEvent>.Continuation
    private let lock = NSLock()
    private var engine: AVAudioEngine?
    private var observer: NSObjectProtocol?

    private init(device: VoiceDevice, engine: AVAudioEngine) {
        self.device = device
        self.engine = engine
        (events, continuation) = AsyncStream<AudioInputEvent>.makeStream(bufferingPolicy: .bufferingNewest(64))
    }

    static func start(device: VoiceDevice) throws -> EngineCapture {
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { throw VoiceAudioError.noInputDevice }
        let capture = EngineCapture(device: device, engine: engine)
        input.installTap(onBus: 0, bufferSize: 2048, format: format, block: capture.tapBlock())
        capture.observer = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil, using: capture.configurationBlock())
        engine.prepare()
        do {
            try engine.start()
        } catch {
            capture.stop()
            throw VoiceAudioError.engineFailed((error as NSError).code, transport: device.transport)
        }
        return capture
    }

    // Built here (nonisolated) so the realtime thread never calls actor-isolated code.
    private func tapBlock() -> AVAudioNodeTapBlock {
        let continuation = continuation
        return { @Sendable buffer, _ in
            guard let mono = AudioChunk.mono(buffer) else { return }
            continuation.yield(.chunk(AudioChunk(buffer: mono)))
        }
    }

    private func configurationBlock() -> @Sendable (Notification) -> Void {
        let continuation = continuation
        return { @Sendable _ in
            continuation.yield(.configurationChanged)
        }
    }

    func stop() {
        lock.lock()
        let engine = engine
        self.engine = nil
        let observer = observer
        self.observer = nil
        lock.unlock()
        guard let engine else { return }
        if let observer { NotificationCenter.default.removeObserver(observer) }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        continuation.finish()
    }

    deinit { stop() }
}

// MARK: devices

/// Default input/output devices and their changes, from CoreAudio property listeners.
public final class CoreAudioDeviceMonitor: AudioDeviceMonitoring, @unchecked Sendable {
    public init() {}

    public func currentInput() -> VoiceDevice? { Self.device(Self.defaultDevice(kAudioHardwarePropertyDefaultInputDevice)) }
    public func currentOutput() -> VoiceDevice? { Self.device(Self.defaultDevice(kAudioHardwarePropertyDefaultOutputDevice)) }

    public func changes() -> AsyncStream<AudioRouteChange> {
        AsyncStream { continuation in
            let watcher = DeviceWatcher(continuation: continuation)
            watcher.install()
            continuation.onTermination = { @Sendable _ in watcher.remove() }
        }
    }

    // MARK: CoreAudio helpers

    static func address(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
        AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    }

    static func defaultDevice(_ selector: AudioObjectPropertySelector) -> AudioDeviceID {
        var address = address(selector)
        var device = AudioDeviceID(0)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device) == noErr else { return 0 }
        return device
    }

    static func device(_ id: AudioDeviceID) -> VoiceDevice? {
        guard id != 0 else { return nil }
        return VoiceDevice(name: name(id), transport: transport(id))
    }

    static func name(_ id: AudioDeviceID) -> String {
        var address = address(kAudioObjectPropertyName)
        var name: Unmanaged<CFString>?
        var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, &name) == noErr, let name else { return "Audio device" }
        return name.takeRetainedValue() as String
    }

    static func transport(_ id: AudioDeviceID) -> VoiceTransport {
        var address = address(kAudioDevicePropertyTransportType)
        var value = UInt32(0)
        var size = UInt32(MemoryLayout<UInt32>.size)
        guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, &value) == noErr else { return .other }
        switch value {
        case kAudioDeviceTransportTypeBuiltIn: return .builtIn
        case kAudioDeviceTransportTypeBluetooth, kAudioDeviceTransportTypeBluetoothLE: return .bluetooth
        case kAudioDeviceTransportTypeUSB: return .usb
        default: return .other
        }
    }

    static func isAlive(_ id: AudioDeviceID) -> Bool {
        var address = address(kAudioDevicePropertyDeviceIsAlive)
        var value = UInt32(0)
        var size = UInt32(MemoryLayout<UInt32>.size)
        guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, &value) == noErr else { return false }
        return value != 0
    }
}

/// Listens for default-device changes and for the current input device going away.
final class DeviceWatcher: @unchecked Sendable {
    private let continuation: AsyncStream<AudioRouteChange>.Continuation
    private let queue = DispatchQueue(label: "com.aura.app.voice.devices")
    private var system: [(AudioObjectPropertyAddress, AudioObjectPropertyListenerBlock)] = []
    private var watchedInput: (AudioDeviceID, AudioObjectPropertyAddress, AudioObjectPropertyListenerBlock)?

    init(continuation: AsyncStream<AudioRouteChange>.Continuation) {
        self.continuation = continuation
    }

    func install() {
        queue.sync {
            for (selector, direction) in [(kAudioHardwarePropertyDefaultInputDevice, AudioRouteChange.Direction.input),
                                          (kAudioHardwarePropertyDefaultOutputDevice, .output)] {
                var address = CoreAudioDeviceMonitor.address(selector)
                let block = defaultChangedBlock(selector: selector, direction: direction)
                if AudioObjectAddPropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), &address, queue, block) == noErr {
                    system.append((address, block))
                }
            }
            watchInputLocked(CoreAudioDeviceMonitor.defaultDevice(kAudioHardwarePropertyDefaultInputDevice))
        }
    }

    func remove() {
        queue.sync {
            for (address, block) in system {
                var address = address
                AudioObjectRemovePropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), &address, queue, block)
            }
            system.removeAll()
            unwatchInputLocked()
        }
    }

    private func defaultChangedBlock(selector: AudioObjectPropertySelector, direction: AudioRouteChange.Direction) -> AudioObjectPropertyListenerBlock {
        { @Sendable [weak self] _, _ in
            guard let self else { return }
            let id = CoreAudioDeviceMonitor.defaultDevice(selector)
            if direction == .input { self.watchInputLocked(id) }
            self.continuation.yield(AudioRouteChange(direction: direction, kind: .defaultChanged, device: CoreAudioDeviceMonitor.device(id)))
        }
    }

    /// Called on `queue`.
    private func watchInputLocked(_ id: AudioDeviceID) {
        unwatchInputLocked()
        guard id != 0 else { return }
        var address = CoreAudioDeviceMonitor.address(kAudioDevicePropertyDeviceIsAlive)
        let block: AudioObjectPropertyListenerBlock = { @Sendable [weak self] _, _ in
            guard let self, !CoreAudioDeviceMonitor.isAlive(id) else { return }
            let next = CoreAudioDeviceMonitor.device(CoreAudioDeviceMonitor.defaultDevice(kAudioHardwarePropertyDefaultInputDevice))
            self.continuation.yield(AudioRouteChange(direction: .input, kind: .deviceLost, device: next))
        }
        if AudioObjectAddPropertyListenerBlock(id, &address, queue, block) == noErr {
            watchedInput = (id, address, block)
        }
    }

    private func unwatchInputLocked() {
        guard let (id, address, block) = watchedInput else { return }
        var copy = address
        AudioObjectRemovePropertyListenerBlock(id, &copy, queue, block)
        watchedInput = nil
    }
}

// MARK: permissions

public typealias VoicePermissionStatus = (microphone: PermissionState, speechRecognition: PermissionState)

public protocol VoicePermissions: Sendable {
    /// Current authorization. Never prompts.
    func status() -> VoicePermissionStatus
    /// Prompts for what is still undetermined: always the microphone, speech
    /// recognition only when `speechRecognition` is true. Then reports.
    func request(speechRecognition: Bool) async -> VoicePermissionStatus
}

/// Microphone (AVCaptureDevice) and speech recognition (SFSpeechRecognizer).
/// macOS terminates a process that requests either without a usage string in
/// its Info.plist, so `request` refuses to prompt outside the AURA.app bundle.
public struct SystemVoicePermissions: VoicePermissions {
    public init() {}

    public func status() -> VoicePermissionStatus {
        (Self.state(AVCaptureDevice.authorizationStatus(for: .audio)), Self.state(SFSpeechRecognizer.authorizationStatus()))
    }

    public func request(speechRecognition: Bool) async -> VoicePermissionStatus {
        let info = Bundle.main.infoDictionary ?? [:]
        guard info["NSMicrophoneUsageDescription"] != nil, info["NSSpeechRecognitionUsageDescription"] != nil else {
            Log.voice.error("voice permission request skipped: no usage descriptions in this bundle")
            return status()
        }
        if AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined {
            _ = await AVCaptureDevice.requestAccess(for: .audio)
        }
        if speechRecognition, SFSpeechRecognizer.authorizationStatus() == .notDetermined {
            await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
                SFSpeechRecognizer.requestAuthorization { @Sendable _ in done.resume() }
            }
        }
        return status()
    }

    static func state(_ status: AVAuthorizationStatus) -> PermissionState {
        switch status {
        case .authorized: .granted
        case .denied: .denied
        case .restricted: .restricted
        default: .notDetermined
        }
    }

    static func state(_ status: SFSpeechRecognizerAuthorizationStatus) -> PermissionState {
        switch status {
        case .authorized: .granted
        case .denied: .denied
        case .restricted: .restricted
        default: .notDetermined
        }
    }
}
