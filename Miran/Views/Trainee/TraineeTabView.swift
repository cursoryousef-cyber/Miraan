//
//  TraineeTabView.swift
//  Miran
//
//  SwiftUI Interface for Trainee (طبيب الامتياز والمتدرب).
//  يشمل: لوحة التحكم الرئيسية، جدولي التدريبي، مهامي وحضوري اليومي، السجل السريري، والبطاقة الرقمية.
//

import SwiftUI

struct TraineeTabView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            // 1. الرئيسية واللوحة العامة
            TraineeDashboardFullView()
                .tabItem { Label("الرئيسية", systemImage: "house.fill") }
                .tag(0)

            // 2. جدولي التدريبي (Schedule Builder Read-Only)
            ScheduleView()
                .tabItem { Label("جدولي", systemImage: "calendar") }
                .tag(1)

            // 3. مهامي وحضوري
            TodayView()
                .tabItem { Label("مهامي وحضوري", systemImage: "checkmark.circle.fill") }
                .tag(2)

            // 4. السجل السريري (Clinical Logbook)
            ClinicalLogbookView()
                .tabItem { Label("السجل السريري", systemImage: "book.closed.fill") }
                .tag(3)

            // 5. الهوية والملف الشخصي
            TraineeProfileView()
                .tabItem { Label("هويتي الرقمية", systemImage: "person.crop.square.fill") }
                .tag(4)
        }
        .tint(MiranTheme.emerald)
    }
}
