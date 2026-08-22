//
//  AcademicSupervisorDashboardFullView.swift
//  Miran
//
//  Dedicated Dashboard for Academic Supervisors.
//  API: GET /trainees — academic_supervisor is authorized (backend role-guard confirmed).
//  Does NOT use /operations/trainer/assigned-interns (requires trainer/org_manager → 403).
//

import SwiftUI

struct AcademicSupervisorDashboardFullView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var colorScheme

    private var user: UserProfileResponse? { authViewModel.currentUser }

    // Local state: /trainees scoped to academic_supervisor's org
    @State private var trainees: [TraineeProfileModel] = []
    @State private var loadState: AcadLoadState = .idle

    enum AcadLoadState { case idle, loading, loaded, empty, error(String) }

    var body: some View {
        NavigationStack {
            ZStack {
                MiranTheme.background(for: colorScheme).ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .trailing, spacing: 20) {
                        headerBanner
                        metricsGrid
                        actionsSection
                    }
                    .padding(.vertical)
                }
                .refreshable { await fetchTrainees() }
            }
            .navigationTitle("المشرف الأكاديمي")
            .navigationBarTitleDisplayMode(.inline)
            .task {
                if case .idle = loadState { await fetchTrainees() }
            }
        }
    }

    // MARK: - Header

    private var headerBanner: some View {
        VStack(alignment: .trailing, spacing: 6) {
            HStack {
                Image(systemName: "graduationcap.circle.fill")
                    .font(.system(size: 28))
                    .foregroundColor(.purple)
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("الشؤون الأكاديمية")
                        .font(.title2.bold())
                        .foregroundColor(MiranTheme.primaryText(for: colorScheme))
                    if let name = user?.nameAr {
                        Text(name)
                            .font(.subheadline)
                            .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                    }
                }
            }
            Text("متابعة الاعتماد الأكاديمي للجامعة وأطباء الامتياز")
                .font(.subheadline)
                .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.horizontal)
    }

    // MARK: - Metrics Grid

    @ViewBuilder
    private var metricsGrid: some View {
        switch loadState {
        case .loading:
            MiranLoadingView(message: "جاري تحميل بيانات المتدربين...")
                .frame(height: 120)

        case .error(let msg):
            VStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(MiranTheme.error)
                Text(msg)
                    .font(.caption)
                    .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                    .multilineTextAlignment(.center)
                Button("إعادة المحاولة") { Task { await fetchTrainees() } }
                    .font(.caption.bold())
                    .foregroundColor(MiranTheme.emerald)
            }
            .padding(.horizontal)

        default:
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                DynamicMetricCard(
                    title: "المتدربون المرتبطون",
                    count: "\(trainees.count)",
                    icon: "person.3.sequence.fill",
                    color: .purple
                )
                DynamicMetricCard(
                    title: "طلبات التدريب",
                    count: "\(store.trainingRequests.count)",
                    icon: "book.closed.fill",
                    color: MiranTheme.emerald
                )
                DynamicMetricCard(
                    title: "سجلات قيد الاعتماد",
                    count: "\(store.caseLogsList.filter { $0.status == "pending" }.count)",
                    icon: "clock.arrow.circlepath",
                    color: .orange
                )
                DynamicMetricCard(
                    title: "نسبة الإشغال",
                    count: store.organizationStatistics.map { "\(Int($0.occupancyPercentage))%" } ?? "—",
                    icon: "chart.bar.fill",
                    color: MiranTheme.teal
                )
            }
            .padding(.horizontal)
        }
    }

    // MARK: - Actions Section

    private var actionsSection: some View {
        VStack(alignment: .trailing, spacing: 12) {
            Text("متابعة واعتماد السجلات السريرية")
                .font(.headline.bold())
                .foregroundColor(MiranTheme.primaryText(for: colorScheme))
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.horizontal)

            VStack(spacing: 10) {
                NavigationLink(destination: ClinicalLogbookManagementFullView()) {
                    DynamicAdminActionRow(
                        title: "اعتماد السجل السريري",
                        subtitle: "مراجعة وإقرار المهارات أو إعادتها للتعديل",
                        icon: "checkmark.circle.badge.questionmark",
                        color: .purple
                    )
                }
                .buttonStyle(.plain)

                NavigationLink(destination: RoleReportsView()) {
                    DynamicAdminActionRow(
                        title: "التقارير الأكاديمية",
                        subtitle: "متابعة أداء المراكز الميدانية وجودة التدريب",
                        icon: "doc.text.fill",
                        color: MiranTheme.teal
                    )
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal)
        }
    }

    // MARK: - Fetch

    private func fetchTrainees() async {
        loadState = .loading
        do {
            let res: APIListResponse<TraineeProfileModel> = try await APIClient.shared.request(endpoint: "/trainees")
            trainees = res.data
            loadState = trainees.isEmpty ? .empty : .loaded
        } catch {
            loadState = .error(error.localizedDescription)
        }
    }
}
