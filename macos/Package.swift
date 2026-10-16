// swift-tools-version: 6.0
// Builds with Xcode Command Line Tools alone (`swift build`, `swift test`).
// The signed .app bundle (Info.plist privacy strings, entitlements, icon)
// needs full Xcode — see ARCHITECTURE.md § Native build.

import PackageDescription

let package = Package(
    name: "AURA",
    platforms: [.macOS(.v15)],
    products: [
        .executable(name: "AuraApp", targets: ["AuraApp"]),
        .library(name: "AuraCore", targets: ["AuraCore"]),
    ],
    targets: [
        .target(
            name: "AuraCore",
            linkerSettings: [.linkedLibrary("sqlite3")]
        ),
        .executableTarget(
            name: "AuraApp",
            dependencies: ["AuraCore"]
        ),
        .testTarget(
            name: "AuraCoreTests",
            dependencies: ["AuraCore"]
        ),
    ],
    swiftLanguageModes: [.v6]
)
