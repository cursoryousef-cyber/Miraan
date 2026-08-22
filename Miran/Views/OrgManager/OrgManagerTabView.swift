//
//  OrgManagerTabView.swift
//  Miran
//
//  SwiftUI Interface for Organization Manager (مدير الجهة).
//  مخصص لإدارة أعضاء الجهة والبرامج والدفعات والموافقات والتقارير الخاصة بالجهة.
//  محجوب منه: إعدادات النظام الكلية والنداءات الميدانية المباشرة.
//

import SwiftUI

struct OrgManagerTabView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            // 1. لوحة قيادة مدير الجهة والتجمع
            OrgManagerDashboardFullView()
                .tabItem {
                    Label("لوحة التحكم", systemImage: "building.2.crop.circle.fill")
                }
                .tag(0)

            // 2. البرامج والدفعات التابعة للجهة
            OrgProgramsView()
                .tabItem {
                    Label("الأقسام والبرامج", systemImage: "graduationcap.fill")
                }
                .tag(1)

            // 3. الموافقات والاعتمادات
            OrgApprovalsView()
                .tabItem {
                    Label("الموافقات", systemImage: "checkmark.seal.fill")
                }
                .tag(2)

            // 4. تقارير أداء الجهة
            OrgReportsView()
                .tabItem {
                    Label("تقارير الجهة", systemImage: "doc.plaintext.fill")
                }
                .tag(3)
        }
        .tint(MiranTheme.emerald)
    }
}

// MARK: - Subviews for Org Manager
struct OrgProgramsView: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        NavigationView {
            ZStack {
                MiranTheme.background
                    .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("البرامج والأقسام التدريبية بالجهة")
                            .font(.title3.bold())
                            .foregroundColor(.white)
                            .padding(.horizontal)

                        ForEach(store.departments, id: \.id) { dept in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text(dept.name)
                                        .font(.headline)
                                        .foregroundColor(.white)
                                    Spacer()
                                    Text("السعة: \(dept.capacity) متدرب")
                                        .font(.caption.monospaced())
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(MiranTheme.emerald.opacity(0.2))
                                        .foregroundColor(MiranTheme.emerald)
                                        .cornerRadius(6)
                                }
                                Text("موقع الجولة: \(dept.roundLocation)")
                                    .font(.caption)
                                    .foregroundColor(MiranTheme.subtext)
                            }
                            .padding()
                            .background(Color.white.opacity(0.04))
                            .cornerRadius(14)
                            .padding(.horizontal)
                        }
                    }
                    .padding(.vertical)
                }
            }
            .navigationTitle("الأقسام والبرامج")
        }
    }
}

struct OrgApprovalsView: View {
    var body: some View {
        NavigationView {
            VStack(spacing: 16) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 50))
                    .foregroundColor(MiranTheme.emerald)
                Text("الموافقات والاعتمادات بالجهة")
                    .font(.headline)
                    .foregroundColor(.white)
                Text("اعتماد الروتيشنات السريرية، خطط التدريب، والإقرارات للجهة.")
                    .font(.caption)
                    .foregroundColor(MiranTheme.subtext)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MiranTheme.background.ignoresSafeArea())
            .navigationTitle("الموافقات")
        }
    }
}

struct OrgReportsView: View {
    var body: some View {
        NavigationView {
            VStack(spacing: 16) {
                Image(systemName: "doc.text.fill")
                    .font(.system(size: 50))
                    .foregroundColor(MiranTheme.teal)
                Text("تقارير أداء الجهة والمدربين")
                    .font(.headline)
                    .foregroundColor(.white)
                Text("إحصائيات كاملة عن نسبة الحضور والانضباط وإنجاز السجل السريري بالجهة.")
                    .font(.caption)
                    .foregroundColor(MiranTheme.subtext)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MiranTheme.background.ignoresSafeArea())
            .navigationTitle("تقارير الجهة")
        }
    }
}
