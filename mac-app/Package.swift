// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Qrammerly",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "Qrammerly", targets: ["Qrammerly"])
    ],
    targets: [
        .executableTarget(
            name: "Qrammerly",
            path: "Sources/Qrammerly",
            resources: [
                .copy("../../Info.plist"),
                .copy("../../Qrammerly.entitlements")
            ]
        )
    ]
)
