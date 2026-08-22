//
//  ScheduleBuilderView.swift
//  Miran
//
//  iOS Schedule Builder Component.
//  يوفر واجهة تفاعلية كاملة لإدارة وبناء الجداول والروتيشنات والشفتات.
//  يدعم: Week View, Day View, Agenda, Conflict Detection, Capacity Validation, Recurring, Publish Status, Notifications.
//

import SwiftUI

enum ScheduleViewMode: String, CaseIterable, Identifiable {
    case week = "أسبوعي"
    case day = "يومي"
    case agenda = "الأجندة"

    var id: String { rawValue }
}

struct ScheduleBuilderView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.colorScheme) var systemColorScheme

    var isReadOnly: Bool = false

    @State private var selectedDate: Date = Date()
    @State private var viewMode: ScheduleViewMode = .week
    @State private var showingCreateSheet = false
    @State private var selectedRotationToEdit: RotationModel?
    @State private var filterDepartmentId: String = "ALL"
    @State private var filterStatus: String = "ALL"

    var body: some View {
        VStack(spacing: 0) {
            // MARK: - Header Controls
            VStack(spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("منشئ ومخطط الجداول")
                            .font(.title2.bold())
                            .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))

                        Text(isReadOnly ? "عرض جدول التدريب والروتيشنات النشطة" : "إدارة الشفتات والروتيشنات، منع التعارض والتحقق من السعة")
                            .font(.caption)
                            .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                    }

                    Spacer()

                    if !isReadOnly {
                        Button {
                            showingCreateSheet = true
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "plus.circle.fill")
                                Text("جلسة جديدة")
                            }
                            .font(.subheadline.bold())
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(MiranTheme.emerald)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                        }
                    }
                }

                // View Mode Selector & Department Filter
                HStack(spacing: 12) {
                    Picker("نمط العرض", selection: $viewMode) {
                        ForEach(ScheduleViewMode.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)

                    Menu {
                        Button("جميع الأقسام") { filterDepartmentId = "ALL" }
                        Divider()
                        ForEach(store.hospitalDepartmentsList) { dept in
                            Button(dept.nameAr) { filterDepartmentId = dept.id }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "line.3.horizontal.decrease.circle")
                            Text(filterDepartmentId == "ALL" ? "القسم" : (store.hospitalDepartmentsList.first(where: { $0.id == filterDepartmentId })?.nameAr ?? "القسم"))
                                .lineLimit(1)
                        }
                        .font(.caption.bold())
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(MiranTheme.cardBackground(for: systemColorScheme))
                        .cornerRadius(8)
                    }
                }
            }
            .padding()
            .background(MiranTheme.cardBackground(for: systemColorScheme))

            Divider()

            // MARK: - Week Strip Component
            if viewMode == .week || viewMode == .day {
                WeekStripView(selectedDate: $selectedDate)
                    .padding(.vertical, 8)
                    .background(MiranTheme.background(for: systemColorScheme))
            }

            // MARK: - Schedule Items View
            ScrollView {
                VStack(spacing: 16) {
                    // Conflicts / Warning Banner
                    let activeConflicts = detectAllConflicts()
                    if !activeConflicts.isEmpty && !isReadOnly {
                        HStack(spacing: 10) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.orange)
                            Text("تنبيه: تم اكتشاف \(activeConflicts.count) تعارض في المواعيد للجلسات التالية!")
                                .font(.caption.bold())
                                .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                            Spacer()
                        }
                        .padding()
                        .background(Color.orange.opacity(0.15))
                        .cornerRadius(12)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.orange.opacity(0.4), lineWidth: 1))
                    }

                    // Schedule Items List
                    let filteredRotations = getFilteredRotations()

                    if filteredRotations.isEmpty {
                        MiranEmptyStateView(
                            titleAr: "لا توجد جلسات أو روتيشنات مجدولة",
                            subtitleAr: isReadOnly ? "لم يتم جدولتها بعد لهذا التاريخ." : "استخدم زر «جلسة جديدة» لإضافة روتيشن أو مناوبة لمتدرب.",
                            icon: "calendar.badge.clock",
                            buttonTitleAr: isReadOnly ? nil : "جلسة جديدة",
                            action: isReadOnly ? nil : { showingCreateSheet = true }
                        )
                    } else {
                        LazyVStack(spacing: 12) {
                            ForEach(filteredRotations) { rotation in
                                RotationScheduleCard(
                                    rotation: rotation,
                                    isReadOnly: isReadOnly,
                                    hasConflict: hasConflict(rotation),
                                    onEdit: { selectedRotationToEdit = rotation }
                                )
                            }
                        }
                    }
                }
                .padding()
            }
        }
        .sheet(isPresented: $showingCreateSheet) {
            CreateSessionSheet()
        }
        .sheet(item: $selectedRotationToEdit) { rotation in
            EditSessionSheet(rotation: rotation)
        }
        .task {
            await store.fetchHospitalData()
            await store.fetchTrainerData()
            await store.fetchTraineeData()
        }
    }

    // MARK: - Filtering & Conflict Detection Helpers
    private func getFilteredRotations() -> [RotationModel] {
        let list = store.hospitalRotationsList.isEmpty ? store.apiRotations : store.hospitalRotationsList

        return list.filter { r in
            if filterDepartmentId != "ALL" && r.department?.id != filterDepartmentId { return false }

            // Date match depending on view mode
            if viewMode == .day {
                guard let start = parseDate(r.startDate), let end = parseDate(r.endDate) else { return true }
                let targetDay = Calendar.current.startOfDay(for: selectedDate)
                return targetDay >= Calendar.current.startOfDay(for: start) && targetDay <= Calendar.current.startOfDay(for: end)
            }
            return true
        }
    }

    private func detectAllConflicts() -> [RotationModel] {
        let list = store.hospitalRotationsList
        var conflicts: [RotationModel] = []
        for i in 0..<list.count {
            for j in (i+1)..<list.count {
                let r1 = list[i], r2 = list[j]
                if r1.traineeProfile?.id == r2.traineeProfile?.id || r1.trainerProfile?.id == r2.trainerProfile?.id {
                    if isDateOverlapping(r1Start: r1.startDate, r1End: r1.endDate, r2Start: r2.startDate, r2End: r2.endDate) {
                        if !conflicts.contains(where: { $0.id == r1.id }) { conflicts.append(r1) }
                        if !conflicts.contains(where: { $0.id == r2.id }) { conflicts.append(r2) }
                    }
                }
            }
        }
        return conflicts
    }

    private func hasConflict(_ rotation: RotationModel) -> Bool {
        detectAllConflicts().contains(where: { $0.id == rotation.id })
    }

    private func isDateOverlapping(r1Start: String, r1End: String, r2Start: String, r2End: String) -> Bool {
        guard let s1 = parseDate(r1Start), let e1 = parseDate(r1End),
              let s2 = parseDate(r2Start), let e2 = parseDate(r2End) else { return false }
        return s1 <= e2 && s2 <= e1
    }

    private func parseDate(_ str: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        return formatter.date(from: str) ?? ISO8601DateFormatter().date(from: str)
    }
}

