//
//  OrgSwitcherSheet.swift
//  Miran
//
//  Sheet allowing user to switch their active Organization Context dynamically.
//  Uses dynamic color tokens — supports Light, Dark, and System modes.
//

import SwiftUI

struct OrgSwitcherSheet: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.dismiss) var dismiss
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        NavigationView {
            ZStack {
                MiranTheme.background(for: colorScheme)
                    .ignoresSafeArea()

                VStack(alignment: .trailing, spacing: 20) {
                    Text("اختر الجهة للعمل بها:")
                        .font(.headline)
                        .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                        .padding(.top)

                    ScrollView {
                        VStack(spacing: 12) {
                            if let orgs = authViewModel.currentUser?.availableOrganizations {
                                ForEach(orgs, id: \.id) { org in
                                    let isActive = org.id == authViewModel.currentUser?.activeOrganization.id
                                    Button {
                                        Task {
                                            await authViewModel.switchOrganization(orgId: org.id)
                                            dismiss()
                                        }
                                    } label: {
                                        HStack {
                                            Image(systemName: "building.2.crop.circle.fill")
                                                .font(.title2)
                                                .foregroundColor(isActive ? MiranTheme.emerald : MiranTheme.secondaryText(for: colorScheme))

                                            VStack(alignment: .trailing, spacing: 4) {
                                                Text(org.displayName)
                                                    .font(.body.weight(.bold))
                                                    .foregroundColor(MiranTheme.primaryText(for: colorScheme))
                                                if let en = org.nameEn, !en.isEmpty {
                                                    Text(en)
                                                        .font(.caption)
                                                        .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                                                }
                                                if let code = org.code {
                                                    Text(code)
                                                        .font(.caption2)
                                                        .foregroundColor(MiranTheme.disabledText(for: colorScheme))
                                                }
                                            }

                                            Spacer()

                                            if isActive {
                                                Image(systemName: "checkmark.circle.fill")
                                                    .foregroundColor(MiranTheme.emerald)
                                            }
                                        }
                                        .padding()
                                        .background(
                                            isActive
                                                ? MiranTheme.emerald.opacity(0.1)
                                                : MiranTheme.surface(for: colorScheme)
                                        )
                                        .cornerRadius(14)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 14)
                                                .stroke(
                                                    isActive ? MiranTheme.emerald.opacity(0.4) : MiranTheme.border(for: colorScheme),
                                                    lineWidth: 1
                                                )
                                        )
                                    }
                                    .disabled(authViewModel.isLoading)
                                }
                            } else {
                                MiranEmptyView(
                                    icon: "building.2",
                                    title: "جهة واحدة مرتبطة",
                                    subtitle: "حسابك مرتبط بجهة واحدة فقط ولا يمكن التبديل."
                                )
                            }
                        }
                    }

                    if authViewModel.isLoading {
                        HStack(spacing: 8) {
                            ProgressView().tint(MiranTheme.emerald)
                            Text("جاري التبديل...")
                                .font(.caption)
                                .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                        }
                        .frame(maxWidth: .infinity)
                    }

                    Spacer()
                }
                .padding()
            }
            .navigationTitle("تبديل الجهة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إغلاق") { dismiss() }
                }
            }
        }
    }
}
