//
//  UserDetailRBACView.swift
//  Miran
//
//  Detailed User Profile & RBAC Security Breakdown View.
//  Presents Person, Account, Primary Role, Secondary Roles, Organizations, Department, and Permissions from Backend.
//

import SwiftUI

struct UserDetailRBACView: View {
    let user: UserProfileResponse

    var body: some View {
        ZStack {
            MiranTheme.background.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 16) {
                    // Header Banner
                    VStack(spacing: 8) {
                        Image(systemName: "person.crop.circle.badge.checkmark")
                            .font(.system(size: 60))
                            .foregroundColor(MiranTheme.emerald)

                        Text(user.nameAr)
                            .font(.title2.bold())
                            .foregroundColor(.white)

                        Text(user.email)
                            .font(.caption.monospaced())
                            .foregroundColor(MiranTheme.subtext)

                        Text(user.primaryRole.uppercased())
                            .font(.caption2.bold())
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(MiranTheme.emerald.opacity(0.2))
                            .foregroundColor(MiranTheme.emerald)
                            .cornerRadius(6)
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color.white.opacity(0.04))
                    .cornerRadius(16)

                    // 1. Person Information
                    RBACSectionCard(title: "بيانات الشخص الهوية (Person)", icon: "person.text.rectangle") {
                        RBACDetailRow(label: "الاسم بالعربي", value: user.nameAr)
                        RBACDetailRow(label: "الاسم بالإنجليزي", value: user.nameEn ?? "غير مدخل")
                        RBACDetailRow(label: "البريد الإلكتروني", value: user.email)
                    }

                    // 2. User Account Details
                    RBACSectionCard(title: "تفاصيل الحساب (Account)", icon: "key.fill") {
                        RBACDetailRow(label: "معرف الحساب (ID)", value: user.id)
                        RBACDetailRow(label: "الحالة التشغيلية", value: "نشط ومعتمد 🟢")
                    }

                    // 3. Roles Hierarchy (Primary & Secondary)
                    RBACSectionCard(title: "الأدوار والصلاحيات (Roles)", icon: "person.3.sequence.fill") {
                        RBACDetailRow(label: "الدور الأساسي (Primary Role)", value: user.primaryRole)
                        VStack(alignment: .leading, spacing: 6) {
                            Text("الأدوار المسجلة بـ Backend:")
                                .font(.caption.bold())
                                .foregroundColor(MiranTheme.subtext)
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack {
                                    ForEach(user.roles, id: \.self) { r in
                                        Text(r)
                                            .font(.caption2.bold())
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(Color.blue.opacity(0.2))
                                            .foregroundColor(.blue)
                                            .cornerRadius(6)
                                    }
                                }
                            }
                        }
                    }

                    // 4. Associated Organization, Hospital & University
                    RBACSectionCard(title: "الجهة والتجمع التابع (Organization)", icon: "building.2.fill") {
                        RBACDetailRow(label: "الجهة الحالية النشطة", value: user.activeOrganization.nameAr ?? "—")
                        RBACDetailRow(label: "رمز الجهة", value: user.activeOrganization.code ?? "—")
                    }

                    // 5. Backend Granted Permissions
                    RBACSectionCard(title: "مصفوفة الصلاحيات بالخادم (Permissions)", icon: "shield.checkered") {
                        if user.permissions.isEmpty {
                            Text("جميع صلاحيات الدور المعتمدة مفعلة آلياً بالخادم")
                                .font(.caption)
                                .foregroundColor(MiranTheme.subtext)
                        } else {
                            VStack(alignment: .leading, spacing: 6) {
                                ForEach(user.permissions, id: \.self) { perm in
                                    HStack {
                                        Image(systemName: "checkmark.shield.fill")
                                            .foregroundColor(MiranTheme.emerald)
                                            .font(.caption)
                                        Text(perm)
                                            .font(.caption.monospaced())
                                            .foregroundColor(.white)
                                    }
                                }
                            }
                        }
                    }
                }
                .padding()
            }
        }
        .navigationTitle("تفاصيل المستخدم والصلاحيات")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Helper Cards
struct RBACSectionCard<Content: View>: View {
    let title: String
    let icon: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: icon)
                    .foregroundColor(MiranTheme.emerald)
                Text(title)
                    .font(.headline.bold())
                    .foregroundColor(.white)
            }

            Divider().background(Color.white.opacity(0.1))

            content()
        }
        .padding()
        .background(Color.white.opacity(0.04))
        .cornerRadius(14)
    }
}

struct RBACDetailRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundColor(MiranTheme.subtext)
            Spacer()
            Text(value)
                .font(.caption.bold())
                .foregroundColor(.white)
        }
    }
}
