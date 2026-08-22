//
//  MiranEmptyStateView.swift
//  Miran
//
//  مكوّن الحالات الفارغة الموحّد بطابع مِران الاحترافي (Arabic Branded Empty State View).
//

import SwiftUI

struct MiranEmptyStateView: View {
    let titleAr: String
    let subtitleAr: String
    let icon: String
    var buttonTitleAr: String? = nil
    var action: (() -> Void)? = nil

    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(MiranTheme.emerald.opacity(0.12))
                    .frame(width: 80, height: 80)

                Image(systemName: icon)
                    .font(.system(size: 36, weight: .semibold))
                    .foregroundColor(MiranTheme.emerald)
            }

            VStack(spacing: 6) {
                Text(titleAr)
                    .font(.headline.weight(.bold))
                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                    .multilineTextAlignment(.center)

                Text(subtitleAr)
                    .font(.subheadline)
                    .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }

            if let buttonTitle = buttonTitleAr, let action = action {
                Button(action: action) {
                    Text(buttonTitle)
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(MiranTheme.emerald)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
                .padding(.top, 8)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .padding(.horizontal, 20)
        .background(MiranTheme.cardBackground(for: systemColorScheme))
        .cornerRadius(20)
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(MiranTheme.border(for: systemColorScheme), lineWidth: 1)
        )
        .padding(.horizontal, 16)
    }
}
