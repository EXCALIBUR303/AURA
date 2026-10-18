import Foundation
import Testing
@testable import AuraCore

// Phase 3A service foundations: AI provider configuration,
// voice session. All fakes; nothing touches the network, Keychain or audio.

// GitHub tests live in GitHubTests.swift (Phase 3B).

// MARK: AI

// Phase 3C-A replaced the Phase 3A AI catalog; see AITests.swift.

@Suite struct AIProviderConfigurationTests {
    func settings(_ baseUrl: String, id: String = "p1", models: [String] = ["m"], defaultModel: String? = nil) -> AIProviderSettings {
        AIProviderSettings(id: id, displayName: "P", baseUrl: baseUrl, models: models, defaultModel: defaultModel)
    }

    func valid(_ settings: AIProviderSettings) -> Bool { (try? AIProviderConfiguration(settings)) != nil }

    @Test func endpointsAndIdsAreValidated() throws {
        #expect(try AIProviderConfiguration(settings("http://127.0.0.1:11434/v1")).kind == .local)
        #expect(try AIProviderConfiguration(settings("http://localhost:1234/v1")).kind == .local)
        #expect(try AIProviderConfiguration(settings("http://[::1]:8080/v1")).kind == .local)
        #expect(try AIProviderConfiguration(settings("https://api.example.com/v1")).kind == .cloud)
        #expect(!valid(settings("http://192.168.1.5:11434/v1")))     // LAN over http
        #expect(!valid(settings("http://api.example.com/v1")))       // remote over http
        #expect(!valid(settings("https://user:pw@api.example.com/v1")))
        #expect(!valid(settings("https://api.example.com/v1?key=x")))
        #expect(!valid(settings("https://api.example.com/v1#x")))
        #expect(!valid(settings("ftp://api.example.com")))
        #expect(!valid(settings("https://api.example.com/v1", id: "Bad Id")))
        #expect(!valid(settings("https://api.example.com/v1", models: [])))
        #expect(!valid(settings("https://api.example.com/v1", models: ["a b"])))
        #expect(!valid(settings("https://api.example.com/v1", models: ["m"], defaultModel: "other")))
        #expect(valid(settings("https://api.example.com/v1", models: ["openai/gpt-x", "llama3.2:latest"])))
    }

    @Test func keysAreTrimmedAndValidated() throws {
        let secrets = InMemorySecretStore()
        let credentials = AICredentialStore(secrets: secrets)
        let remote = try AIProviderConfiguration(settings("https://api.example.com/v1", id: "cloud"))
        #expect(throws: AuraError.self) { try credentials.saveKey("   ", for: remote) }
        #expect(throws: AuraError.self) { try credentials.saveKey("sk-with space", for: remote) }
        try credentials.saveKey(" sk-test \n", for: remote)
        #expect(try secrets.read(.aiProviderKey("cloud")) == "sk-test")
        #expect(credentials.hasKey(for: remote))
        try credentials.deleteKey(for: remote)
        #expect(!credentials.hasKey(for: remote))
    }
}
