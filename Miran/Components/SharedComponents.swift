//
//  SharedComponents.swift
//  مِران
//
//  مكونات واجهة مشتركة: الباركود، العدّاد الحي، بطاقات الإحصاء.
//

import SwiftUI
import UIKit
import CoreImage
import CoreImage.CIFilterBuiltins

// MARK: - Fmt Helper
struct SectionTitle: View {
    var title: String
    var systemImage: String? = nil
    @Environment(\.colorScheme) var systemColorScheme

    init(_ title: String, systemImage: String? = nil) {
        self.title = title
        self.systemImage = systemImage
    }

    var body: some View {
        HStack(spacing: 6) {
            if let systemImage = systemImage {
                Image(systemName: systemImage)
                    .font(.caption.bold())
                    .foregroundColor(MiranTheme.primary)
            }
            Text(title)
                .font(.headline.bold())
                .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
        }
    }
}

struct Fmt {
    static func duration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        if mins > 0 {
            return "\(mins) د و \(secs) ث"
        }
        return "\(secs) ثانية"
    }

    static func duration(_ seconds: Int) -> String {
        return duration(TimeInterval(seconds))
    }

    static func time(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ar")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    static func shortDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ar")
        formatter.dateFormat = "d MMM"
        return formatter.string(from: date)
    }

    static func weekday(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ar")
        formatter.dateFormat = "EEEE"
        return formatter.string(from: date)
    }

    static func date(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ar")
        formatter.dateFormat = "d MMMM yyyy"
        return formatter.string(from: date)
    }

    static func percent(_ value: Double) -> String {
        return "\(Int(value * 100))%"
    }
}

// MARK: - MiranBadge
struct MiranBadge: View {
    var text: String
    var color: Color
    var icon: String? = nil

    init(_ text: String, color: Color = MiranTheme.primary, icon: String? = nil) {
        self.text = text
        self.color = color
        self.icon = icon
    }

    var body: some View {
        HStack(spacing: 4) {
            if let icon = icon {
                Image(systemName: icon)
                    .font(.caption2.bold())
            }
            Text(text)
                .font(.caption.bold())
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(color.opacity(0.15))
        .foregroundColor(color)
        .cornerRadius(8)
    }
}

// MARK: - StatTile & InfoRow Helpers
struct StatTile: View {
    var value: String
    var label: String
    var icon: String
    var color: Color = MiranTheme.primary
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().fill(color.opacity(0.15))
                    .frame(width: 36, height: 36)
                Image(systemName: icon)
                    .font(.caption.bold())
                    .foregroundColor(color)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.headline.bold())
                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                Text(label)
                    .font(.caption2)
                    .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
            }
            Spacer()
        }
        .padding(10)
        .background(MiranTheme.secondarySurface(for: systemColorScheme))
        .cornerRadius(12)
    }
}

struct InfoRow: View {
    var label: String
    var value: String
    var icon: String = "info.circle"
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundColor(MiranTheme.primary)
                .frame(width: 24)
            Text(label)
                .font(.caption)
                .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
            Spacer()
            Text(value)
                .font(.caption.bold())
                .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
        }
        .padding(.vertical, 4)
    }
}

struct QRCodeView: View {
    let content: String
    var size: CGFloat = 160

    var body: some View {
        Group {
            if let image = Self.generate(content) {
                Image(uiImage: image)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
            } else {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.gray.opacity(0.2))
                    .overlay(Image(systemName: "qrcode").font(.largeTitle).foregroundStyle(.secondary))
            }
        }
        .frame(width: size, height: size)
    }

    static func generate(_ string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        guard let cg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

// MARK: - صورة المتدرب

struct TraineeAvatar: View {
    var trainee: Trainee
    var size: CGFloat = 54

    var body: some View {
        Group {
            if let data = trainee.photoData, let ui = UIImage(data: data) {
                Image(uiImage: ui)
                    .resizable()
                    .scaledToFill()
            } else {
                ZStack {
                    Circle().fill(MiranTheme.primary.opacity(0.15))
                    Text(String(trainee.nameAr.prefix(1)))
                        .font(.system(size: size * 0.4, weight: .bold))
                        .foregroundColor(MiranTheme.primary)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}

// MARK: - شريط التقدم السريري

struct ClinicalProgressBar: View {
    var progress: Double
    var color: Color = MiranTheme.primary

    init(progress: Double, color: Color = MiranTheme.primary) {
        self.progress = progress
        self.color = color
    }

    init(value: Double, color: Color = MiranTheme.primary) {
        self.progress = value
        self.color = color
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 6)
                    .fill(color.opacity(0.15))
                RoundedRectangle(cornerRadius: 6)
                    .fill(color)
                    .frame(width: max(0, min(geo.size.width, geo.size.width * CGFloat(progress))))
            }
        }
        .frame(height: 8)
    }
}

typealias MiranProgressBar = ClinicalProgressBar

// MARK: - رسالة فارغة

struct EmptyStateView: View {
    var icon: String
    var title: String
    var message: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 40))
                .foregroundStyle(.tertiary)
            Text(title).font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 36)
    }
}

// MARK: - مؤقت زمني حي

struct LiveTimerText: View {
    var since: Date
    var now: Date

    var body: some View {
        let elapsed = max(0, now.timeIntervalSince(since))
        let mins = Int(elapsed) / 60
        let secs = Int(elapsed) % 60
        Text(String(format: "%02d:%02d", mins, secs))
    }
}

// MARK: - مقياس دائري للمؤشر

struct ScoreDial: View {
    var score: Double
    var label: String
    var color: Color
    var size: CGFloat = 110

    var body: some View {
        ZStack {
            Circle()
                .stroke(color.opacity(0.15), lineWidth: 12)
            Circle()
                .trim(from: 0, to: CGFloat(min(100, max(0, score))) / 100)
                .stroke(color, style: StrokeStyle(lineWidth: 12, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 2) {
                Text("\(Int(score))").font(.system(size: size * 0.28, weight: .bold))
                Text(label).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .frame(width: size, height: size)
    }
}
