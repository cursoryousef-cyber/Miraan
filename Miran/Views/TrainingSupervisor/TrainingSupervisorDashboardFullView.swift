//
//  TrainingSupervisorDashboardFullView.swift
//  Miran
//
//  Dedicated Dashboard Interface for Hospital Training Admins & Supervisors.
//  متصل مباشرة بالـ Backend API: إدارة التدريب، الأقسام، السعة، الجداول، الكشوفات والنداءات.
//

import SwiftUI

// MARK: - لوحة تحكم مشرف التدريب بالمستشفى (Hospital Training Admin / Supervisor)
struct TrainingSupervisorDashboardFullView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var systemColorScheme

    @State private var showTransferSheet = false
    @State private var activeTabSelection = 0

    var body: some View {
        SharedDashboardShell(
            roleTitle: "إدارة التدريب والامتياز بالمستشفى",
            subtitle: "نطاق المستشفى الخاص بك: تخصيص الأقسام، اعتماد المتدربين، ومتابعة السعة الاستيعابية",
            iconName: "cross.case.circle.fill",
            accentColor: MiranTheme.emerald
        ) {
            VStack(spacing: 20) {
                // 1. Real Hospital Metrics Grid
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    SharedKPICard(
                        title: "المدربون المؤهلون",
                        value: "\(store.hospitalTrainers.count)",
                        subtitle: "الكادر التدريبي الميداني بالمستشفى",
                        iconName: "stethoscope",
                        color: MiranTheme.emerald
                    )

                    SharedKPICard(
                        title: "الأقسام السريرية",
                        value: "\(store.hospitalDepartmentsList.count)",
                        subtitle: "الأقسام المعتمدة للتأهيل",
                        iconName: "building.2.fill",
                        color: .blue
                    )

                    SharedKPICard(
                        title: "الروتيشنات النشطة",
                        value: "\(store.hospitalRotationsList.filter { $0.status == "active" }.count)",
                        subtitle: "الجداول والتنقلات الجارية",
                        iconName: "calendar.badge.clock",
                        color: .purple
                    )

                    SharedKPICard(
                        title: "النداءات الحية M-CALL",
                        value: "\(store.apiCalls.filter { $0.status == "active" }.count)",
                        subtitle: "نداءات الطوارئ النشطة بالمستشفى",
                        iconName: "bell.badge.fill",
                        color: store.apiCalls.filter { $0.status == "active" }.count > 0 ? MiranTheme.error : MiranTheme.secondaryText(for: systemColorScheme)
                    )
                }
                .padding(.horizontal)

                    // Section 1: Trainer Capacity & Occupancy Cards (Backend Qualified Workspace Cards)
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("السعة الاستيعابية للمدربين في المستشفى")
                                .font(.headline.bold())
                                .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                            Spacer()
                            Text("\(store.hospitalTrainers.count) مدرب")
                                .font(.caption.bold())
                                .foregroundColor(MiranTheme.emerald)
                        }
                        .padding(.horizontal)

                        if store.hospitalTrainers.isEmpty {
                            HStack {
                                Spacer()
                                Text("جاري تحميل بيانات المدربين والسعة...")
                                    .font(.caption)
                                    .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                                Spacer()
                            }
                            .padding(.vertical, 20)
                        } else {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 12) {
                                    ForEach(store.hospitalTrainers) { tr in
                                        TrainerCapacityCard(trainer: tr)
                                    }
                                }
                                .padding(.horizontal)
                            }
                        }
                    }

                    // Section 2: Clinical Departments & Capacity
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("الأقسام السريرية والسعة الاستيعابية")
                                .font(.headline.bold())
                                .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                            Spacer()
                        }
                        .padding(.horizontal)

                        VStack(spacing: 8) {
                            ForEach(store.hospitalDepartmentsList) { dept in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(dept.nameAr)
                                            .font(.subheadline.bold())
                                            .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                                        Text("كود القسم: \(dept.code ?? "—")")
                                            .font(.caption2)
                                            .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                                    }

                                    Spacer()

                                    HStack(spacing: 6) {
                                        Image(systemName: "person.3.fill")
                                            .font(.caption)
                                        Text("السعة: \(dept.capacity)")
                                            .font(.caption.bold())
                                    }
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(MiranTheme.emerald.opacity(0.12))
                                    .foregroundColor(MiranTheme.emerald)
                                    .cornerRadius(8)
                                }
                                .padding()
                                .background(MiranTheme.cardBackground(for: systemColorScheme))
                                .cornerRadius(12)
                            }
                        }
                        .padding(.horizontal)
                    }

                    // Section 3: Operations Actions
                    VStack(alignment: .leading, spacing: 12) {
                        Text("عمليات التوزيع والتحويل الميداني")
                    // Section 3: Quick Actions for Hospital Scope
                    SharedSectionCard(title: "الإجراءات والخدمات السريعة بالمستشفى", iconName: "bolt.fill") {
                        VStack(spacing: 10) {
                            SharedQuickActionButton(
                                title: "إعادة إسناد المتدرب لمدرب جديد",
                                subtitle: "إسناد المتدرب لمدرب آخر بنفس المستشفى مع حفظ السجل",
                                iconName: "arrow.triangle.branch",
                                color: MiranTheme.emerald
                            ) {
                                showTransferSheet = true
                            }

                            NavigationLink(destination: CallCenterView()) {
                                SharedQuickActionButton(
                                    title: "مركز التحكم بالنداءات والاستدعاءات (M-CALL)",
                                    subtitle: "متابعة زمن استجابة المتدربين للنداءات العاجلة",
                                    iconName: "bell.badge.fill",
                                    color: .red
                                ) {}
                            }
                            .buttonStyle(PlainButtonStyle())
                        }
                    }
                }
            }
        }
        .task {
            await store.fetchHospitalData()
        }
        .refreshable {
            await store.fetchHospitalData()
        }
        .sheet(isPresented: $showTransferSheet) {
            TraineeReassignmentSheet()
        }
    }
}

