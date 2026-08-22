//
//  UniversalProfileView.swift
//  Miran
//
//  Profile screen for ALL roles.
//  Source of truth: authViewModel.currentUser (UserProfileResponse from /auth/me).
//  No local SeedData. No mock data. No role-gated display.
//

import SwiftUI

struct UniversalProfileView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var colorScheme
    @State private var showOrgSwitcher = false
    @State private var showLogoutConfirm = false
    @ObservedObject var themeManager = ThemeManager.shared

    private var user: UserProfileResponse? { authViewModel.currentUser }

    var body: some View {
        NavigationStack {
            ZStack {
                MiranTheme.background(for: colorScheme).ignoresSafeArea()

                if let user = user {
                    profileContent(user: user)
                } else {
                    MiranLoadingView(message: "جاري تحميل الملف الشخصي...")
                }
            }
            .navigationTitle("ملفي الشخصي")
            .navigationBarTitleDisplayMode(.large)
            .sheet(isPresented: $showOrgSwitcher) {
                OrgSwitcherSheet()
            }
            .confirmationDialog("تسجيل الخروج", isPresented: $showLogoutConfirm, titleVisibility: .visible) {
                Button("تسجيل الخروج", role: .destructive) {
                    authViewModel.logout()
                }
                Button("إلغاء", role: .cancel) {}
            } message: {
                Text("هل تريد تسجيل الخروج من الحساب الحالي؟")
            }
        }
    }

    @ViewBuilder
    private func profileContent(user: UserProfileResponse) -> some View {
        ScrollView {
            VStack(spacing: 0) {
                profileHeader(user: user)
                    .padding(.horizontal, 16)
                    .padding(.top, 16)

                Divider()
                    .padding(.vertical, 20)
                    .padding(.horizontal, 16)

                VStack(spacing: 12) {
                    // ── الحساب ──────────────────────────────────
                    sectionCard(title: "الحساب") {
                        infoRow(icon: "envelope.fill", label: "البريد الإلكتروني", value: user.email, color: MiranTheme.emerald)

                        if let nameEn = user.nameEn, !nameEn.isEmpty {
                            infoRow(icon: "person.fill", label: "الاسم بالإنجليزية", value: nameEn, color: MiranTheme.emerald)
                        }
                    }

                    // ── الجهة ──────────────────────────────────
                    sectionCard(title: "الجهة الحالية") {
                        infoRow(
                            icon: "building.2.fill",
                            label: "الجهة النشطة",
                            value: user.activeOrganization.displayName,
                            color: MiranTheme.teal
                        )

                        if let code = user.activeOrganization.code {
                            infoRow(icon: "number", label: "الكود", value: code, color: MiranTheme.teal)
                        }

                        if user.availableOrganizations.count > 1 {
                            Button {
                                showOrgSwitcher = true
                            } label: {
                                HStack {
                                    Image(systemName: "arrow.left.arrow.right.circle.fill")
                                        .foregroundColor(MiranTheme.emerald)
                                    Text("تبديل الجهة")
                                        .font(.subheadline)
                                        .foregroundColor(MiranTheme.emerald)
                                    Spacer()
                                    Text("\(user.availableOrganizations.count) جهات متاحة")
                                        .font(.caption)
                                        .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                                    Image(systemName: "chevron.left")
                                        .font(.caption.bold())
                                        .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                                }
                                .padding(.vertical, 4)
                            }
                        }
                    }

                    // ── الدور والصلاحيات ──────────────────────
                    sectionCard(title: "الدور والصلاحيات") {
                        infoRow(icon: "shield.fill", label: "الدور الأساسي", value: roleDisplayName(user.primaryRole), color: MiranTheme.accent)

                        if user.roles.count > 1 {
                            VStack(alignment: .trailing, spacing: 6) {
                                Text("أدوار إضافية")
                                    .font(.caption)
                                    .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                                FlowLayout(spacing: 6) {
                                    ForEach(user.roles.filter { $0 != user.primaryRole }, id: \.self) { role in
                                        Text(roleDisplayName(role))
                                            .font(.caption2)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(MiranTheme.accent.opacity(0.12))
                                            .foregroundColor(MiranTheme.accent)
                                            .cornerRadius(8)
                                    }
                                }
                            }
                            .padding(.vertical, 2)
                        }

                        if !user.capabilities.isEmpty {
                            VStack(alignment: .trailing, spacing: 6) {
                                Text("الصلاحيات الممنوحة (\(user.capabilities.count))")
                                    .font(.caption)
                                    .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                                FlowLayout(spacing: 6) {
                                    ForEach(user.capabilities.prefix(8), id: \.self) { cap in
                                        Text(cap)
                                            .font(.system(size: 10, design: .monospaced))
                                            .padding(.horizontal, 7)
                                            .padding(.vertical, 3)
                                            .background(MiranTheme.secondarySurface(for: colorScheme))
                                            .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                                            .cornerRadius(6)
                                    }
                                    if user.capabilities.count > 8 {
                                        Text("+\(user.capabilities.count - 8) أخرى")
                                            .font(.caption2)
                                            .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                                    }
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }

                    // ── الإعدادات ──────────────────────────────
                    sectionCard(title: "إعدادات التطبيق") {
                        HStack {
                            HStack(spacing: 8) {
                                Image(systemName: "paintbrush.fill")
                                    .foregroundColor(MiranTheme.accent)
                                    .frame(width: 20)
                                Text("المظهر")
                                    .font(.subheadline)
                                    .foregroundColor(MiranTheme.primaryText(for: colorScheme))
                            }
                            Spacer()
                            ThemeModePicker()
                        }
                        .padding(.vertical, 2)
                    }

                    // ── تسجيل الخروج ─────────────────────────
                    Button {
                        showLogoutConfirm = true
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .font(.system(size: 16, weight: .bold))
                            Text("تسجيل الخروج")
                                .font(.headline)
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(MiranTheme.error)
                        .cornerRadius(14)
                    }
                    .padding(.top, 4)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
        }
    }

    // MARK: - Header

    @ViewBuilder
    private func profileHeader(user: UserProfileResponse) -> some View {
        HStack(spacing: 16) {
            // Avatar
            ZStack {
                Circle()
                    .fill(roleAccentColor(user.primaryRole).opacity(0.15))
                    .frame(width: 72, height: 72)
                Circle()
                    .strokeBorder(roleAccentColor(user.primaryRole).opacity(0.4), lineWidth: 2)
                    .frame(width: 72, height: 72)
                Text(initials(from: user.nameAr))
                    .font(.system(size: 26, weight: .bold))
                    .foregroundColor(roleAccentColor(user.primaryRole))
            }

            VStack(alignment: .trailing, spacing: 4) {
                Text(user.nameAr)
                    .font(.title3.bold())
                    .foregroundColor(MiranTheme.primaryText(for: colorScheme))

                if let nameEn = user.nameEn, !nameEn.isEmpty {
                    Text(nameEn)
                        .font(.subheadline)
                        .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                }

                Text(roleDisplayName(user.primaryRole))
                    .font(.caption.bold())
                    .foregroundColor(roleAccentColor(user.primaryRole))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(roleAccentColor(user.primaryRole).opacity(0.12))
                    .cornerRadius(8)
            }

            Spacer()
        }
    }

    // MARK: - Section Card

    @ViewBuilder
    private func sectionCard(title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text(title)
                .font(.caption.bold())
                .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
                .frame(maxWidth: .infinity, alignment: .trailing)

            VStack(alignment: .trailing, spacing: 0) {
                content()
            }
            .padding(.vertical, 4)
            .padding(.horizontal, 16)
            .background(MiranTheme.surface(for: colorScheme))
            .cornerRadius(14)
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(MiranTheme.border(for: colorScheme), lineWidth: 1)
            )
        }
    }

    // MARK: - Info Row

    @ViewBuilder
    private func infoRow(icon: String, label: String, value: String, color: Color = .primary) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundColor(color)
                .frame(width: 20)

            VStack(alignment: .trailing, spacing: 2) {
                Text(value)
                    .font(.subheadline)
                    .foregroundColor(MiranTheme.primaryText(for: colorScheme))
                Text(label)
                    .font(.caption)
                    .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
            }

            Spacer()
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) {
            Divider().padding(.horizontal, -16).opacity(0.5)
        }
    }

    // MARK: - Helpers

    private func initials(from name: String) -> String {
        let parts = name.split(separator: " ")
        if parts.count >= 2 {
            return String(parts[0].prefix(1)) + String(parts[1].prefix(1))
        }
        return String(name.prefix(2))
    }

    private func roleDisplayName(_ role: String) -> String {
        switch role {
        case "platform_owner", "system_admin": return "مدير المنصة"
        case "holding_administrator": return "مدير التجمع"
        case "university_administrator", "university_admin", "academic_affairs": return "مدير الجامعة"
        case "training_director", "cluster_administrator", "cluster_manager", "org_manager": return "مدير التجمع الصحي"
        case "hospital_training_admin", "hospital_administrator": return "مدير تدريب المستشفى"
        case "hospital_supervisor", "training_supervisor", "department_head": return "مشرف التدريب"
        case "academic_supervisor": return "المشرف الأكاديمي"
        case "trainer": return "المدرب الميداني"
        case "trainee": return "المتدرب"
        default: return role
        }
    }

    private func roleAccentColor(_ role: String) -> Color {
        switch role {
        case "platform_owner", "system_admin", "holding_administrator": return MiranTheme.accent
        case "university_administrator", "university_admin", "academic_affairs": return MiranTheme.teal
        case "training_director", "cluster_administrator", "cluster_manager", "org_manager": return MiranTheme.info(for: colorScheme)
        case "hospital_training_admin", "hospital_administrator", "hospital_supervisor", "training_supervisor", "department_head": return MiranTheme.warning
        case "trainer": return MiranTheme.emerald
        case "trainee": return MiranTheme.emerald
        default: return MiranTheme.emerald
        }
    }
}

// MARK: - Flow Layout for chips

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if currentX + size.width > maxWidth && currentX > 0 {
                currentY += rowHeight + spacing
                currentX = 0
                rowHeight = 0
            }
            currentX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth, height: currentY + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let maxWidth = bounds.width
        var currentX = bounds.minX
        var currentY = bounds.minY
        var rowHeight: CGFloat = 0
        // RTL: collect row, then place reversed
        var rowViews: [(subview: LayoutSubview, size: CGSize)] = []

        func placeRow() {
            var x = bounds.maxX
            for item in rowViews {
                x -= item.size.width
                item.subview.place(at: CGPoint(x: x, y: currentY), proposal: ProposedViewSize(item.size))
                x -= spacing
            }
        }

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if currentX + size.width > maxWidth + bounds.minX && !rowViews.isEmpty {
                placeRow()
                currentY += rowHeight + spacing
                currentX = bounds.minX
                rowHeight = 0
                rowViews = []
            }
            rowViews.append((view, size))
            currentX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        placeRow()
    }
}
