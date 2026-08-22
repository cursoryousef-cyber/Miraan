//
//  SystemAdminTabView.swift
//  Miran
//
//  SwiftUI Main Interface for System Administrator (مدير المنصة والنظام - Control Center).
//  Matches Healthcare Internship Platform UI Design System 100% with Dark/Light/System theme switching.
//

import SwiftUI

// MARK: - Compatibility Helper Views
struct MetricStatCard: View {
    let title: String
    let count: String
    let icon: String
    let color: Color
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        DynamicMetricCard(title: title, count: count, icon: icon, color: color)
    }
}

struct AdminActionRow: View {
    let title: String
    let subtitle: String
    let icon: String
    let color: Color
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        DynamicAdminActionRow(title: title, subtitle: subtitle, icon: icon, color: color)
    }
}
struct DynamicMetricCard: View {
    let title: String
    let count: String
    let icon: String
    let color: Color
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        VStack(alignment: .trailing, spacing: 12) {
            HStack {
                Text(count)
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                Spacer()
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(color.opacity(0.15))
                        .frame(width: 44, height: 44)
                    Image(systemName: icon)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(color)
                }
            }

            Text(title)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                .multilineTextAlignment(.trailing)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .trailing)
        .background(MiranTheme.surface(for: systemColorScheme))
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(MiranTheme.border(for: systemColorScheme), lineWidth: 1)
        )
        .shadow(
            color: systemColorScheme == .light ? Color.black.opacity(0.04) : Color.clear,
            radius: 8, x: 0, y: 2
        )
    }
}

// MARK: - Dynamic Action Row
struct DynamicAdminActionRow: View {
    let title: String
    let subtitle: String
    let icon: String
    let color: Color
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "chevron.left")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))

            VStack(alignment: .trailing, spacing: 3) {
                Text(title)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                Text(subtitle)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
            }
            .multilineTextAlignment(.trailing)

            Spacer()

            ZStack {
                RoundedRectangle(cornerRadius: 14)
                    .fill(color.opacity(0.15))
                    .frame(width: 46, height: 46)
                Image(systemName: icon)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(color)
            }
        }
        .padding(16)
        .background(MiranTheme.surface(for: systemColorScheme))
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(MiranTheme.border(for: systemColorScheme), lineWidth: 1)
        )
        .shadow(
            color: systemColorScheme == .light ? Color.black.opacity(0.04) : Color.clear,
            radius: 8, x: 0, y: 2
        )
    }
}

// MARK: - System Admin TabView
struct SystemAdminTabView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var systemColorScheme
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            // 1. مركز التحكم الوطني والإحصائيات الكلية
            SystemAdminDashboardView()
                .tabItem {
                    Label("لوحة الإدارة", systemImage: "chart.bar.fill")
                }
                .tag(0)

            // 2. إدارة الجهات والأقسام
            OrganizationsAdminView()
                .tabItem {
                    Label("الجهات والأقسام", systemImage: "building.2.fill")
                }
                .tag(1)

            // 3. إدارة المستخدمين والصلاحيات
            UsersAndRolesAdminView()
                .tabItem {
                    Label("المستخدمين والصلاحيات", systemImage: "person.3.sequence.fill")
                }
                .tag(2)

            // 4. سجلات التدقيق والتقارير
            AuditAndReportsAdminView()
                .tabItem {
                    Label("السجلات والتقارير", systemImage: "shield.checkered")
                }
                .tag(3)

            // 5. الملف الشخصي
            UniversalProfileView()
                .tabItem {
                    Label("حسابي", systemImage: "person.crop.circle.fill")
                }
                .tag(4)
        }
        .tint(MiranTheme.primary)
    }
}