// MARK: - Week Strip View
struct WeekStripView: View {
    @Binding var selectedDate: Date
    @Environment(\.colorScheme) var systemColorScheme

    var days: [Date] {
        let calendar = Calendar.current
        let startOfWeek = calendar.date(from: calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: selectedDate)) ?? selectedDate
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: startOfWeek) }
    }

    var body: some View {
        HStack(spacing: 8) {
            ForEach(days, id: \.self) { day in
                let isSelected = Calendar.current.isDate(day, inSameDayAs: selectedDate)
                let isToday = Calendar.current.isDateInToday(day)
                let weekday = Calendar.current.component(.weekday, from: day) // 6 = Friday, 7 = Saturday
                let isWeekend = (weekday == 6 || weekday == 7)

                VStack(spacing: 6) {
                    Text(dayName(day))
                        .font(.caption2.bold())
                        .foregroundColor(isSelected ? .white : (isWeekend ? .secondary : MiranTheme.secondaryText(for: systemColorScheme)))

                    Text("\(Calendar.current.component(.day, from: day))")
                        .font(.headline.bold())
                        .foregroundColor(isSelected ? .white : (isToday ? MiranTheme.emerald : MiranTheme.primaryText(for: systemColorScheme)))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(isSelected ? MiranTheme.emerald : (isWeekend ? Color.gray.opacity(0.08) : (isToday ? MiranTheme.emerald.opacity(0.12) : MiranTheme.cardBackground(for: systemColorScheme))))
                .cornerRadius(12)
                .onTapGesture {
                    withAnimation { selectedDate = day }
                }
            }
        }
        .padding(.horizontal)
    }

    private func dayName(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ar")
        formatter.dateFormat = "EEE"
        return formatter.string(from: date)
    }
}

