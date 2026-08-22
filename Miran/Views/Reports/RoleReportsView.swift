//
//  RoleReportsView.swift
//  Miran
//
//  Role-aware Reports view — each role sees reports relevant to their scope.
//  Replaces the incorrect pattern of routing all roles to OrgManagerDashboardFullView.
//
//  System Admin:     Platform-wide statistics
//  Training Director: Cluster-level reports (org stats, timeline)
//  Hospital Admin:   Hospital-level reports (trainers, rotations, attendance)
//  University Admin: University requests and program reports
//  Trainer:          Personal reports (my trainees, evaluations)
//  Trainee:          Personal progress report
//

import SwiftUI

struct RoleReportsView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var colorScheme

    private var user: UserProfileResponse? { authViewModel.currentUser }

    var body: some View {
        NavigationStack {
            ZStack {
                MiranTheme.background(for: colorScheme).ignoresSafeArea()

                if let user {
                    reportContent(for: user)
                } else {
                    MiranLoadingView()
                }
            }
            .navigationTitle("التقارير")
            .navigationBarTitleDisplayMode(.large)
        }
    }

    @ViewBuilder
    private func reportContent(for user: UserProfileResponse) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                // Scope badge
                scopeBadge(for: user)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)

                // Role-specific report sections
                switch ServiceResolver.resolvePersona(for: user) {
                case .platform:
                    platformReports()
                case .clusterOperations:
                    clusterReports()
                case .trainingOperations:
                    hospitalReports()
                case .university:
                    universityReports()
                case .trainer:
                    trainerReports()
                case .trainee:
                    traineeReports()
                case .academicSupervisor:
                    academicSupervisorReports()
                }

                Spacer(minLength: 40)
            }
            .padding(.bottom, 16)
        }
    }

    // MARK: - Scope Badge

    @ViewBuilder
    private func scopeBadge(for user: UserProfileResponse) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "scope")
                .foregroundColor(MiranTheme.emerald)
            VStack(alignment: .trailing, spacing: 2) {
                Text("نطاق التقارير")
                    .font(.caption.bold())
                    .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                Text(user.activeOrganization.displayName)
                    .font(.subheadline.bold())
                    .foregroundColor(MiranTheme.primaryText(for: colorScheme))
            }
            Spacer()
        }
        .padding(14)
        .background(MiranTheme.surface(for: colorScheme))
        .cornerRadius(12)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(MiranTheme.border(for: colorScheme), lineWidth: 1))
    }

    // MARK: - Platform Reports (System Admin)

    @ViewBuilder
    private func platformReports() -> some View {
        VStack(spacing: 16) {
            // KPI row using real org statistics if available
            if let stats = store.organizationStatistics {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    reportKPI(value: "\(stats.totalOrganizations)", label: "إجمالي الجهات", icon: "building.2.fill", color: MiranTheme.accent)
                    reportKPI(value: "\(stats.totalTrainees)", label: "المتدربون", icon: "person.3.fill", color: MiranTheme.emerald)
                    reportKPI(value: "\(stats.totalTrainers)", label: "المدربون", icon: "stethoscope", color: MiranTheme.teal)
                    reportKPI(value: "\(stats.totalDepartments)", label: "الأقسام", icon: "square.grid.2x2.fill", color: MiranTheme.info(for: colorScheme))
                }
                .padding(.horizontal, 16)
            } else {
                MiranLoadingView(message: "جاري تحميل إحصاءات المنصة...")
            }

            reportSection(title: "المؤشرات العامة") {
                reportLink(icon: "building.2.fill", title: "تقرير الجهات والمستشفيات", subtitle: "عرض تفصيلي لجميع الجهات المرتبطة", color: MiranTheme.accent)
                reportLink(icon: "person.badge.shield.checkmark.fill", title: "تقرير المستخدمين والأدوار", subtitle: "المستخدمون وصلاحياتهم", color: MiranTheme.accent)
                reportLink(icon: "chart.line.uptrend.xyaxis", title: "تقرير النشاط التشغيلي", subtitle: "النداءات، الحضور، التقييمات", color: MiranTheme.accent)
            }
        }
    }

    // MARK: - Cluster Reports (Training Director)

    @ViewBuilder
    private func clusterReports() -> some View {
        VStack(spacing: 16) {
            if let stats = store.organizationStatistics {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    reportKPI(value: "\(stats.hospitals)", label: "المستشفيات", icon: "cross.case.fill", color: MiranTheme.teal)
                    reportKPI(value: "\(stats.totalTrainees)", label: "المتدربون", icon: "person.3.fill", color: MiranTheme.emerald)
                    reportKPI(value: "\(Int(stats.occupancyPercentage))%", label: "الإشغال", icon: "chart.pie.fill", color: MiranTheme.warning)
                    reportKPI(value: "\(stats.availableSeats)", label: "مقاعد متاحة", icon: "seat.fill", color: MiranTheme.success)
                }
                .padding(.horizontal, 16)
            } else {
                MiranLoadingView(message: "جاري تحميل إحصاءات التجمع...")
            }

            if let timeline = store.clusterTimeline {
                reportSection(title: "الجدول الزمني") {
                    HStack {
                        VStack(alignment: .trailing, spacing: 3) {
                            Text("على المسار")
                                .font(.caption).foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                            Text("\(timeline.onTrack)")
                                .font(.title3.bold()).foregroundColor(.green)
                        }
                        Spacer()
                        VStack(alignment: .leading, spacing: 3) {
                            Text("خارج المسار")
                                .font(.caption).foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                            Text("\(timeline.offTrack)")
                                .font(.title3.bold()).foregroundColor(.red)
                        }
                        Spacer()
                        VStack(alignment: .leading, spacing: 3) {
                            Text("في خطر")
                                .font(.caption).foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                            Text("\(timeline.atRisk)")
                                .font(.title3.bold()).foregroundColor(.orange)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            reportSection(title: "تقارير التجمع") {
                reportLink(icon: "building.fill", title: "تقرير الطاقة الاستيعابية", subtitle: "الإشغال والمقاعد المتاحة لكل مستشفى", color: MiranTheme.teal)
                reportLink(icon: "doc.text.fill", title: "تقرير طلبات التدريب", subtitle: "الطلبات الواردة والمعالجة والمعتمدة", color: MiranTheme.teal)
                reportLink(icon: "chart.xyaxis.line", title: "تقرير التقدم التدريبي", subtitle: "نسبة الإنجاز والمستعدون للتخرج", color: MiranTheme.teal)
            }
        }
    }

    // MARK: - Hospital Reports (Hospital Training Admin)

    @ViewBuilder
    private func hospitalReports() -> some View {
        VStack(spacing: 16) {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                reportKPI(value: "\(store.trainerAssignedTraineesList.count)", label: "المتدربون النشطون", icon: "person.fill", color: MiranTheme.emerald)
                reportKPI(value: "\(store.hospitalTrainers.count)", label: "المدربون", icon: "stethoscope", color: MiranTheme.teal)
                reportKPI(value: "\(store.hospitalRotationsList.count)", label: "الروتيشنات", icon: "arrow.triangle.2.circlepath", color: MiranTheme.warning)
                reportKPI(value: "\(store.attendanceList.count)", label: "سجلات الحضور", icon: "clock.badge.checkmark", color: MiranTheme.info(for: colorScheme))
            }
            .padding(.horizontal, 16)

            reportSection(title: "تقارير المستشفى") {
                reportLink(icon: "person.3.fill", title: "تقرير المتدربين", subtitle: "الحضور، التقدم، والتقييمات لكل متدرب", color: MiranTheme.warning)
                reportLink(icon: "stethoscope", title: "تقرير المدربين", subtitle: "الطاقة الاستيعابية والإنجازات", color: MiranTheme.warning)
                reportLink(icon: "calendar.badge.checkmark", title: "تقرير الحضور", subtitle: "معدل الحضور والغياب والتأخر", color: MiranTheme.warning)
                reportLink(icon: "star.square.fill", title: "تقرير التقييمات", subtitle: "نتائج التقييمات المقدمة والمعلقة", color: MiranTheme.warning)
            }
        }
    }

    // MARK: - University Reports

    @ViewBuilder
    private func universityReports() -> some View {
        VStack(spacing: 16) {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                reportKPI(value: "\(store.trainingRequests.count)", label: "طلبات التدريب", icon: "doc.text.fill", color: MiranTheme.info(for: colorScheme))
                let approved = store.trainingRequests.filter { $0.requestStatus == .approved }.count
                reportKPI(value: "\(approved)", label: "معتمدة", icon: "checkmark.circle.fill", color: MiranTheme.success)
                let pending = store.trainingRequests.filter { $0.requestStatus.isProcessing }.count
                reportKPI(value: "\(pending)", label: "قيد المعالجة", icon: "clock.fill", color: MiranTheme.warning)
                let rejected = store.trainingRequests.filter { $0.requestStatus == .rejected }.count
                reportKPI(value: "\(rejected)", label: "مرفوضة", icon: "xmark.circle.fill", color: MiranTheme.error)
            }
            .padding(.horizontal, 16)

            reportSection(title: "تقارير الجامعة") {
                reportLink(icon: "doc.text.magnifyingglass", title: "تقرير طلبات التدريب", subtitle: "حالة جميع الطلبات المرسلة للتجمعات", color: MiranTheme.info(for: colorScheme))
                reportLink(icon: "graduationcap.fill", title: "تقرير البرامج", subtitle: "البرامج النشطة وأعداد المتدربين", color: MiranTheme.info(for: colorScheme))
            }
        }
    }

    // MARK: - Trainer Reports

    @ViewBuilder
    private func trainerReports() -> some View {
        VStack(spacing: 16) {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                reportKPI(value: "\(store.trainerAssignedTraineesList.count)", label: "متدربوني", icon: "person.fill", color: MiranTheme.emerald)
                reportKPI(value: "\(store.evaluationsList.count)", label: "التقييمات المعلقة", icon: "star.fill", color: MiranTheme.warning)
                reportKPI(value: "\(store.tasksList.filter { $0.status == "pending" }.count)", label: "المهام المعلقة", icon: "checkmark.circle", color: MiranTheme.teal)
                reportKPI(value: "\(store.apiCalls.count)", label: "النداءات النشطة", icon: "bell.fill", color: MiranTheme.error)
            }
            .padding(.horizontal, 16)

            reportSection(title: "تقاريري") {
                reportLink(icon: "person.2.fill", title: "أداء متدربيي", subtitle: "مقارنة الأداء والتقدم لكل متدرب", color: MiranTheme.emerald)
                reportLink(icon: "star.square.fill", title: "التقييمات المقدمة", subtitle: "جميع التقييمات التي أجريتها", color: MiranTheme.emerald)
            }
        }
    }

    // MARK: - Trainee Reports

    @ViewBuilder
    private func traineeReports() -> some View {
        VStack(spacing: 16) {
            reportSection(title: "تقريري الشخصي") {
                reportLink(icon: "chart.bar.fill", title: "تقرير التقدم", subtitle: "نسبة الإنجاز في برنامجي التدريبي", color: MiranTheme.emerald)
                reportLink(icon: "star.fill", title: "تقرير التقييمات", subtitle: "تقييماتي المستلمة والمعلقة", color: MiranTheme.emerald)
                reportLink(icon: "clock.badge.checkmark", title: "سجل الحضور", subtitle: "معدل حضوري وغيابي", color: MiranTheme.emerald)
                reportLink(icon: "book.closed.fill", title: "السجل التدريبي", subtitle: "الحالات المسجلة والمعتمدة", color: MiranTheme.emerald)
            }
        }
    }

    // MARK: - Academic Supervisor Reports

    @ViewBuilder
    private func academicSupervisorReports() -> some View {
        VStack(spacing: 16) {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                reportKPI(value: "\(store.trainerAssignedTraineesList.count)", label: "المتدربون المرتبطون", icon: "person.3.sequence.fill", color: .purple)
                reportKPI(value: "\(store.trainingRequests.count)", label: "طلبات التدريب", icon: "doc.text.fill", color: MiranTheme.teal)
                let pending = store.caseLogsList.filter { $0.status == "pending" }.count
                reportKPI(value: "\(pending)", label: "سجلات قيد الاعتماد", icon: "clock.arrow.circlepath", color: MiranTheme.warning)
                let approved = store.caseLogsList.filter { $0.status == "approved" }.count
                reportKPI(value: "\(approved)", label: "سجلات معتمدة", icon: "checkmark.seal.fill", color: MiranTheme.success)
            }
            .padding(.horizontal, 16)

            reportSection(title: "التقارير الأكاديمية") {
                reportLink(icon: "graduationcap.fill", title: "تقرير أداء المتدربين", subtitle: "متابعة التقدم والإنجازات لكل متدرب", color: .purple)
                reportLink(icon: "checkmark.circle.fill", title: "تقرير اعتماد السجلات", subtitle: "السجلات المعتمدة والمعلقة والمرفوضة", color: .purple)
                reportLink(icon: "doc.text.magnifyingglass", title: "تقرير جودة التدريب", subtitle: "تقييم أداء المستشفيات والمدربين", color: .purple)
            }
        }
    }

    // MARK: - Helpers

    @ViewBuilder
    private func reportKPI(value: String, label: String, icon: String, color: Color) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(color)
            Text(value)
                .font(.system(.title2, design: .rounded, weight: .bold))
                .foregroundColor(MiranTheme.primaryText(for: colorScheme))
            Text(label)
                .font(.caption)
                .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(MiranTheme.surface(for: colorScheme))
        .cornerRadius(12)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(MiranTheme.border(for: colorScheme), lineWidth: 1))
    }

    @ViewBuilder
    private func reportSection(title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text(title)
                .font(.caption.bold())
                .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
                .frame(maxWidth: .infinity, alignment: .trailing)

            VStack(alignment: .trailing, spacing: 0) {
                content()
            }
            .padding(.vertical, 4)
            .padding(.horizontal, 16)
            .background(MiranTheme.surface(for: colorScheme))
            .cornerRadius(14)
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(MiranTheme.border(for: colorScheme), lineWidth: 1))
        }
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private func reportLink(icon: String, title: String, subtitle: String, color: Color) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundColor(color)
                .frame(width: 22)
            VStack(alignment: .trailing, spacing: 2) {
                Text(title)
                    .font(.subheadline.bold())
                    .foregroundColor(MiranTheme.primaryText(for: colorScheme))
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
            }
            Spacer()
            Image(systemName: "chevron.left")
                .font(.caption.bold())
                .foregroundColor(MiranTheme.disabledText(for: colorScheme))
        }
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) {
            Divider().padding(.horizontal, -16).opacity(0.5)
        }
    }
}
