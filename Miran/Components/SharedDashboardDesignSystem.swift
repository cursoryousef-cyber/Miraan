//
//  SharedDashboardDesignSystem.swift
//  Miran
//
//  Unified, Role-Based Premium Design System Shell for all Miran Dashboards.
//  Provides consistent Header, Navigation Sidebar, KPI Stat Cards, Quick Action Buttons,
//  Section Cards, Activity Logs, and State Views across all RBAC user roles.
//

import SwiftUI

// MARK: - 1. Shared Dashboard Shell (Responsive & 16:9 Desktop Friendly)

struct SharedDashboardShell<Content: View>: View {
    let roleTitle: String
    let subtitle: String
    let iconName: String
    let accentColor: Color
    @ViewBuilder let content: Content

    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        ZStack {
            MiranTheme.background(for: colorScheme)
                .ignoresSafeArea()

            GeometryReader { geo in
                let isLargeScreen = geo.size.width > 768

                ScrollView {
                    VStack(spacing: 20) {
                        // Top Header Section
                        SharedDashboardHeader(
                            roleTitle: roleTitle,
                            subtitle: subtitle,
                            iconName: iconName,
                            accentColor: accentColor
                        )

                        // Role Content
                        content

                        Spacer(minLength: 40)
                    }
                    .padding(.vertical, 16)
                    .frame(maxWidth: isLargeScreen ? 1100 : .infinity)
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }
}

// MARK: - 2. Shared Dashboard Header (Arabic RTL First)

struct SharedDashboardHeader: View {
    let roleTitle: String
    let subtitle: String
    let iconName: String
    let accentColor: Color

    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        VStack(spacing: 14) {
            // User & Org Meta Line
            HStack(spacing: 12) {
                // Logout Button
                Button {
                    authViewModel.logout()
                } label: {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(MiranTheme.error)
                        .padding(10)
                        .background(MiranTheme.error.opacity(0.12))
                        .clipShape(Circle())
                }

                Spacer()

                // User Info
                VStack(alignment: .trailing, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(authViewModel.currentUser?.nameAr ?? "مستخدم المنصة")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundColor(MiranTheme.primaryText(for: colorScheme))

                        Circle()
                            .fill(MiranTheme.emerald)
                            .frame(width: 8, height: 8)
                    }

                    Text(authViewModel.currentUser?.activeOrganization.nameAr ?? "الجهة غير محددة")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                }

                // Role Icon Badge
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(accentColor.opacity(0.15))
                        .frame(width: 44, height: 44)

                    Image(systemName: iconName)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(accentColor)
                }
            }

            Divider()
                .background(MiranTheme.secondaryText(for: colorScheme).opacity(0.2))

            // Main Banner Title
            HStack {
                VStack(alignment: .trailing, spacing: 4) {
                    Text(roleTitle)
                        .font(.system(size: 22, weight: .black))
                        .foregroundColor(MiranTheme.primaryText(for: colorScheme))

                    Text(subtitle)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .padding(16)
        .background(MiranTheme.cardBackground(for: colorScheme))
        .cornerRadius(16)
        .shadow(color: Color.black.opacity(0.04), radius: 8, x: 0, y: 3)
        .padding(.horizontal)
    }
}

// MARK: - 3. Shared KPI Metric Card

struct SharedKPICard: View {
    let title: String
    let value: String
    let subtitle: String?
    let iconName: String
    let color: Color
    let action: (() -> Void)?

    @Environment(\.colorScheme) var colorScheme

    init(
        title: String,
        value: String,
        subtitle: String? = nil,
        iconName: String,
        color: Color,
        action: (() -> Void)? = nil
    ) {
        self.title = title
        self.value = value
        self.subtitle = subtitle
        self.iconName = iconName
        self.color = color
        self.action = action
    }

    var body: some View {
        Button {
            action?()
        } label: {
            VStack(alignment: .trailing, spacing: 10) {
                HStack {
                    ZStack {
                        Circle()
                            .fill(color.opacity(0.14))
                            .frame(width: 36, height: 36)

                        Image(systemName: iconName)
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(color)
                    }

                    Spacer()

                    Text(value)
                        .font(.system(size: 26, weight: .black, design: .rounded))
                        .foregroundColor(MiranTheme.primaryText(for: colorScheme))
                }

                VStack(alignment: .trailing, spacing: 2) {
                    Text(title)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(MiranTheme.primaryText(for: colorScheme))
                        .lineLimit(1)

                    if let subtitle = subtitle {
                        Text(subtitle)
                            .font(.system(size: 11))
                            .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                            .lineLimit(1)
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .background(MiranTheme.cardBackground(for: colorScheme))
            .cornerRadius(14)
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(color.opacity(0.2), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.03), radius: 6, x: 0, y: 2)
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(action == nil)
    }
}

// MARK: - 4. Shared Quick Action Button

struct SharedQuickActionButton: View {
    let title: String
    let subtitle: String?
    let iconName: String
    let color: Color
    let action: () -> Void

    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(MiranTheme.secondaryText(for: colorScheme))

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text(title)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(MiranTheme.primaryText(for: colorScheme))

                    if let subtitle = subtitle {
                        Text(subtitle)
                            .font(.system(size: 11))
                            .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                    }
                }

                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(color.opacity(0.14))
                        .frame(width: 38, height: 38)

                    Image(systemName: iconName)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(color)
                }
            }
            .padding(12)
            .background(MiranTheme.cardBackground(for: colorScheme))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(color.opacity(0.2), lineWidth: 1)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - 5. Shared Section Card Container

struct SharedSectionCard<Content: View>: View {
    let title: String
    let iconName: String
    let badgeText: String?
    @ViewBuilder let content: Content

    @Environment(\.colorScheme) var colorScheme

    init(
        title: String,
        iconName: String,
        badgeText: String? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.iconName = iconName
        self.badgeText = badgeText
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .trailing, spacing: 14) {
            HStack {
                if let badgeText = badgeText {
                    Text(badgeText)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(MiranTheme.primary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(MiranTheme.primary.opacity(0.12))
                        .cornerRadius(8)
                }

                Spacer()

                HStack(spacing: 8) {
                    Text(title)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(MiranTheme.primaryText(for: colorScheme))

                    Image(systemName: iconName)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(MiranTheme.primary)
                }
            }

            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .trailing)
        .background(MiranTheme.cardBackground(for: colorScheme))
        .cornerRadius(16)
        .shadow(color: Color.black.opacity(0.03), radius: 6, x: 0, y: 2)
        .padding(.horizontal)
    }
}

// MARK: - 6. Shared Professional Empty State View

struct SharedEmptyStateView: View {
    let title: String
    let message: String
    let iconName: String

    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(MiranTheme.secondaryText(for: colorScheme).opacity(0.08))
                    .frame(width: 54, height: 54)

                Image(systemName: iconName)
                    .font(.system(size: 24))
                    .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
            }

            Text(title)
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(MiranTheme.primaryText(for: colorScheme))

            Text(message)
                .font(.system(size: 12))
                .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)
        }
        .padding(.vertical, 24)
        .frame(maxWidth: .infinity)
    }
}

// MARK: - 7. Shared Loading & Error States

struct SharedLoadingStateView: View {
    let message: String

    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        HStack(spacing: 10) {
            ProgressView()
                .tint(MiranTheme.primary)
            Text(message)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
        }
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity)
    }
}