// MARK: - System Admin Dashboard View (Matching Image Specification 100%)
struct SystemAdminDashboardView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        NavigationView {
            ZStack {
                MiranTheme.background(for: systemColorScheme)
                    .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .trailing, spacing: 20) {
                        // Top Header with Theme Switcher Control
                        VStack(spacing: 16) {
                            HStack {
                                Button {
                                    authViewModel.logout()
                                } label: {
                                    Image(systemName: "rectangle.portrait.and.arrow.right")
                                        .font(.system(size: 20, weight: .bold))
                                        .foregroundColor(MiranTheme.error)
                                        .padding(10)
                                        .background(MiranTheme.error.opacity(0.12))
                                        .clipShape(Circle())
                                }

                                Spacer()

                                VStack(alignment: .trailing, spacing: 2) {
                                    Text("مدير النظام")
                                        .font(.system(size: 18, weight: .bold))
                                        .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                                }

                                Image(systemName: "gearshape.fill")
                                    .font(.system(size: 20))
                                    .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                            }

                            // Theme Selector Control (نهاري - النظام - ليلي)
                            ThemeModePicker()
                        }
                        .padding(.horizontal)

                        // Main Title Banner
                        VStack(alignment: .trailing, spacing: 6) {
                            Text("إدارة المنصة الوطنية")
                                .font(.system(size: 22, weight: .black))
                                .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))

                            Text("(System Admin)")
                                .font(.system(size: 18, weight: .bold))
                                .foregroundColor(MiranTheme.primary)

                            Text("التحكم الكامل بالحسابات والجهات والترخيص وسجلات التدقيق")
                                .font(.system(size: 12))
                                .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                        }
                        .padding(.horizontal)
                        .frame(maxWidth: .infinity, alignment: .trailing)

                        // 4 Key Stat Cards Grid (Matching Prompt UI image)
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                            DynamicMetricCard(
                                title: "الأقسام المعتمدة",
                                count: "8",
                                icon: "building.columns.fill",
                                color: MiranTheme.primary
                            )

                            DynamicMetricCard(
                                title: "المشاركون في الأنشطة",
                                count: "140",
                                icon: "cross.case.fill",
                                color: MiranTheme.primary
                            )

                            DynamicMetricCard(
                                title: "المدربون النشطون",
                                count: "34",
                                icon: "person.2.fill",
                                color: MiranTheme.info(for: systemColorScheme)
                            )

                            DynamicMetricCard(
                                title: "الروتيشنات الجارية",
                                count: "12",
                                icon: "graduationcap.fill",
                                color: MiranTheme.accent
                            )
                        }
                        .padding(.horizontal)

                        // Admin Operations Section Title
                        Text("العمليات الإدارية الحصرية")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                            .padding(.horizontal)
                            .frame(maxWidth: .infinity, alignment: .trailing)

                        // 3 Primary Action Rows
                        VStack(spacing: 12) {
                            NavigationLink(destination: OrganizationsAdminView()) {
                                DynamicAdminActionRow(
                                    title: "إدارة التجمعات الصحية والأقسام",
                                    subtitle: "إضافة وتعديل وحظر الجهات المعتمدة",
                                    icon: "building.columns.fill",
                                    color: MiranTheme.primary
                                )
                            }

                            NavigationLink(destination: UsersAndRolesAdminView()) {
                                DynamicAdminActionRow(
                                    title: "إدارة الحسابات والأدوار (RBAC)",
                                    subtitle: "تعيين وتأهيل أدوار المشرفين والمدربين",
                                    icon: "person.badge.key.fill",
                                    color: MiranTheme.info(for: systemColorScheme)
                                )
                            }

                            NavigationLink(destination: AuditAndReportsAdminView()) {
                                DynamicAdminActionRow(
                                    title: "سجل العمليات والتقارير الكلية (Audit Trail)",
                                    subtitle: "تتبع نشاط الحسابات والأمن بالمنصة",
                                    icon: "doc.text.magnifyingglass",
                                    color: MiranTheme.warning
                                )
                            }
                        }
                        .padding(.horizontal)
                    }
                    .padding(.vertical)
                }
            }
            .navigationBarHidden(true)
        }
    }
}

struct OrganizationsAdminView: View {
    var body: some View {
        OrganizationsManagementFullView()
    }
}

struct UsersAndRolesAdminView: View {
    var body: some View {
        UsersAndRolesManagementFullView()
    }
}

struct AuditAndReportsAdminView: View {
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 60))
                .foregroundColor(MiranTheme.primary)
            Text("سجلات التدقيق والرقابة الوطنية (Audit Trail)")
                .font(.title3.bold())
                .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
            Text("جميع عمليات إضافة الحسابات، تعديل الصلاحيات، واعتماد التجمعات موثقة بختم زمني مشفر.")
                .font(.caption)
                .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(MiranTheme.background(for: systemColorScheme).ignoresSafeArea())
        .navigationTitle("سجل العمليات والتدقيق")
    }
}
