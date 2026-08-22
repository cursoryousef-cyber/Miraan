//
//  MiranApp.swift
//  مِران — منصة التدريب الصحية الالكترونية (National Healthcare Internship Platform)
//
//  نقطة الدخول الرئيسية. التبويبات والمحركات تُعرض بصفة حصرية ودقيقة حسب الدور (RBAC Pipeline).
//

import SwiftUI

@main
struct MiranApp: App {
    @StateObject private var authViewModel = AuthViewModel()
    @StateObject private var store = AppStore()
    @StateObject private var themeManager = ThemeManager.shared
    @Environment(\.colorScheme) var systemColorScheme

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authViewModel)
                .environmentObject(store)
                .environmentObject(themeManager)
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, Locale(identifier: "ar"))
                .tint(MiranTheme.primary)
                .preferredColorScheme(themeManager.colorScheme(for: systemColorScheme))
                .onAppear {
                    authViewModel.appStore = store
                }
        }
    }
}

// MARK: - RootView
struct RootView: View {
    @EnvironmentObject var authViewModel: AuthViewModel

    var body: some View {
        ZStack {
            if authViewModel.isAuthenticated {
                RBACMainView()
            } else {
                LoginView()
            }
        }
        .animation(.easeInOut, value: authViewModel.isAuthenticated)
    }
}

// MARK: - RBAC Main View — يُعرض بصفة حصرية حسب الدور الحقيقي للامتياز الصحي
struct RBACMainView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var systemColorScheme

    var user: UserProfileResponse? { authViewModel.currentUser }

    var body: some View {
        ZStack {
            if let user = user {
                switch user.primaryRole {
                case "platform_owner", "system_admin", "holding_administrator":
                    SystemAdminTabView()

                case "university_administrator", "university_admin", "academic_affairs":
                    UniversityAdminTabView()

                case "training_director", "cluster_administrator", "cluster_manager", "training_manager", "org_manager",
                     "hospital_training_admin", "hospital_administrator", "hospital_supervisor", "training_supervisor", "department_head",
                     "trainer", "trainee", "academic_supervisor":
                    // التبويبات والخدمات المحلولة ديناميكيًا حسب الـ RBAC والمستشفى
                    DynamicMainTabView()

                default:
                    UnknownRoleView(roleCode: user.primaryRole)
                }
            } else {
                VStack(spacing: 16) {
                    ProgressView()
                        .scaleEffect(1.2)
                    Text("جاري تحميل بيانات المنصة والـ RBAC...")
                        .font(.subheadline)
                        .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))

                    if let err = authViewModel.errorMessage {
                        Text(err)
                            .font(.caption)
                            .foregroundColor(MiranTheme.error)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(MiranTheme.background(for: systemColorScheme).ignoresSafeArea())
            }
        }
    }
}

// MARK: - Unknown Role Fallback View
struct UnknownRoleView: View {
    let roleCode: String
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "exclamationmark.shield.fill")
                .font(.system(size: 60))
                .foregroundColor(MiranTheme.warning)

            Text("رمز الدور غامض: \(roleCode)")
                .font(.title3.bold())
                .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))

            Text("حسابك يملك رمز دور محدد ولكن لا توجد لوحة تحكم مطابقة في نظام الـ RBAC الحالي.")
                .font(.caption)
                .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button {
                authViewModel.logout()
            } label: {
                Text("تسجيل الخروج وإعادة المحاولة")
                    .font(.headline)
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(MiranTheme.error)
                    .foregroundColor(.white)
                    .cornerRadius(12)
            }
            .padding(.horizontal)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(MiranTheme.background(for: systemColorScheme).ignoresSafeArea())
    }
}

// MARK: - University Admin TabView
struct UniversityAdminTabView: View {
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationView { UniversityAdminDashboardView() }
                .tabItem { Label("لوحة القيادة", systemImage: "house.fill") }
                .tag(0)

            RoleReportsView()
                .tabItem { Label("التقارير", systemImage: "chart.bar.doc.horizontal.fill") }
                .tag(1)

            UniversalProfileView()
                .tabItem { Label("حسابي", systemImage: "person.crop.circle.fill") }
                .tag(2)
        }
        .tint(MiranTheme.primary)
    }
}



// MARK: - Cluster Training Admin TabView
struct ClusterTrainingAdminTabView: View {
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            OrgManagerDashboardFullView()
                .tabItem {
                    Label("إدارة التدريب بالتجمع", systemImage: "building.2.crop.circle.fill")
                }
                .tag(0)
        }
        .tint(MiranTheme.primary)
    }
}

// MARK: - Hospital Supervisor TabView
struct HospitalSupervisorTabView: View {
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            TrainingSupervisorDashboardFullView()
                .tabItem {
                    Label("مشرف امتياز المستشفى", systemImage: "cross.case.circle.fill")
                }
                .tag(0)
        }
        .tint(MiranTheme.primary)
    }
}