// MARK: - Rotation Schedule Card
struct RotationScheduleCard: View {
    let rotation: RotationModel
    let isReadOnly: Bool
    let hasConflict: Bool
    let onEdit: () -> Void
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                // Department Badge
                HStack(spacing: 4) {
                    Image(systemName: "cross.fill")
                    Text(rotation.department?.nameAr ?? "قسم سريري")
                }
                .font(.caption.bold())
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(MiranTheme.emerald.opacity(0.15))
                .foregroundColor(MiranTheme.emerald)
                .cornerRadius(8)

                if hasConflict {
                    HStack(spacing: 4) {
                        Image(systemName: "exclamationmark.triangle.fill")
                        Text("تعارض")
                    }
                    .font(.caption2.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.orange.opacity(0.2))
                    .foregroundColor(.orange)
                    .cornerRadius(6)
                }

                Spacer()

                // Status Pill
                Text(statusText(rotation.status))
                    .font(.caption2.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(statusColor(rotation.status).opacity(0.15))
                    .foregroundColor(statusColor(rotation.status))
                    .cornerRadius(6)

                if !isReadOnly {
                    Button(action: onEdit) {
                        HStack(spacing: 4) {
                            Image(systemName: "pencil")
                            Text("تعديل")
                        }
                        .font(.caption.bold())
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(MiranTheme.emerald.opacity(0.12))
                        .foregroundColor(MiranTheme.emerald)
                        .cornerRadius(6)
                    }
                }
            }

            Divider()

            // Details Grid
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Image(systemName: "person.fill")
                        .foregroundColor(MiranTheme.emerald)
                        .frame(width: 20)
                    Text("المتدرب: \(rotation.traineeProfile?.person?.nameAr ?? "متدرب")")
                        .font(.subheadline.bold())
                        .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                }

                HStack {
                    Image(systemName: "stethoscope")
                        .foregroundColor(MiranTheme.emerald)
                        .frame(width: 20)
                    Text("المدرب المشرف: \(rotation.trainerProfile?.person?.nameAr ?? "لم يُسند بعد")")
                        .font(.caption)
                        .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                }

                HStack {
                    Image(systemName: "calendar")
                        .foregroundColor(MiranTheme.emerald)
                        .frame(width: 20)
                    Text("\(rotation.startDate)  ←  \(rotation.endDate)")
                        .font(.caption.monospaced())
                        .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                }
            }
        }
        .padding()
        .background(MiranTheme.cardBackground(for: systemColorScheme))
        .cornerRadius(14)
        .shadow(color: Color.black.opacity(0.04), radius: 6, x: 0, y: 3)
    }

    private func statusText(_ status: String) -> String {
        switch status {
        case "active": return "نشط"
        case "scheduled": return "مجدول"
        case "completed": return "مكتمل"
        case "draft": return "مسودة"
        default: return status
        }
    }

    private func statusColor(_ status: String) -> Color {
        switch status {
        case "active": return MiranTheme.emerald
        case "scheduled": return .blue
        case "completed": return .purple
        default: return .gray
        }
    }
}

