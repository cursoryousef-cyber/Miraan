//
//  LoginView.swift
//  Miran
//
//  SwiftUI Enterprise Light Theme Login View connected directly to Miran REST Auth API (/auth/login).
//  Redesigned with Light/Day Aesthetics, Safe Area support, RTL, and Keyboard avoiding behavior.
//

import SwiftUI

struct LoginView: View {
    enum Field: Hashable {
        case email
        case password
        case mfa
    }

    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var email = ""
    @State private var password = ""
    @State private var mfaCode = ""
    @FocusState private var focusedField: Field?

    var body: some View {
        ZStack {
            // Light Background (#F8FAFC)
            Color(red: 0.97, green: 0.98, blue: 0.99)
                .ignoresSafeArea()

            // Light Ambient Glow Shapes
            Circle()
                .fill(Color(red: 0.02, green: 0.59, blue: 0.41).opacity(0.08)) // Miran Emerald
                .blur(radius: 80)
                .frame(width: 320, height: 320)
                .offset(x: 140, y: -220)

            Circle()
                .fill(Color(red: 0.05, green: 0.58, blue: 0.53).opacity(0.06)) // Miran Teal
                .blur(radius: 80)
                .frame(width: 320, height: 320)
                .offset(x: -140, y: 220)

            ScrollView {
                VStack(spacing: 28) {
                    Spacer(minLength: 30)

                    // ── BRAND HEADER ──────────────────────────────────────────
                    VStack(spacing: 12) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 22)
                                .fill(LinearGradient(
                                    colors: [
                                        Color(red: 0.02, green: 0.59, blue: 0.41), // Emerald
                                        Color(red: 0.05, green: 0.58, blue: 0.53)  // Teal
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ))
                                .frame(width: 84, height: 84)
                                .shadow(color: Color(red: 0.02, green: 0.59, blue: 0.41).opacity(0.28), radius: 14, y: 6)

                            Text("مِ")
                                .font(.system(size: 44, weight: .black))
                                .foregroundColor(.white)
                        }

                        VStack(spacing: 4) {
                            Text("مِران (Miran)")
                                .font(.title.weight(.bold))
                                .foregroundColor(Color(red: 0.06, green: 0.09, blue: 0.16)) // #0F172A

                            Text("منصة التدريب الصحية الإلكترونية")
                                .font(.subheadline)
                                .foregroundColor(Color(red: 0.28, green: 0.33, blue: 0.41)) // #475569
                        }
                    }

                    // ── ERROR NOTIFICATION BANNER ─────────────────────────────
                    if let error = authViewModel.errorMessage {
                        HStack(spacing: 12) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 18))
                                .foregroundColor(Color(red: 0.88, green: 0.17, blue: 0.17))

                            Text(error)
                                .font(.caption.weight(.bold))
                                .foregroundColor(Color(red: 0.75, green: 0.12, blue: 0.12))
                                .multilineTextAlignment(.leading)

                            Spacer()
                        }
                        .padding(14)
                        .background(Color(red: 0.99, green: 0.93, blue: 0.93)) // Soft light red
                        .cornerRadius(14)
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(Color(red: 0.95, green: 0.73, blue: 0.73), lineWidth: 1)
                        )
                        .padding(.horizontal, 4)
                        .transition(.scale.combined(with: .opacity))
                    }

                    // ── CREDENTIALS CARD CONTAINER ────────────────────────────
                    VStack(spacing: 20) {
                        // Email Field
                        VStack(alignment: .leading, spacing: 8) {
                            Text("البريد الإلكتروني المؤسسي")
                                .font(.caption.weight(.bold))
                                .foregroundColor(Color(red: 0.28, green: 0.33, blue: 0.41))

                            HStack(spacing: 12) {
                                Image(systemName: "envelope.fill")
                                    .foregroundColor(focusedField == .email ? Color(red: 0.02, green: 0.59, blue: 0.41) : Color(red: 0.59, green: 0.64, blue: 0.72))

                                TextField("name@miran.health", text: $email)
                                    .keyboardType(.emailAddress)
                                    .autocapitalization(.none)
                                    .disableAutocorrection(true)
                                    .focused($focusedField, equals: .email)
                                    .foregroundColor(Color(red: 0.06, green: 0.09, blue: 0.16))
                            }
                            .padding(14)
                            .background(Color(red: 0.95, green: 0.96, blue: 0.98)) // #F1F5F9
                            .cornerRadius(14)
                            .overlay(
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(focusedField == .email ? Color(red: 0.02, green: 0.59, blue: 0.41) : Color(red: 0.89, green: 0.91, blue: 0.94), lineWidth: focusedField == .email ? 1.5 : 1)
                            )
                        }

                        // Password Field
                        VStack(alignment: .leading, spacing: 8) {
                            Text("كلمة المرور")
                                .font(.caption.weight(.bold))
                                .foregroundColor(Color(red: 0.28, green: 0.33, blue: 0.41))

                            HStack(spacing: 12) {
                                Image(systemName: "lock.fill")
                                    .foregroundColor(focusedField == .password ? Color(red: 0.02, green: 0.59, blue: 0.41) : Color(red: 0.59, green: 0.64, blue: 0.72))

                                SecureField("••••••••••••", text: $password)
                                    .focused($focusedField, equals: .password)
                                    .foregroundColor(Color(red: 0.06, green: 0.09, blue: 0.16))
                            }
                            .padding(14)
                            .background(Color(red: 0.95, green: 0.96, blue: 0.98)) // #F1F5F9
                            .cornerRadius(14)
                            .overlay(
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(focusedField == .password ? Color(red: 0.02, green: 0.59, blue: 0.41) : Color(red: 0.89, green: 0.91, blue: 0.94), lineWidth: focusedField == .password ? 1.5 : 1)
                            )
                        }

                        // Submit Button
                        Button {
                            focusedField = nil
                            Task {
                                await authViewModel.login(
                                    email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                                    password: password,
                                    mfaCode: mfaCode.isEmpty ? nil : mfaCode
                                )
                            }
                        } label: {
                            HStack(spacing: 8) {
                                if authViewModel.isLoading {
                                    ProgressView()
                                        .tint(.white)
                                } else {
                                    Text("تسجيل الدخول إلى حسابك")
                                        .font(.headline.weight(.bold))
                                    Image(systemName: "arrow.left.circle.fill")
                                        .font(.title3)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(LinearGradient(
                                colors: [
                                    Color(red: 0.02, green: 0.59, blue: 0.41),
                                    Color(red: 0.05, green: 0.58, blue: 0.53)
                                ],
                                startPoint: .leading,
                                endPoint: .trailing
                            ))
                            .foregroundColor(.white)
                            .cornerRadius(14)
                            .shadow(color: Color(red: 0.02, green: 0.59, blue: 0.41).opacity(0.32), radius: 10, y: 4)
                        }
                        .disabled(authViewModel.isLoading || email.isEmpty || password.isEmpty)
                        .opacity(email.isEmpty || password.isEmpty ? 0.6 : 1.0)
                    }
                    .padding(24)
                    .background(Color.white)
                    .cornerRadius(24)
                    .shadow(color: Color.black.opacity(0.06), radius: 16, x: 0, y: 4)
                    .overlay(
                        RoundedRectangle(cornerRadius: 24)
                            .stroke(Color(red: 0.89, green: 0.91, blue: 0.94), lineWidth: 1)
                    )

                    Spacer(minLength: 30)

                    Text("جميع الحقوق محفوظة د. فواز جمال الديدب 2026")
                        .font(.caption2)
                        .foregroundColor(Color(red: 0.59, green: 0.64, blue: 0.72))
                        .multilineTextAlignment(.center)
                }
                .padding(20)
            }
        }
    }
}
