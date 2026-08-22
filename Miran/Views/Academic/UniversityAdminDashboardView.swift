//
//  UniversityAdminDashboardView.swift
//  Miran
//
//  Dedicated Unified Dashboard for University Administrators (شؤون التدريب والامتياز بالجامعة).
//  Connected strictly to real Backend API data (GET /training-requests).
//

import SwiftUI

struct UniversityAdminDashboardView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var colorScheme

    @State private var showCreateRequestSheet = false
    @State private var selectedFilterStatus: String = "ALL"

    private var universityRequests: [TrainingRequestItem] {
        store.trainingRequests
    }

    private var pendingCount: Int {
        universityRequests.filter { $0.requestStatus == .submitted || $0.requestStatus == .underClusterReview }.count
    }

    private var approvedCount: Int {
        universityRequests.filter { $0.requestStatus == .approved || $0.requestStatus == .autoAllocated || $0.requestStatus == .allocated }.count
    }

    private var returnedCount: Int {
        universityRequests.filter { $0.requestStatus == .returnedToUniversity || $0.requestStatus == .hospitalReturnedToCluster }.count
    }

    private var totalStudents: Int {
        universityRequests.reduce(0) { $0 + ($1.studentCount ?? 0) }
    }

    var body: some View {
        SharedDashboardShell(
            roleTitle: "إدارة الامتياز والتدريب بالجامعة",
            subtitle: "متابعة كشوفات المتدربين، طلبات التجمع، وتجهيز الملفات الأكاديمية",
            iconName: "graduationcap.fill",
            accentColor: MiranTheme.primary
        ) {
            VStack(spacing: 20) {
                // 1. Real KPI Stat Cards
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    SharedKPICard(
                        title: "إجمالي أطباء الامتياز",
                        value: "\(totalStudents)",
                        subtitle: "إجمالي الطلاب المرفوعين بالطلبات",
                        iconName: "person.3.fill",
                        color: MiranTheme.primary
                    )

                    SharedKPICard(
                        title: "الطلبات المعلقة",
                        value: "\(pendingCount)",
                        subtitle: "قيد مراجعة وتوزيع التجمع",
                        iconName: "clock.arrow.2.circlepath",
                        color: MiranTheme.warning
                    )

                    SharedKPICard(
                        title: "الطلبات المعتمدة",
                        value: "\(approvedCount)",
                        subtitle: "تم اعتماد مقاعدها بنجاح",
                        iconName: "checkmark.seal.fill",
                        color: MiranTheme.emerald
                    )

                    SharedKPICard(
                        title: "طلبات بحاجة للتعديل",
                        value: "\(returnedCount)",
                        subtitle: "أعيدت من التجمع للتحديث",
                        iconName: "arrow.uturn.backward.circle.fill",
                        color: returnedCount > 0 ? MiranTheme.error : MiranTheme.secondaryText(for: colorScheme)
                    )
                }
                .padding(.horizontal)

                // 2. Quick Actions (RBAC Authorized Only)
                SharedSectionCard(title: "الإجراءات الأكاديمية السريعة", iconName: "bolt.fill") {
                    VStack(spacing: 10) {
                        SharedQuickActionButton(
                            title: "إنشاء طلب تدريب جديد (إكسل / فردي)",
                            subtitle: "رفع كشف دفعة جديدة أو متدرب فردي للتجمع الصحي",
                            iconName: "doc.badge.plus",
                            color: MiranTheme.primary
                        ) {
                            showCreateRequestSheet = true
                        }
                    }
                }

                // 3. Real Training Requests List & Status
                SharedSectionCard(
                    title: "طلبات التدريب المرسلة للتجمع",
                    iconName: "doc.text.fill",
                    badgeText: "\(universityRequests.count) طلب"
                ) {
                    if store.trainingRequestsLoading {
                        SharedLoadingStateView(message: "جاري جلب طلبات الجامعة من السيرفر...")
                    } else if universityRequests.isEmpty {
                        SharedEmptyStateView(
                            title: "لا توجد طلبات تدريب حالياً",
                            message: "يمكنك إنشاء طلب جديد وإرسال كشف المتدربين للتجمع الصحي مباشرة.",
                            iconName: "doc.text.magnifyingglass"
                        )
                    } else {
                        VStack(spacing: 10) {
                            ForEach(universityRequests) { req in
                                NavigationLink(destination: TrainingRequestDetailView(requestID: req.id)) {
                                    HStack(spacing: 12) {
                                        VStack(alignment: .trailing, spacing: 4) {
                                            Text(req.displayRequestNumber)
                                                .font(.system(size: 15, weight: .bold))
                                                .foregroundColor(MiranTheme.primaryText(for: colorScheme))

                                            Text("عدد الطلاب: \(req.count) · التخصص: \(req.specialty ?? "عام")")
                                                .font(.system(size: 12))
                                                .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                                        }

                                        Spacer()

                                        TrainingRequestStatusChip(status: req.requestStatus)
                                    }
                                    .padding(12)
                                    .background(MiranTheme.cardBackground(for: colorScheme).opacity(0.5))
                                    .cornerRadius(12)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(MiranTheme.secondaryText(for: colorScheme).opacity(0.15), lineWidth: 1)
                                    )
                                }
                                .buttonStyle(PlainButtonStyle())
                            }
                        }
                    }
                }
            }
        }
        .task {
            await store.fetchTrainingRequests()
        }
        .refreshable {
            await store.fetchTrainingRequests()
        }
        .sheet(isPresented: $showCreateRequestSheet) {
            CreateTrainingRequestSheet()
        }
    }
}