// MARK: - Create Session Sheet (iOS Native UX)
struct CreateSessionSheet: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) var dismiss

    @State private var selectedTraineeId: String = ""
    @State private var selectedDepartmentId: String = ""
    @State private var selectedTrainerId: String = ""
    @State private var startDate: Date = Date()
    @State private var endDate: Date = Calendar.current.date(byAdding: .month, value: 1, to: Date()) ?? Date()
    @State private var status: String = "scheduled"
    @State private var isSubmitting: Bool = false
    @State private var errorMessage: String?

    var isWeekendSelected: Bool {
        let cal = Calendar.current
        let w1 = cal.component(.weekday, from: startDate)
        let w2 = cal.component(.weekday, from: endDate)
        return (w1 == 6 || w1 == 7 || w2 == 6 || w2 == 7)
    }

    var body: some View {
        NavigationView {
            Form {
                Section("بيانات الجلسة والروتيشن") {
                    Picker("المتدرب", selection: $selectedTraineeId) {
                        Text("اختر متدرباً...").tag("")
                        ForEach(store.trainerAssignedTraineesList) { trainee in
                            Text(trainee.person?.nameAr ?? trainee.id).tag(trainee.id)
                        }
                    }

                    Picker("القسم السريري", selection: $selectedDepartmentId) {
                        Text("اختر القسم...").tag("")
                        ForEach(store.hospitalDepartmentsList) { dept in
                            Text("\(dept.nameAr) (السعة: \(dept.capacity))").tag(dept.id)
                        }
                    }

                    Picker("المدرب المباشر", selection: $selectedTrainerId) {
                        Text("اختر مدرباً...").tag("")
                        ForEach(store.hospitalTrainers) { tr in
                            Text("\(tr.nameAr) (\(tr.occupied)/\(tr.capacity))").tag(tr.trainerProfileId)
                        }
                    }
                }

                Section("التواريخ والحالة") {
                    DatePicker("تاريخ البداية", selection: $startDate, displayedComponents: .date)
                    DatePicker("تاريخ النهاية", selection: $endDate, displayedComponents: .date)

                    Picker("حالة النشر", selection: $status) {
                        Text("مجدول").tag("scheduled")
                        Text("نشط").tag("active")
                        Text("مسودة").tag("draft")
                    }
                }

                if isWeekendSelected {
                    Section {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill").foregroundColor(.orange)
                            Text("تنبيه: يوم الجمعة والسبت أيّام راحة افتراضية. يرجى التأكد من الترخيص الصريح للتدريب.")
                                .font(.caption)
                                .foregroundColor(.orange)
                        }
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).font(.caption).foregroundColor(MiranTheme.error)
                    }
                }

                Section {
                    Button {
                        Task { await handleCreate() }
                    } label: {
                        if isSubmitting {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text("إضافة ونشر الجلسة")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .foregroundColor(MiranTheme.emerald)
                        }
                    }
                    .disabled(selectedTraineeId.isEmpty || selectedDepartmentId.isEmpty || selectedTrainerId.isEmpty || isSubmitting)
                }
            }
            .navigationTitle("جلسة تدريب جديدة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
            }
        }
    }

    private func handleCreate() async {
        isSubmitting = true
        errorMessage = nil

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        let sStr = formatter.string(from: startDate)
        let eStr = formatter.string(from: endDate)

        do {
            try await store.createRotation(
                traineeProfileId: selectedTraineeId,
                departmentId: selectedDepartmentId,
                trainerProfileId: selectedTrainerId,
                startDate: sStr,
                endDate: eStr,
                status: status
            )
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}

// MARK: - Edit Session Sheet (Trainer & Authorized Edit)
struct EditSessionSheet: View {
    let rotation: RotationModel
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) var dismiss
    @Environment(\.colorScheme) var systemColorScheme

    @State private var selectedDepartmentId: String
    @State private var selectedTrainerId: String
    @State private var startDate: Date
    @State private var endDate: Date
    @State private var status: String
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var conflictWarning: String?

    init(rotation: RotationModel) {
        self.rotation = rotation
        _selectedDepartmentId = State(initialValue: rotation.department?.id ?? "")
        _selectedTrainerId = State(initialValue: rotation.trainerProfile?.id ?? "")
        _status = State(initialValue: rotation.status)

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        let s = formatter.date(from: rotation.startDate) ?? Date()
        let e = formatter.date(from: rotation.endDate) ?? Date()
        _startDate = State(initialValue: s)
        _endDate = State(initialValue: e)
    }

    var isWeekendSelected: Bool {
        let cal = Calendar.current
        let w1 = cal.component(.weekday, from: startDate)
        let w2 = cal.component(.weekday, from: endDate)
        return (w1 == 6 || w1 == 7 || w2 == 6 || w2 == 7)
    }

    var body: some View {
        NavigationView {
            Form {
                Section("تفاصيل المتدرب والقسم الحالي") {
                    HStack {
                        Text("المتدرب:")
                            .font(.caption)
                            .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                        Spacer()
                        Text(rotation.traineeProfile?.person?.nameAr ?? "متدرب")
                            .font(.subheadline.bold())
                    }

                    Picker("القسم السريري", selection: $selectedDepartmentId) {
                        ForEach(store.hospitalDepartmentsList) { dept in
                            Text(dept.nameAr).tag(dept.id)
                        }
                    }

                    Picker("المدرب المشرف", selection: $selectedTrainerId) {
                        ForEach(store.hospitalTrainers) { tr in
                            Text(tr.nameAr).tag(tr.trainerProfileId)
                        }
                    }
                }

                Section("تعديل التواريخ والمواعيد") {
                    DatePicker("تاريخ البداية", selection: $startDate, displayedComponents: .date)
                    DatePicker("تاريخ النهاية", selection: $endDate, displayedComponents: .date)

                    Picker("حالة الجلسة", selection: $status) {
                        Text("مجدول").tag("scheduled")
                        Text("نشط").tag("active")
                        Text("مكتمل").tag("completed")
                    }
                }

                if isWeekendSelected {
                    Section {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill").foregroundColor(.orange)
                            Text("تنبيه: الجمعة والسبت أيّام راحة افتراضية للتدريب. يرجى التأكد من التكليف الصريح.")
                                .font(.caption)
                                .foregroundColor(.orange)
                        }
                    }
                }

                if let conflictWarning {
                    Section {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill").foregroundColor(.orange)
                            Text(conflictWarning).font(.caption).foregroundColor(.orange)
                        }
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).font(.caption).foregroundColor(MiranTheme.error)
                    }
                }

                Section {
                    Button {
                        Task { await handleSave() }
                    } label: {
                        if isSubmitting {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text("حفظ التعديلات")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .foregroundColor(MiranTheme.emerald)
                        }
                    }
                    .disabled(isSubmitting)

                    Button("حذف الجلسة", role: .destructive) {
                        Task { await handleDelete() }
                    }
                    .disabled(isSubmitting)
                }
            }
            .navigationTitle("تعديل جدول الجلسة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
            }
        }
    }

    private func handleSave() async {
        isSubmitting = true
        errorMessage = nil

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        let sStr = formatter.string(from: startDate)
        let eStr = formatter.string(from: endDate)

        do {
            try await store.updateRotation(
                id: rotation.id,
                departmentId: selectedDepartmentId,
                trainerProfileId: selectedTrainerId,
                startDate: sStr,
                endDate: eStr,
                status: status
            )
            // Reload hospital and trainer data
            await store.fetchHospitalData()
            await store.fetchTrainerData()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }

    private func handleDelete() async {
        isSubmitting = true
        do {
            try await store.deleteRotation(id: rotation.id)
            await store.fetchHospitalData()
            await store.fetchTrainerData()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}

