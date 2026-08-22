//
//  TodayView.swift
//  مِران
//
//  شاشة «اليوم» — مبنية على TraineeViewModel وAPIClient الحقيقيين، لا بيانات وهمية.
//

import SwiftUI

struct TodayView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @StateObject private var vm = TraineeViewModel()

    private var activeRotation: RotationModel? {
        vm.rotations.first(where: { $0.status == "active" })
    }

    private var todayAttendance: AttendanceModel? {
        let todayStr = ISO8601DateFormatter().string(from: Date()).prefix(10)
        return vm.attendance.first(where: { $0.date.prefix(10) == todayStr })
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if let profile = vm.traineeProfile {
                        headerCard(profile)
                        currentPlaceCard
                        attendanceCard
                        tasksCard
                        callCard
                    } else if vm.isLoading {
                        ProgressView().padding(40)
                    } else {
                        EmptyStateView(icon: "person.slash",
                                       title: "لا يوجد ملف متدرب",
                                       message: vm.errorMessage ?? "تعذر تحميل بياناتك.")
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("اليوم")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("خروج") { authViewModel.logout() }
                }
            }
            .task { await vm.fetchDashboardData() }
            .refreshable { await vm.fetchDashboardData() }
        }
    }

    // MARK: أقسام الشاشة

    private func headerCard(_ p: TraineeProfileModel) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "person.crop.circle.fill")
                .font(.system(size: 44))
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 3) {
                Text(p.person?.nameAr ?? "—").font(.headline)
                Text("\(p.level) • \(p.specialtyAr ?? "—")")
                    .font(.caption).foregroundStyle(.secondary)
                MiranBadge(p.cardStatus == "active" ? "بطاقة سارية" : "غير مفعّلة",
                           color: p.cardStatus == "active" ? MiranTheme.green : .gray,
                           icon: "checkmark.shield.fill")
            }
            Spacer()
        }
        .miranCard()
    }

    private var currentPlaceCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("أين أنت الآن", systemImage: "location.fill")

            if let rotation = activeRotation {
                InfoRow(label: "القسم", value: rotation.department?.nameAr ?? "—", icon: "building.2")
                InfoRow(label: "المدرب", value: rotation.trainerProfile?.person?.nameAr ?? "—", icon: "person.text.rectangle")
                InfoRow(label: "التحويلة", value: rotation.trainerProfile?.extensionNumber ?? "—", icon: "phone")
                Divider()
                InfoRow(label: "من", value: String(rotation.startDate.prefix(10)), icon: "calendar")
                InfoRow(label: "إلى", value: String(rotation.endDate.prefix(10)), icon: "calendar.badge.checkmark")
            } else {
                Text("لا يوجد روتيشن نشط حالياً").font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .miranCard(tint: MiranTheme.accent)
    }

    private var attendanceCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("الحضور", systemImage: "checkmark.circle")

            if let record = todayAttendance, record.checkIn != nil {
                InfoRow(label: "تسجيل الدخول", value: record.checkIn ?? "—", icon: "arrow.right.to.line")
                if let out = record.checkOut {
                    InfoRow(label: "تسجيل الخروج", value: out, icon: "arrow.left.to.line")
                } else {
                    Button {
                        Task { await vm.checkOut(attendanceId: record.id) }
                    } label: {
                        Label("تسجيل الانصراف", systemImage: "arrow.left.to.line")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
            } else {
                Text("لم تسجّل حضورك اليوم بعد.")
                    .font(.subheadline).foregroundStyle(.secondary)
                Button {
                    Task { await vm.checkIn() }
                } label: {
                    Label("تسجيل الحضور", systemImage: "qrcode.viewfinder")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .miranCard()
    }

    private var tasksCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("مهامي", systemImage: "checklist")
            let openTasks = vm.tasks.filter { $0.status != "completed" }
            if openTasks.isEmpty {
                Text("لا توجد مهام معلقة.").font(.subheadline).foregroundStyle(.secondary)
            } else {
                ForEach(openTasks.prefix(5)) { task in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(task.titleAr).font(.subheadline).bold()
                            Text("الاستحقاق: \(String(task.dueDate.prefix(10)))")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        Spacer()
                        MiranBadge(task.status, color: .orange)
                    }
                    .padding(.vertical, 3)
                }
            }
        }
        .miranCard()
    }

    private var callCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("النداء الحالي", systemImage: "bell.badge")
            if let call = vm.activeCall {
                HStack {
                    Image(systemName: "bell.fill").foregroundStyle(.orange)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(call.customTitle ?? "نداء سريري").font(.subheadline).bold()
                        Text(call.location ?? "—").font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer()
                }
            } else {
                Text("لا يوجد نداء حالياً.").font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .miranCard()
    }
}
