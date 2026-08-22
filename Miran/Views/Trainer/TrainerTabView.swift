//
//  TrainerTabView.swift
//  Miran
//
//  SwiftUI Interface for Clinical Trainer (المدرب الميداني).
//  يوفر تبويبات كاملة لـ: لوحة التحكم، جدول المتدربين، متابعة الحضور والإنضباط، ومراكز النداءات والمهام.
//

import SwiftUI

struct TrainerTabView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            // 1. لوحة تحكم المدرب الميداني
            TrainerDashboardFullView()
                .tabItem {
                    Label("لوحة التحكم", systemImage: "stethoscope.circle.fill")
                }
                .tag(0)

            // 2. جدول المتدربين المسندين (Week View / Day View)
            ScheduleBuilderView(isReadOnly: true)
                .tabItem {
                    Label("جدول المتدربين", systemImage: "calendar.badge.clock")
                }
                .tag(1)

            // 3. متابعة الحضور والانضباط الميداني
            TrainerAttendanceView()
                .tabItem {
                    Label("متابعة الحضور", systemImage: "clock.badge.checkmark.fill")
                }
                .tag(2)

            // 4. مركز النداءات الميدانية
            CallCenterView()
                .tabItem {
                    Label("النداءات الطارئة", systemImage: "bolt.heart.fill")
                }
                .tag(3)
        }
        .tint(MiranTheme.emerald)
    }
}
