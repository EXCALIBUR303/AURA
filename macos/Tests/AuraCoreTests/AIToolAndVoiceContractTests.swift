import Foundation
import Testing
@testable import AuraCore

// Phase 3C-A contracts for later phases: the AI tool permission boundary
// (3C-B executes tools) and voice route/interruption handling (3C-D wires
// real audio). Decisions only; nothing executes or records here.

@Suite struct AIToolPolicyTests {
    let policy = AIToolPolicy()

    func call(_ name: String, _ arguments: [String: JSONValue], id: String = "t1") -> AIToolCall {
        AIToolCall(id: id, name: name, arguments: arguments)
    }

    @Test func readOnlyToolsWithValidArgumentsAreAllowed() {
        guard case .allowed(let tool, let args) = policy.evaluate(call("list_recent_commits", ["fullName": .string("octo/aura"), "limit": .number(5)]), index: 0) else {
            Issue.record("expected allowed"); return
        }
        #expect(tool.effect == .readOnly)
        #expect(args == ["fullName": .string("octo/aura"), "limit": .number(5)])
    }

    @Test func toolsOffTheAllowlistAreDenied() {
        for name in ["run_shell", "write_file", "github_create_issue", "delete_repository", "rm -rf /"] {
            guard case .denied(let reason) = policy.evaluate(call(name, [:]), index: 0) else { Issue.record("\(name) not denied"); continue }
            #expect(!reason.contains("rm -rf"))
        }
    }

    @Test func malformedArgumentsAreDenied() {
        let cases: [(String, [String: JSONValue])] = [
            ("get_repository_metadata", [:]),                                                   // missing
            ("get_repository_metadata", ["fullName": .string("../../etc/passwd")]),             // traversal
            ("get_repository_metadata", ["fullName": .string("octo/aura"), "token": .string("x")]), // unknown argument
            ("get_repository_metadata", ["fullName": .number(1)]),                              // wrong type
            ("list_recent_commits", ["fullName": .string("octo/aura"), "limit": .number(500)]), // out of range
            ("list_recent_commits", ["fullName": .string("octo/aura"), "limit": .number(2.5)]),
            ("list_recent_commits", ["fullName": .string("octo/aura"), "branch": .string("main\nrm")]),
            ("list_repositories", ["query": .string(String(repeating: "q", count: 101))]),
            ("navigate_to_zone", ["zone": .string("settings")]),
        ]
        for (name, args) in cases {
            guard case .denied = policy.evaluate(call(name, args), index: 0) else { Issue.record("\(name) \(args) not denied"); continue }
        }
    }

    @Test func appActionsNeedTheUsersApprovalForThatExactCall() {
        let proposed = call("navigate_to_zone", ["zone": .string("hardware")])
        guard case .needsApproval = policy.evaluate(proposed, index: 0) else { Issue.record("expected approval"); return }

        var approvals = AIToolApprovals()
        approvals.approve(proposed)
        guard case .allowed = policy.evaluate(proposed, index: 0, approvals: approvals) else { Issue.record("expected allowed"); return }

        // The approval does not carry over to other arguments or another call id.
        guard case .needsApproval = policy.evaluate(call("navigate_to_zone", ["zone": .string("software")]), index: 0, approvals: approvals),
              case .needsApproval = policy.evaluate(call("navigate_to_zone", ["zone": .string("hardware")], id: "t2"), index: 0, approvals: approvals)
        else { Issue.record("approval leaked"); return }
    }

    @Test func emptyOptionalStringsCountAsLeftOut() {
        let lenient = policy.evaluate(call("read_repository_file", ["fullName": .string("octo/aura"), "path": .string("README.md"), "branch": .string("")]), index: 0)
        guard case .allowed(_, let args) = lenient else { Issue.record("expected allowed"); return }
        #expect(args["branch"] == nil)
        guard case .allowed(_, let coerced) = policy.evaluate(call("read_repository_file", ["fullName": .string("octo/aura"), "path": .string("a"), "startLine": .string("12")]), index: 0) else {
            Issue.record("expected a digit string to count as an integer"); return
        }
        #expect(coerced["startLine"] == .number(12))
        guard case .denied = policy.evaluate(call("read_repository_file", ["fullName": .string("octo/aura"), "path": .string("a"), "startLine": .string("1e3")]), index: 0) else {
            Issue.record("only plain digits are integers"); return
        }
        guard case .denied = policy.evaluate(call("read_repository_file", ["fullName": .string("octo/aura"), "path": .string("")]), index: 0) else {
            Issue.record("an empty required argument must be denied"); return
        }
    }

