//
//  DynamicServicesView.swift
//  Miran
//
//  شبكة الخدمات والخدمات الإضافية المصرح بها حسب صلاحيات المستخدم في نظام مِران.
//

import SwiftUI

struct DynamicServicesView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var systemColorScheme

    var user: UserProfileResponse? { authViewModel.currentUser }

    var extraServices: [ServiceDefinition] {
        guard let user = user else { return [] }
        return ServiceResolver.extraServices(for: user)
    }

    var body: some View {
        NavigationView {
            ZStack {
                MiranTheme.background(for: systemColorScheme)
                    .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        // ── Header Banner ─────────────────────────────────────
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("قسم الخدمات والتطبيق")
                                    .font(.title2.bold())
                                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                                Spacer()
                                Image(systemName: "grid.hifi")
                                    .font(.system(size: 26))
                                    .foregroundColor(MiranTheme.emerald)
                            }

                            if let user = user {
                                Text("المستشفى: \(user.activeOrganization.displayName)")
                                    .font(.caption.weight(.medium))
                                    .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                            }
                        }
                        .padding(.horizontal)
                        .padding(.top, 10)

                        // ── Services Grid ─────────────────────────────────────
                        if extraServices.isEmpty {
                            VStack(spacing: 14) {
                                Image(systemName: "checkmark.seal.fill")
                                    .font(.system(size: 44))
                                    .foregroundColor(MiranTheme.emerald)
                                Text("جميع الخدمات متاحة ومُدرجة في الشريط الرئيسي لتبويباتك.")
                                    .font(.subheadline)
                                    .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                                    .multilineTextAlignment(.center)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 40)
                        } else {
                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                                ForEach(extraServices) { service in
                                    NavigationLink(destination: destinationView(for: service.destination)) {
                                        VStack(alignment: .leading, spacing: 14) {
                                            HStack {
                                                ZStack {
                                                    Circle()
                                                        .fill(MiranTheme.emerald.opacity(0.12))
                                                        .frame(width: 44, height: 44)
                                                    Image(systemName: service.icon)
                                                        .font(.system(size: 20, weight: .bold))
                                                        .foregroundColor(MiranTheme.emerald)
                                                }
                                                Spacer()
                                                Image(systemName: "chevron.left")
                                                    .font(.caption.weight(.bold))
                                                    .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                                            }

                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(service.titleAr)
                                                    .font(.headline.bold())
                                                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                                                Text(service.titleEn)
                                                    .font(.caption)
                                                    .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                                            }
                                        }
                                        .padding(16)
                                        .background(MiranTheme.cardBackground(for: systemColorScheme))
                                        .cornerRadius(16)
                                        .shadow(color: Color.black.opacity(0.04), radius: 8, x: 0, y: 2)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 16)
                                                .stroke(MiranTheme.border(for: systemColorScheme), lineWidth: 1)
                                        )
                                    }
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                    .padding(.bottom, 30)
                }
            }
            .navigationTitle("الخدمات")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private func destinationView(for destination: ServiceDestination) -> some View {
        switch destination {
        case .dashboard:
            TraineeDashboardFullView()
        case .schedule:
            ScheduleView()
        case .logbook:
            ClinicalLogbookView()
        case .competencies:
            TodayView()
        case .trainees:
            TrainerDashboardFullView()
        case .evaluations:
            TrainerAttendanceView()
        case .signoffs:
            ClinicalLogbookView()
        case .notifications:
            Text("قائمة الإشعارات")
                .font(.headline)
        case .incidents:
            Text("البلاغات والتصعيد")
                .font(.headline)
        case .digitalCard:
            TraineeProfileView()
        default:
            Text("خدمة مِران")
                .font(.headline)
        }
    }
}
