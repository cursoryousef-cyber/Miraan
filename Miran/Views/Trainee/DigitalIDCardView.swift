//
//  DigitalIDCardView.swift
//  Miran
//
//  Digital Trainee ID Card — flips to a QR code encoding a signed, opaque
//  verification token (fetched from GET /trainees/card/qr-token). The token
//  never carries the national ID; scanning it resolves through the public
//  /trainees/card/verify endpoint server-side.
//

import SwiftUI
import CoreImage.CIFilterBuiltins

struct DigitalIDCardView: View {
    let profile: TraineeProfileModel?
    let rotation: RotationModel?
    let qrToken: String?

    @State private var isFlipped = false

    var body: some View {
        ZStack {
            if isFlipped {
                backFace
                    .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
            } else {
                frontFace
            }
        }
        .rotation3DEffect(.degrees(isFlipped ? 180 : 0), axis: (x: 0, y: 1, z: 0))
        .animation(.easeInOut(duration: 0.5), value: isFlipped)
        .padding(.horizontal)
    }

    // MARK: Front

    private var frontFace: some View {
        cardShell {
            VStack(spacing: 16) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("بطاقة طالب امتياز")
                            .font(.caption.weight(.bold))
                            .foregroundColor(MiranTheme.emerald)
                        Text(profile?.organization?.nameAr ?? "—")
                            .font(.caption2)
                            .foregroundColor(MiranTheme.subtext)
                    }
                    Spacer()
                    Text("مِران")
                        .font(.title3.weight(.black))
                        .foregroundColor(.white)
                }

                HStack(spacing: 16) {
                    ZStack {
                        Circle().fill(MiranTheme.emerald.opacity(0.2)).frame(width: 70, height: 70)
                        Image(systemName: "person.crop.circle.fill")
                            .font(.system(size: 60))
                            .foregroundColor(.white.opacity(0.9))
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(profile?.person?.nameAr ?? "—")
                            .font(.headline.weight(.bold))
                            .foregroundColor(.white)
                        Text(profile?.specialtyAr ?? "—")
                            .font(.subheadline)
                            .foregroundColor(MiranTheme.subtext)
                        HStack(spacing: 8) {
                            Label(profile?.traineeNumber ?? "—", systemImage: "number")
                                .font(.caption2.monospaced())
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .background(Color.white.opacity(0.1)).cornerRadius(6)
                            Label(profile?.level ?? "—", systemImage: "star.fill")
                                .font(.caption2.weight(.bold))
                                .foregroundColor(MiranTheme.emerald)
                        }
                    }
                    Spacer()
                }

                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("القسم / المدرب")
                            .font(.system(size: 9))
                            .foregroundColor(MiranTheme.subtext)
                        Text("\(rotation?.department?.nameAr ?? "—") · \(rotation?.trainerProfile?.person?.nameAr ?? "—")")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                    }
                    Spacer()
                    Button {
                        isFlipped = true
                    } label: {
                        Label("قلب البطاقة", systemImage: "arrow.triangle.2.circlepath")
                            .font(.caption2.weight(.bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(Color.white.opacity(0.12))
                            .cornerRadius(8)
                    }
                }
            }
            .padding(20)
        }
    }

    // MARK: Back

    private var backFace: some View {
        cardShell {
            VStack(spacing: 10) {
                if let token = qrToken, let image = Self.qrImage(from: token) {
                    Image(uiImage: image)
                        .interpolation(.none)
                        .resizable()
                        .frame(width: 130, height: 130)
                        .background(Color.white)
                        .cornerRadius(8)
                } else {
                    ProgressView()
                        .frame(width: 130, height: 130)
                }

                Text("رقم البطاقة: \(profile?.cardUuid ?? "—")")
                    .font(.caption2.monospaced())
                    .foregroundColor(.white)
                Text("الحالة: \(cardStatusLabel)")
                    .font(.caption2)
                    .foregroundColor(MiranTheme.subtext)
                Text("امسح للتحقق من بطاقة طالب الامتياز")
                    .font(.system(size: 10))
                    .foregroundColor(MiranTheme.subtext)
                    .multilineTextAlignment(.center)

                Button {
                    isFlipped = false
                } label: {
                    Label("الوجه الأمامي", systemImage: "arrow.triangle.2.circlepath")
                        .font(.caption2.weight(.bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(Color.white.opacity(0.12))
                        .cornerRadius(8)
                }
                .padding(.top, 4)
            }
            .padding(20)
        }
    }

    private var cardStatusLabel: String {
        switch profile?.cardStatus {
        case "active": return "سارية"
        case "revoked": return "ملغاة"
        default: return "غير مفعّلة"
        }
    }

    @ViewBuilder
    private func cardShell<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 24)
                .fill(LinearGradient(
                    colors: [Color(hex: "064e3b"), Color(hex: "022c22"), Color(hex: "0f172a")],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                ))
                .frame(height: 230)
                .overlay(
                    RoundedRectangle(cornerRadius: 24)
                        .stroke(LinearGradient(
                            colors: [MiranTheme.emerald.opacity(0.6), Color.white.opacity(0.1)],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        ), lineWidth: 1.5)
                )
                .shadow(color: MiranTheme.emerald.opacity(0.3), radius: 16, y: 8)
            content()
        }
    }

    private static func qrImage(from string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        guard let outputImage = filter.outputImage else { return nil }
        let transformed = outputImage.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        guard let cgImage = context.createCGImage(transformed, from: transformed.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
