//
//  RoleSelectionView.swift
//  مِران
//
//  شاشة اختيار الدور — تقوم مقام تسجيل الدخول في النسخة التجريبية.
//

import SwiftUI

struct RoleSelectionView: View {
    @EnvironmentObject var store: AppStore
    @State private var showRegistration = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {

                    VStack(spacing: 8) {
                        Text("مِـران")
                            .font(.system(size: 52, weight: .bold))
                            .foregroundStyle(MiranTheme.accent)
                        Text("نظام إدارة رحلة المتدرب وقياس الاستجابة")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 40)

                    Divider().padding(.horizontal, 40)

                    Text("اختر الدور للدخول")
                        .font(.headline)

                    VStack(spacing: 12) {
                        ForEach(UserRole.allCases) { role in
                            Button {
                                store.role = role
                            } label: {
                                HStack(spacing: 14) {
                                    Image(systemName: role.icon)
                                        .font(.title2)
                                        .frame(width: 44, height: 44)
                                        .background(MiranTheme.accent.opacity(0.12), in: Circle())
                                        .foregroundStyle(MiranTheme.accent)

                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(role.title).font(.headline)
                                        Text(role.subtitle)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.left")
                                        .foregroundStyle(.tertiary)
                                }
                                .miranCard(tint: MiranTheme.accent)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal)

                    Button {
                        showRegistration = true
                    } label: {
                        Label("متدرب جديد — التسجيل الذاتي", systemImage: "person.badge.plus")
                            .font(.subheadline.bold())
                    }
                    .padding(.top, 4)

                    Text("نسخة تجريبية ببيانات وهمية داخل الجهاز — لا يوجد خادم متصل.")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 30)
                        .padding(.top, 20)
                }
                .padding(.bottom, 40)
            }
            .background(Color(.systemGroupedBackground))
            .sheet(isPresented: $showRegistration) {
                RegistrationView()
            }
        }
    }
}
