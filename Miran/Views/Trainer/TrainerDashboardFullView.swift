//
//  TrainerDashboardFullView.swift
//  Miran
//
//  Dedicated Clinical Dashboard Interface for Field Trainers (استشاري / أخصائي / مدرب).
//

import SwiftUI

// MARK: - لوحة تحكم المدرب السريري الميداني (Clinical Trainer)
struct TrainerDashboardFullView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @StateObject private var trainerVM = TrainerViewModel()
    @Environment(\.colorScheme) var colorScheme

    @State private var showTaskModal = false
    @State private var showLaunchCallModal = false
    @State private var rejectTarget: AssignmentRequestModel?
    @State private var rejectReason = ""

    var body: some View {
        SharedDashboardShell(
            roleTitle: "لوحة المدرب السريري الميداني",
            subtitle: "المتدربون المسندون إليك، مهام التدريب، اعتماد السجلات والنداءات العاجلة",
            iconName: "stethoscope.circle.fill",
            accentColor: MiranTheme.emerald
        ) {
            VStack(spacing: 20) {
                // 1. Real Trainer KPI Stat Cards
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    SharedKPICard(
                        title: "المتدربون تحت إشرافك",
                        value: "\(store.trainees.count)",
                        subtitle: "إجمالي المتدربين المسندين إليك",
                        iconName: "person.3.sequence.fill",
                        color: MiranTheme.emerald
                    )

                    SharedKPICard(
                        title: "طلبات الإسناد الجديدة",
                        value: "\(trainerVM.assignmentRequests.count)",
                        subtitle: "طلبات تنتظر قرار القبـول",
                        iconName: "tray.full.fill",
                        color: trainerVM.assignmentRequests.count > 0 ? MiranTheme.warning : MiranTheme.secondaryText(for: colorScheme)
                    )
                }
                .padding(.horizontal)

                // 2. Quick Actions
                SharedSectionCard(title: "الإجراءات الميدانية والنداءات", iconName: "bolt.fill") {
                    VStack(spacing: 10) {
                        SharedQuickActionButton(
                            title: "إطلاق نداء طوارئ M-CALL",
                            subtitle: "نداء عاجل لجميع الأطباء المتدربين الميدانيين",
                            iconName: "bell.and.waves.left.and.right.fill",
                            color: MiranTheme.error
                        ) {
                            showLaunchCallModal = true
                        }

                        SharedQuickActionButton(
                            title: "إسناد مهمة جديدة للمتدربين",
                            subtitle: "تحديد إجراء سريري أو واجب للدفعة",
                            iconName: "plus.circle.fill",
                            color: MiranTheme.emerald
                        ) {
                            showTaskModal = true
                        }
                    }
                }

                // 3. Pending Assignment Requests — real backend data
                if !trainerVM.assignmentRequests.isEmpty {
                    SharedSectionCard(
                        title: "طلبات إسناد المتدربين الجديدة",
                        iconName: "tray.full.fill",
                        badgeText: "\(trainerVM.assignmentRequests.count) طلب"
                    ) {
                        VStack(spacing: 10) {
                            ForEach(trainerVM.assignmentRequests) { req in
                                VStack(alignment: .trailing, spacing: 6) {
                                    Text(req.traineeProfile?.person?.nameAr ?? "متدرب")
                                        .font(.subheadline.bold())
                                        .foregroundColor(MiranTheme.primaryText(for: colorScheme))
                                    Text("\(req.organization?.nameAr ?? "") · \(req.department?.nameAr ?? "") · \(String(req.startDate.prefix(10))) → \(String(req.endDate.prefix(10)))")
                                        .font(.caption2)
                                        .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                                    HStack(spacing: 10) {
                                        Button {
                                            Task { await trainerVM.acceptAssignment(rotationId: req.id) }
                                        } label: {
                                            Text("قبول").font(.caption.bold())
                                                .frame(maxWidth: .infinity).padding(8)
                                                .background(MiranTheme.emerald).foregroundColor(.white).cornerRadius(8)
                                        }
                                        Button {
                                            rejectTarget = req
                                            rejectReason = ""
                                        } label: {
                                            Text("رفض").font(.caption.bold())
                                                .frame(maxWidth: .infinity).padding(8)
                                                .background(Color.red.opacity(0.85)).foregroundColor(.white).cornerRadius(8)
                                        }
                                    }
                                }
                                .padding(12)
                                .background(MiranTheme.cardBackground(for: colorScheme).opacity(0.5))
                                .cornerRadius(12)
                            }
                        }
                    }
                }

                // 4. Pending Sign-off Tasks Section
                SharedSectionCard(title: "المهارات والإجراءات بانتظار الاعتماد", iconName: "checkmark.seal.fill") {
                    NavigationLink(destination: ClinicalLogbookManagementFullView()) {
                        SharedQuickActionButton(
                            title: "اعتماد مهارات Logbook وحالات المتدربين",
                            subtitle: "مراجعة حالات الباطنة وطب الطوارئ المعلقة",
                            iconName: "checkmark.seal.fill",
                            color: MiranTheme.emerald
                        ) {}
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
        }
        .task {
            await trainerVM.fetchAssignmentRequests()
        }
        .refreshable {
            await trainerVM.fetchAssignmentRequests()
        }
        .sheet(isPresented: $showLaunchCallModal) {
            CallLauncherView(onLaunched: { _ in
                showLaunchCallModal = false
            })
        }
        .sheet(isPresented: $showTaskModal) {
            CreateTaskSheet()
        }
        .sheet(item: $rejectTarget) { req in
            NavigationView {
                ZStack {
                    MiranTheme.background.ignoresSafeArea()
                    VStack(spacing: 14) {
                        TextField("سبب الرفض (إلزامي)", text: $rejectReason)
                            .padding().background(Color.white.opacity(0.06)).cornerRadius(10).foregroundColor(.white)
                        Button {
                            Task {
                                await trainerVM.rejectAssignment(rotationId: req.id, reason: rejectReason)
                                rejectTarget = nil
                            }
                        } label: {
                            Text("تأكيد الرفض").font(.headline.bold()).frame(maxWidth: .infinity).padding()
                                .background(rejectReason.trimmingCharacters(in: .whitespaces).isEmpty ? Color.gray : Color.red)
                                .foregroundColor(.white).cornerRadius(12)
                        }
                        .disabled(rejectReason.trimmingCharacters(in: .whitespaces).isEmpty)
                        Spacer()
                    }
                    .padding()
                }
                .navigationTitle("رفض إسناد المتدرب")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button("إلغاء") { rejectTarget = nil }.foregroundColor(.red)
                    }
                }
            }
        }
    }
}