// MARK: - Trainer Capacity Card
struct TrainerCapacityCard: View {
    let trainer: TrainerQualifiedCardModel
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "person.badge.shield.checkmark.fill")
                    .foregroundColor(MiranTheme.emerald)
                Text(trainer.nameAr)
                    .font(.subheadline.bold())
                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                    .lineLimit(1)
            }

            Text(trainer.departmentName ?? "قسم سريري")
                .font(.caption2)
                .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))

            ProgressView(value: Double(trainer.occupied), total: Double(max(1, trainer.capacity)))
                .tint(trainer.occupancyPercentage >= 100 ? .orange : MiranTheme.emerald)

            HStack {
                Text("المشغول: \(trainer.occupied)/\(trainer.capacity)")
                    .font(.caption2.bold())
                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                Spacer()
                Text("\(Int(trainer.occupancyPercentage))%")
                    .font(.caption2.bold())
                    .foregroundColor(trainer.occupancyPercentage >= 100 ? .orange : MiranTheme.emerald)
            }
        }
        .padding()
        .frame(width: 200)
        .background(MiranTheme.cardBackground(for: systemColorScheme))
        .cornerRadius(12)
        .shadow(color: Color.black.opacity(0.03), radius: 4, x: 0, y: 2)
    }
}

// MARK: - Trainee Reassignment Modal Sheet
struct TraineeReassignmentSheet: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) var dismiss

    @State private var selectedTraineeId: String = ""
    @State private var selectedTrainerId: String = ""
    @State private var reason: String = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationView {
            Form {
                Section("بيانات إعادة الإسناد") {
                    Picker("المتدرب", selection: $selectedTraineeId) {
                        Text("اختر متدرباً...").tag("")
                        ForEach(store.hospitalRotationsList.compactMap { rot -> (RotationModel, TraineeProfileModel)? in
                            guard let t = rot.traineeProfile else { return nil }
                            return (rot, t)
                        }, id: \.0.id) { (rot, trainee) in
                            Text("\(trainee.person?.nameAr ?? trainee.id) (\(rot.department?.nameAr ?? ""))").tag(trainee.id)
                        }
                    }

                    Picker("المدرب البديل (السعة المتاحة)", selection: $selectedTrainerId) {
                        Text("اختر مدرباً...").tag("")
                        ForEach(store.hospitalTrainers) { tr in
                            Text("\(tr.nameAr) (المتاح: \(tr.available))").tag(tr.trainerProfileId)
                        }
                    }

                    TextField("سبب إعادة الإسناد (اختياري)", text: $reason)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).font(.caption).foregroundColor(MiranTheme.error)
                    }
                }

                Section {
                    Button {
                        Task { await handleReassign() }
                    } label: {
                        if isSubmitting {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text("تأكيد إعادة الإسناد")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .foregroundColor(MiranTheme.emerald)
                        }
                    }
                    .disabled(selectedTraineeId.isEmpty || selectedTrainerId.isEmpty || isSubmitting)
                }
            }
            .navigationTitle("إعادة إسناد متدرب")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
            }
        }
    }

    private func handleReassign() async {
        isSubmitting = true
        errorMessage = nil
        do {
            try await store.reassignTrainer(traineeProfileId: selectedTraineeId, targetTrainerProfileId: selectedTrainerId, reason: reason.isEmpty ? nil : reason)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}
