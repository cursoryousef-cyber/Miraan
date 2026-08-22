//
//  DynamicMainTabView.swift
//  Miran
//
//  شريط التبويبات الرئيسي المولد ديناميكيًا حسب أدوار وصلاحيات المستخدم (RBAC Resolver).
//
//  ROUTING RULES (from Audit 2026-08-13):
//  - كل Service Destination تذهب للـView المخصص لها، لا لـOrgManagerDashboardView.
//  - Profile tab مضاف لجميع الأدوار.
//  - incidents → IncidentsFullView (capability-gated)
//  - reports → RoleReportsView (role-aware)
//  - hospitals/programs/capacity → OrgManagerDashboardFullView (Cluster only)
//  - trainees → role-appropriate view
//  - evaluations → role-appropriate view
//

import SwiftUI

struct DynamicMainTabView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @State private var selectedTabId: String = ""

    var user: UserProfileResponse? { authViewModel.currentUser }

    var mainTabs: [ServiceDefinition] {
        guard let user = user else { return [] }
        return ServiceResolver.mainTabs(for: user)
    }

    var body: some View {
        Group {
            if let user = user, !mainTabs.isEmpty {
                TabView(selection: $selectedTabId) {
                    ForEach(mainTabs) { tab in
                        destinationView(for: tab, user: user)
                            .tabItem {
                                Label(tab.titleAr, systemImage: tab.icon)
                            }
                            .tag(tab.id)
                    }
                }
                .tint(MiranTheme.emerald)
                .onAppear {
                    if selectedTabId.isEmpty, let first = mainTabs.first {
                        selectedTabId = first.id
                    }
                }
            } else {
                ProgressView("جاري تهيئة خدمات المنصة...")
            }
        }
    }

    @ViewBuilder
    private func destinationView(for tab: ServiceDefinition, user: UserProfileResponse) -> some View {
        let persona = ServiceResolver.resolvePersona(for: user)

        switch tab.destination {

        // ── Dashboard: role-specific home ──────────────────────────────
        case .dashboard:
            switch persona {
            case .trainee:
                TraineeJourneyHomeView()
            case .trainer:
                TrainerDashboardFullView()
            case .trainingOperations:
                HospitalWorkQueueHomeView()
            case .clusterOperations:
                OrgManagerDashboardFullView()
            case .university:
                UniversityAdminDashboardView()
            case .platform:
                SystemAdminTabView()
            case .academicSupervisor:
                AcademicSupervisorDashboardFullView()
            }

        // ── Schedule ───────────────────────────────────────────────────
        case .schedule:
            ScheduleView()

        // ── Logbook ────────────────────────────────────────────────────
        case .logbook:
            if user.isTrainee {
                ClinicalLogbookView()
            } else {
                ClinicalLogbookManagementFullView()
            }

        // ── Competencies ───────────────────────────────────────────────
        case .competencies:
            TodayView()

        // ── Trainees ───────────────────────────────────────────────────
        case .trainees:
            switch persona {
            case .trainer:
                TrainerDashboardFullView()
            case .trainingOperations:
                HospitalWorkQueueHomeView()
            default:
                TrainingSupervisorDashboardFullView()
            }

        // ── Evaluations ────────────────────────────────────────────────
        case .evaluations:
            TrainerAttendanceView()

        // ── Sign-offs ──────────────────────────────────────────────────
        case .signoffs:
            ClinicalLogbookManagementFullView()

        // ── Training Requests ──────────────────────────────────────────
        case .requests:
            switch persona {
            case .university:
                UniversityAdminDashboardView()
            case .trainingOperations:
                HospitalWorkQueueHomeView()
            default:
                OrgManagerDashboardFullView()
            }

        // ── Trainers ───────────────────────────────────────────────────
        case .trainers:
            TrainingSupervisorDashboardFullView()

        // ── Incidents (capability-gated, real view) ────────────────────
        case .incidents:
            IncidentsFullView()

        // ── Reports (role-aware, never OrgManagerDash for all) ─────────
        case .reports:
            RoleReportsView()

        // ── Hospitals (cluster only) ───────────────────────────────────
        case .hospitals:
            OrgManagerDashboardFullView()

        // ── Programs ──────────────────────────────────────────────────
        case .programs:
            OrgManagerDashboardFullView()

        // ── Capacity ──────────────────────────────────────────────────
        case .capacity:
            OrgManagerDashboardFullView()

        // ── Services Grid ──────────────────────────────────────────────
        case .servicesGrid:
            DynamicServicesView()

        // ── Profile (all roles) ────────────────────────────────────────
        case .profile:
            UniversalProfileView()

        // ── Notifications / Digital Card (in servicesGrid) ────────────
        case .notifications, .digitalCard:
            DynamicServicesView()
        }
    }
}
