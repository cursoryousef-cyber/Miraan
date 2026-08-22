//
//  JoiningDeclarationSheet.swift
//  Miran
//
//  Mandatory Joining & Academic Affairs Declaration Acceptance Sheet for iOS.
//

import SwiftUI

struct JoiningDeclarationSheet: View {
    let declaration: DeclarationModel
    let onAccept: () async -> Void

    @State private var isAccepted = false
    @State private var isSubmitting = false

    var body: some View {
        NavigationView {
            ZStack {
                MiranTheme.background
                    .ignoresSafeArea()

                VStack(spacing: 20) {
                    // Header Banner
                    VStack(spacing: 8) {
                        Image(systemName: "doc.text.fill")
                            .font(.system(size: 40))
                            .foregroundColor(MiranTheme.emerald)

                        Text(declaration.titleAr)
                            .font(.title3.weight(.bold))
                            .foregroundColor(.white)
                            .multilineTextAlignment(.center)

                        Text("إقرار وتعهد إجباري ممتثل للشؤون الأكاديمية (v\(declaration.version))")
                            .font(.caption)
                            .foregroundColor(MiranTheme.subtext)
                    }

                    // Content Scroll
                    ScrollView {
                        Text(declaration.contentAr)
                            .font(.body)
                            .foregroundColor(.white.opacity(0.9))
                            .lineSpacing(6)
                            .padding()
                            .background(Color.white.opacity(0.04))
                            .cornerRadius(16)
                            .overlay(
                                RoundedRectangle(cornerRadius: 16)
                                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
                            )
                    }

                    // Checkbox & Action Button
                    VStack(spacing: 16) {
                        Toggle(isOn: $isAccepted) {
                            Text("أقر وأتعهد بالالتزام بكافة البنود والشروط المذكورة أعلاه")
                                .font(.caption.weight(.semibold))
                                .foregroundColor(.white)
                        }
                        .toggleStyle(CheckboxToggleStyle())

                        Button {
                            Task {
                                isSubmitting = true
                                await onAccept()
                                isSubmitting = false
                            }
                        } label: {
                            HStack {
                                if isSubmitting {
                                    ProgressView().tint(.white)
                                } else {
                                    Text("توقيع وتأكيد الموافقة الرقمية")
                                        .font(.headline.weight(.bold))
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(isAccepted ? MiranTheme.emerald : Color.gray.opacity(0.3))
                            .foregroundColor(.white)
                            .cornerRadius(12)
                        }
                        .disabled(!isAccepted || isSubmitting)
                    }
                }
                .padding()
            }
            .navigationTitle("الإقرار والتعهد الرقمي")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct CheckboxToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack {
            Image(systemName: configuration.isOn ? "checkmark.square.fill" : "square")
                .foregroundColor(configuration.isOn ? MiranTheme.emerald : MiranTheme.subtext)
                .font(.title3)
                .onTapGesture {
                    configuration.isOn.toggle()
                }
            configuration.label
        }
    }
}

struct DeclarationModel: Codable, Identifiable {
    let id: String
    let type: String
    let titleAr: String
    let contentAr: String
    let version: Int
}