    @Test func repositoryPathsLoseSurroundingSlashes() {
        for (given, expected) in [("docs/", "docs"), ("./docs", "docs"), ("/README.md", "README.md"), ("./a/b/", "a/b")] {
            guard case .allowed(_, let args) = policy.evaluate(call("list_repository_files", ["fullName": .string("octo/aura"), "path": .string(given)]), index: 0) else {
                Issue.record("expected \(given) to be allowed"); continue
            }
            #expect(args["path"] == .string(expected))
        }
        for root in ["/", ".", "./"] {
            guard case .allowed(_, let args) = policy.evaluate(call("list_repository_files", ["fullName": .string("octo/aura"), "path": .string(root)]), index: 0) else {
                Issue.record("expected \(root) to mean the root"); continue
            }
            #expect(args["path"] == nil)
        }
        // Normalising never makes a traversal acceptable, and a required path stays required.
        guard case .denied = policy.evaluate(call("read_repository_file", ["fullName": .string("octo/aura"), "path": .string("/../secret")]), index: 0),
              case .denied = policy.evaluate(call("read_repository_file", ["fullName": .string("octo/aura"), "path": .string("/")]), index: 0)
        else { Issue.record("expected denial"); return }
    }

    @Test func sensitiveEffectsAreNeverGranted() {
        let custom = AIToolPolicy(tools: [AIToolDefinition(name: "push_branch", summary: "x", parameters: [], effect: .sensitive)])
        var approvals = AIToolApprovals()
        let proposed = call("push_branch", [:])
        approvals.approve(proposed)
        guard case .denied = custom.evaluate(proposed, index: 0, approvals: approvals) else { Issue.record("sensitive allowed"); return }
    }

    @Test func callsPerReplyAreCapped() {
        let query = call("list_repositories", ["query": .string("drone")])
        guard case .allowed = policy.evaluate(query, index: 7), case .denied = policy.evaluate(query, index: 8) else {
            Issue.record("cap not applied"); return
        }
    }

    @Test func theAllowlistHasNoWriteCapability() {
        #expect(AIToolPolicy.phase3CAllowlist.allSatisfy { $0.effect != .sensitive })
        #expect(Set(AIToolPolicy.phase3CAllowlist.map(\.name)) == [
            "get_active_workspace", "list_repositories", "get_repository_metadata", "list_recent_commits", "get_commit_details",
            "list_repository_files", "search_repository_paths", "read_repository_file", "navigate_to_zone",
        ])
    }
}

struct FakeRouteMonitor: AudioRouteMonitor {
    let stream: AsyncStream<AudioRouteChange>
    let continuation: AsyncStream<AudioRouteChange>.Continuation
    init() { (stream, continuation) = AsyncStream<AudioRouteChange>.makeStream() }
    func changes() -> AsyncStream<AudioRouteChange> { stream }
}

@Suite @MainActor struct VoiceRouteTests {
    func make() -> (VoiceSession, FakeSpeech) {
        let permissions = FakeVoicePermissions()
        permissions.current = (.granted, .granted)
        let speech = FakeSpeech()
        return (VoiceSession(permissions: permissions, input: speech, output: speech, locale: "en-US"), speech)
    }

    @Test func aRouteChangeStopsListeningAndReportsIt() async throws {
        let (session, _) = make()
        var interruptions: [VoiceInterruption] = []
        session.onInterruption = { interruptions.append($0) }
        let monitor = FakeRouteMonitor()
        session.observeRoutes(monitor)

        try session.startListening()
        monitor.continuation.yield(AudioRouteChange(direction: .input, deviceName: "AirPods"))
        for _ in 0..<100 where session.status.listening { try await Task.sleep(for: .milliseconds(5)) }
        #expect(!session.status.listening)
        #expect(interruptions == [.audioRouteChanged])

        // Idle sessions ignore route changes, and nothing restarts by itself.
        monitor.continuation.yield(AudioRouteChange(direction: .output, deviceName: nil))
        try await Task.sleep(for: .milliseconds(30))
        #expect(interruptions == [.audioRouteChanged])
        #expect(!session.status.listening && !session.status.speaking)
        session.stopObservingRoutes()
    }

    @Test func goingInactiveStopsSpeechAndListening() throws {
        let (session, _) = make()
        try session.speak("hello")
        session.handle(.appInactive)
        #expect(!session.status.speaking)
        try session.startListening()
        session.handle(.appInactive)
        #expect(!session.status.listening)
    }

    @Test func nothingListensUntilAsked() {
        let (session, _) = make()
        #expect(!session.status.listening)
        #expect(!session.status.speaking)
    }
}
