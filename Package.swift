// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "Miran",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(
            name: "Miran",
            targets: ["Miran"]
        )
    ],
    targets: [
        .target(
            name: "Miran",
            path: "Miran"
        )
    ]
)
