//
//  MiranTheme.swift
//  Miran
//
//  Centralized Healthcare Internship Platform Design System & Theme Manager.
//  Supports Dark, Light, and System modes with dynamic color resolution.
//

import SwiftUI
import Combine

// MARK: - Theme Mode Enum
enum AppThemeMode: String, CaseIterable, Codable {
    case dark = "DARK"
    case light = "LIGHT"
    case system = "SYSTEM"

    var titleAr: String {
        switch self {
        case .dark: return "ليلي"
        case .light: return "نهاري"
        case .system: return "النظام"
        }
    }

    var icon: String {
        switch self {
        case .dark: return "moon.fill"
        case .light: return "sun.max.fill"
        case .system: return "iphone"
        }
    }
}

// MARK: - Centralized Theme Manager (Observable)
final class ThemeManager: ObservableObject {
    static let shared = ThemeManager()

    @AppStorage("miran_theme_mode") var currentMode: AppThemeMode = .light {
        didSet {
            objectWillChange.send()
        }
    }

    /// Resolves the actual ColorScheme to apply based on selection
    func colorScheme(for systemColorScheme: ColorScheme) -> ColorScheme {
        switch currentMode {
        case .dark: return .dark
        case .light: return .light
        case .system: return systemColorScheme
        }
    }
}

// MARK: - Miran Design System Tokens & Dynamic Colors
struct MiranTheme {
    // Shared Brand Constants & Legacy Aliases
    static let primary = Color(hex: "10B981")     // Emerald Green
    static let emerald = Color(hex: "10B981")     // Emerald Green Alias
    static let green = Color(hex: "10B981")       // Green Alias
    static let success = Color(hex: "22C55E")     // Green
    static let warning = Color(hex: "F59E0B")     // Amber / Warning
    static let error = Color(hex: "EF4444")       // Red Error
    static let urgent = Color(hex: "EF4444")      // Urgent Red Alias
    static let accent = Color(hex: "8B5CF6")      // Purple Accent
    static let accentLight = Color(hex: "A78BFA") // Purple Accent Light Alias
    static let teal = Color(hex: "06B6D4")        // Teal
    static let subtext = Color(hex: "CBD5E1")     // Secondary Text Alias
    static let textSecondary = Color(hex: "CBD5E1") // Secondary Text Alias
    static let textPrimary = Color.white          // Primary Text Alias
    static let background = Color(hex: "0B1220")  // Dark Background Alias
    static let cardBg = Color(hex: "131A2B")      // Card Background Alias
    static let cardBackground = Color(hex: "131A2B") // Card Background Alias

    // Clinical Level Stripes
    static let stripeIntern = Color(hex: "10B981")   // Emerald Green
    static let stripeResident = Color(hex: "3B82F6") // Blue
    static let stripeStudent = Color(hex: "8B5CF6")  // Purple
    static let stripeNursing = Color(hex: "EC4899")  // Pink
    static let stripeAllied = Color(hex: "F59E0B")   // Amber

    // Dynamic Palette Resolvers (Support Light/Dark/System Switcher)
    static func background(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(hex: "0B1220") : Color(hex: "F8FAFC")
    }

    static func cardBackground(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(hex: "131A2B") : Color.white
    }

    static func surface(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(hex: "131A2B") : Color.white
    }

    static func secondarySurface(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(hex: "1C2436") : Color(hex: "F1F5F9")
    }

    static func info(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(hex: "3B82F6") : Color(hex: "2563EB")
    }

    static func primaryText(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Color.white : Color(hex: "0F172A")
    }

    static func secondaryText(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(hex: "CBD5E1") : Color(hex: "475569")
    }

    static func disabledText(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(hex: "64748B") : Color(hex: "94A3B8")
    }

    static func divider(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Color.white.opacity(0.08) : Color(hex: "0F172A").opacity(0.08)
    }

    static func border(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Color.white.opacity(0.1) : Color(hex: "0F172A").opacity(0.1)
    }
}

// MARK: - Miran Card ViewModifier
struct MiranCardModifier: ViewModifier {
    var tint: Color? = nil
    @Environment(\.colorScheme) var systemColorScheme

    func body(content: Content) -> some View {
        content
            .padding()
            .background(MiranTheme.surface(for: systemColorScheme))
            .cornerRadius(16)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(tint?.opacity(0.3) ?? MiranTheme.border(for: systemColorScheme), lineWidth: 1)
            )
            .shadow(color: systemColorScheme == .light ? Color.black.opacity(0.04) : Color.clear, radius: 8, x: 0, y: 2)
    }
}

extension View {
    func miranCard(tint: Color? = nil) -> some View {
        self.modifier(MiranCardModifier(tint: tint))
    }
}

// MARK: - Color Hex Extension
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Unified Theme Switcher Control Component
struct ThemeModePicker: View {
    @ObservedObject var themeManager = ThemeManager.shared
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        HStack(spacing: 4) {
            ForEach(AppThemeMode.allCases, id: \.self) { mode in
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        themeManager.currentMode = mode
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: mode.icon)
                            .font(.caption.bold())
                        Text(mode.titleAr)
                            .font(.caption.bold())
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        themeManager.currentMode == mode
                        ? MiranTheme.primary.opacity(0.2)
                        : Color.clear
                    )
                    .foregroundColor(
                        themeManager.currentMode == mode
                        ? MiranTheme.primary
                        : MiranTheme.secondaryText(for: systemColorScheme)
                    )
                    .cornerRadius(10)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(
                                themeManager.currentMode == mode
                                ? MiranTheme.primary.opacity(0.5)
                                : Color.clear,
                                lineWidth: 1
                            )
                    )
                }
            }
        }
        .padding(4)
        .background(MiranTheme.surface(for: systemColorScheme))
        .cornerRadius(14)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(MiranTheme.border(for: systemColorScheme), lineWidth: 1)
        )
    }
}
