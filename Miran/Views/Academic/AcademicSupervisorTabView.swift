//
//  AcademicSupervisorTabView.swift
//  Miran
//
//  SwiftUI Interface for Academic Supervisor (المشرف الأكاديمي).
//  مخصص لإدارة العملية الأكاديمية والدفعات ومتابعة المتدربين واعتماد الساعات والـ Logbook والتقارير.
//  محجوب منه: إعدادات النظام وتطبيقات النداءات الميدانية المباشرة.
//

import SwiftUI

struct AcademicSupervisorTabView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            // 1. لوحة قيادة المشرف الأكاديمي
            AcademicSupervisorDashboardFullView()
                .tabItem {
                    Label("لوحة التحكم", systemImage: "graduationcap.circle.fill")
                }
                .tag(0)

            // 2. متابعة المتدربين والـ Logbook
            TraineeAcademicProgressView()
                .tabItem {
                    Label("متابعة المتدربين", systemImage: "person.2.crop.square.stack.fill")
                }
                .tag(1)

            // 3. اعتماد الساعات والمهارات
            LogbookApprovalsView()
                .tabItem {
                    Label("اعتماد الساعات", systemImage: "clock.badge.checkmark.fill")
                }
                .tag(2)

            // 4. تقارير الانضباط والحضور
            AcademicReportsView()
                .tabItem {
                    Label("التقارير الأكاديمية", systemImage: "doc.text.fill")
                }
                .tag(3)
        }
        .tint(MiranTheme.emerald)
    }
}

// MARK: - Subviews for Academic Supervisor
struct AcademicIntakesView: View {
    var body: some View {
        AcademicTabView()
    }
}

struct TraineeAcademicProgressView: View {
    var body: some View {
        NavigationView {
            VStack(spacing: 16) {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.system(size: 50))
                    .foregroundColor(MiranTheme.emerald)
                Text("متابعة الإنجاز والتقدم الأكاديمي للمتدربين")
                    .font(.headline)
                    .foregroundColor(.white)
                Text("استعراض نسبة إتمام المهارات السريرية والـ Competencies لكل متدرب.")
                    .font(.caption)
                    .foregroundColor(MiranTheme.subtext)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MiranTheme.background.ignoresSafeArea())
            .navigationTitle("متابعة المتدربين")
        }
    }
}

struct LogbookApprovalsView: View {
    var body: some View {
        NavigationView {
            VStack(spacing: 16) {
                Image(systemName: "clock.badge.checkmark.fill")
                    .font(.system(size: 50))
                    .foregroundColor(MiranTheme.teal)
                Text("اعتماد الساعات والمهارات السريرية")
                    .font(.headline)
                    .foregroundColor(.white)
                Text("اعتماد السجل السريري (Logbook Sign-off) النهائي بعد مراجعة تقييم المدرب الميداني.")
                    .font(.caption)
                    .foregroundColor(MiranTheme.subtext)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MiranTheme.background.ignoresSafeArea())
            .navigationTitle("اعتماد الساعات")
        }
    }
}

struct AcademicReportsView: View {
    var body: some View {
        ReportsView()
    }
}