// MARK: - Create Task Modal
struct CreateTaskSheet: View {
    @Environment(\.dismiss) var dismiss
    @State private var taskTitle = ""
    @State private var taskDetails = ""
    @State private var dueDate = Date()

    var body: some View {
        NavigationView {
            ZStack {
                MiranTheme.background.ignoresSafeArea()

                VStack(spacing: 14) {
                    TextField("عنوان المهمة السريرية", text: $taskTitle)
                        .padding()
                        .background(Color.white.opacity(0.06))
                        .cornerRadius(10)
                        .foregroundColor(.white)

                    TextField("تفاصيل والـ Competencies المطلوبة", text: $taskDetails)
                        .padding()
                        .background(Color.white.opacity(0.06))
                        .cornerRadius(10)
                        .foregroundColor(.white)

                    DatePicker("تاريخ التسليم", selection: $dueDate, displayedComponents: [.date, .hourAndMinute])
                        .colorScheme(.dark)
                        .padding()
                        .background(Color.white.opacity(0.06))
                        .cornerRadius(10)

                    Spacer()

                    Button {
                        dismiss()
                    } label: {
                        Text("حفظ وإسناد المهمة")
                            .font(.headline.bold())
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(MiranTheme.emerald)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                    }
                    .disabled(taskTitle.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding()
            }
            .navigationTitle("إسناد مهمة جديدة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
            }
        }
    }
}
