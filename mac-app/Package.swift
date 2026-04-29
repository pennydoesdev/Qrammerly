// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Qrammarly",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "Qrammarly", targets: ["Qrammarly"])
    ],
    targets: [
        .executableTarget(
            name: "Qrammarly",
            path: "Sources/Qrammarly",
            resources: [
                .copy("../../Info.plist"),
                .copy("../../Qrammarly.entitlements")
            ]
        )
    ]
)
