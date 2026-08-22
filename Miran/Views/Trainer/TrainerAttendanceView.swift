//
//  TrainerAttendanceView.swift
//  Miran
//
//  شاشة متابعة واعتماد الحضور والانضباط الميداني للمدرب.
//  تتيح للمدرب مراجعة سجلات الحضور والانصراف، وطلبات التصحيح للمتدربين المسندين إليه، واتخاذ قرار القبول/الرفض.
//

import SwiftUI

struct TrainerAttendanceView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var systemColorScheme

    @State private var filterStatus: String = "ALL"
    @State private var rejectTargetRecord: AttendanceItemModel?
    @State private var rejectReason: String = ""
    @State private var isSubmitting: Bool = false

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Header & Filter
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("متابعة الحضور والانضباط")
                            .font(.title2.bold())
                            .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                        Text("اعتماد سجلات الحضور والانصراف وطلبات التصحيح للمتدربين المسندين إليك")
                            .font(.caption)
                            .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                    }
                    Spacer()
                }
                .padding()
                .background(MiranTheme.cardBackground(for: systemColorScheme))

                Divider()

                // Filter Strip
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FilterPill(title: "الكل", isSelected: filterStatus == "ALL") { filterStatus = "ALL" }
                        FilterPill(title: "طلبات التصحيح", isSelected: filterStatus == "correction_requested") { filterStatus = "correction_requested" }
                        FilterPill(title: "حاضر", isSelected: filterStatus == "present") { filterStatus = "present" }
                        FilterPill(title: "متأخر", isSelected: filterStatus == "late") { filterStatus = "late" }
                        FilterPill(title: "مرفوض", isSelected: filterStatus == "rejected") { filterStatus = "rejected" }
                    }
                    .padding()
                }

                // Attendance List
                let filtered = getFilteredAttendance()

                if filtered.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "checkmark.seal")
                            .font(.system(size: 48))
                            .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                        Text("لا توجد سجلات حضور مطابقة للمحدد")
                            .font(.headline)
                            .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(filtered) { record in
                                AttendanceRecordCard(
                                    record: record,
                                    onApprove: { Task { try? await store.approveAttendance(id: record.id) } },
                                    onReject: { rejectTargetRecord = record }
                                )
                            }
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("متابعة الحضور")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(item: $rejectTargetRecord) { record in
                RejectAttendanceSheet(record: record)
            }
            .task {
                await store.fetchTrainerData()
            }
        }
    }

    private func getFilteredAttendance() -> [AttendanceItemModel] {
        if filterStatus == "ALL" { return store.attendanceList }
        return store.attendanceList.filter { $0.status == filterStatus }
    }
}

// MARK: - Attendance Record Card Component
struct AttendanceRecordCard: View {
    let record: AttendanceItemModel
    let onApprove: () -> Void
    let onReject: () -> Void
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(record.traineeProfile?.person?.nameAr ?? "متدرب")
                        .font(.subheadline.bold())
                        .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                    Text(record.date.prefix(10))
                        .font(.caption2.monospaced())
                        .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                }

                Spacer()

                // Status Badge
                Text(self.statusLabel(record.status))
                    .font(.caption2.bold())
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(self.statusColor(record.status).opacity(0.15))
                    .foregroundColor(self.statusColor(record.status))
                    .cornerRadius(8)
            }

            Divider()

            HStack(spacing: 16) {
                HStack(spacing: 4) {
                    Image(systemName: "clock.arrow.circlepath")
                        .foregroundColor(MiranTheme.emerald)
                    Text("دخول: \(record.checkIn != nil ? String(record.checkIn!.suffix(13).prefix(5)) : "—")")
                        .font(.caption)
                }

                HStack(spacing: 4) {
                    Image(systemName: "clock.fill")
                        .foregroundColor(.blue)
                    Text("خروج: \(record.checkOut != nil ? String(record.checkOut!.suffix(13).prefix(5)) : "—")")
                        .font(.caption)
                }

                if let method = record.method {
                    Spacer()
                    Text(method)
                        .font(.caption2)
                        .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                }
            }

            if let reason = record.excuseReason, !reason.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "quote.bubble.fill")
                        .foregroundColor(.orange)
                    Text("ملاحظة/عذر: \(reason)")
                        .font(.caption2)
                        .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                }
                .padding(8)
                .background(Color.orange.opacity(0.1))
                .cornerRadius(8)
            }

            // Action Buttons for Pending or Correction Requested Records
            if record.status == "correction_requested" || record.status == "pending" {
                HStack(spacing: 12) {
                    Button(action: onApprove) {
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                            Text("اعتماد الحضور")
                        }
                        .font(.caption.bold())
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(MiranTheme.emerald)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                    }

                    Button(action: onReject) {
                        HStack {
                            Image(systemName: "xmark.circle.fill")
                            Text("رفض")
                        }
                        .font(.caption.bold())
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(MiranTheme.error)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding()
        .background(MiranTheme.cardBackground(for: systemColorScheme))
        .cornerRadius(12)
        .shadow(color: Color.black.opacity(0.03), radius: 4, x: 0, y: 2)
    }

    private func statusLabel(_ status: String) -> String {
        switch status {
        case "present": return "حاضر"
        case "late": return "متأخر"
        case "correction_requested": return "طلب تصحيح"
        case "rejected": return "مرفوض"
        default: return status
        }
    }

    private func statusColor(_ status: String) -> Color {
        switch status {
        case "present": return MiranTheme.emerald
        case "late": return .orange
        case "correction_requested": return .blue
        case "rejected": return MiranTheme.error
        default: return .gray
        }
    }
}

// MARK: - Filter Pill
struct FilterPill: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption.bold())
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(isSelected ? MiranTheme.emerald : MiranTheme.cardBackground(for: systemColorScheme))
                .foregroundColor(isSelected ? .white : MiranTheme.primaryText(for: systemColorScheme))
                .cornerRadius(20)
        }
    }
}

// MARK: - Reject Attendance Modal Sheet
struct RejectAttendanceSheet: View {
    let record: AttendanceItemModel
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) var dismiss

    @State private var reason: String = ""
    @State private var isSubmitting = false

    var body: some View {
        NavigationView {
            Form {
                Section("سبب الرفض") {
                    TextField("ادخل سبب رفض الحضور...", text: $reason)
                }

                Section {
                    Button("تأكيد الرفض", role: .destructive) {
                        Task {
                            isSubmitting = true
                            try? await store.rejectAttendance(id: record.id, reason: reason)
                            isSubmitting = false
                            dismiss()
                        }
                    }
                    .disabled(reason.isEmpty || isSubmitting)
                }
            }
            .navigationTitle("رفض سجل الحضور")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
            }
        }
    }
}
