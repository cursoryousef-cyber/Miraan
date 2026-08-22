//
//  TrainingSupervisorTabView.swift
//  Miran
//
//  SwiftUI Interface for Hospital Training Admin & Supervisor (مشرف التدريب بالمستشفى).
//  مخصص لإدارة التدريب والمدربين والجداول وتوزيع المتدربين ومركز النداءات الميدانية.
//

import SwiftUI

struct TrainingSupervisorTabView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            // 1. لوحة قيادة مشرف التدريب بالمستشفى
            TrainingSupervisorDashboardFullView()
                .tabItem {
                    Label("لوحة التحكم", systemImage: "cross.case.circle.fill")
                }
                .tag(0)

            // 2. مخطط ومحرك الجداول السريرية (iOS Schedule Builder)
            ScheduleBuilderView(isReadOnly: false)
                .tabItem {
                    Label("مخطط الجداول", systemImage: "calendar.badge.clock")
                }
                .tag(1)

            // 3. مركز نداءات التدريب (إدارة النداءات الميدانية)
            CallCenterView()
                .tabItem {
                    Label("مركز النداءات", systemImage: "bolt.heart.fill")
                }
                .tag(2)

            // 4. تقارير التدريب والانضباط الميداني
            FieldTrainingReportsView()
                .tabItem {
                    Label("تقارير التدريب", systemImage: "chart.bar.doc.horizontal.fill")
                }
                .tag(3)
        }
        .tint(MiranTheme.emerald)
    }
}

// MARK: - Subviews for Training Supervisor
struct FieldTrainingManagementView: View {
    var body: some View {
        TrainerHomeView()
    }
}

struct FieldTrainingReportsView: View {
    var body: some View {
        ReportsView()
    }
}
