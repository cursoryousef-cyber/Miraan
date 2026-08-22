//
//  HospitalWorkQueueHomeView.swift
//  Miran
//
//  الشاشة الرئيسية للمستشفى ومشرف التدريب — "ما يحتاج إجراء" (Actionable Work Queue).
//  تعرض الإجراءات العاجلة حسب الأولوية: طلبات التدريب، مراجعة وتسكين المرشحين، المستندات، والتقييمات.
//

import SwiftUI

struct HospitalWorkQueueHomeView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var systemColorScheme

    @State private var selectedCandidate: TrainingRequestTraineeRow? = nil
    @State private var selectedActiveTrainee: TraineeProfileModel? = nil

    var user: UserProfileResponse? { authViewModel.currentUser }

    var body: some View {
        NavigationView {
            ZStack {
                MiranTheme.background(for: systemColorScheme)
                    .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        // ── 1. HEADER BANNER ──────────────────────────────────
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("ما يحتاج إجراء ⚡️")
                                        .font(.title2.bold())
                                        .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                                    Text(user?.activeOrganization.displayName ?? "مستشفى برج الشمال الطبي")
                                        .font(.caption.weight(.medium))
                                        .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                                }
                                Spacer()
                                Image(systemName: "tray.full.fill")
                                    .font(.system(size: 26))
                                    .foregroundColor(MiranTheme.emerald)
                            }
                        }
                        .padding(.horizontal)
                        .padding(.top, 10)

                        // ── 2. METRICS CARDS ──────────────────────────────────
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                            WorkQueueMetricTile(title: "المتدربون النشطون", count: "\(max(store.trainerAssignedTraineesList.count, store.hospitalRotationsList.count))", icon: "person.2.fill", color: MiranTheme.emerald)
                            WorkQueueMetricTile(title: "طلبات بانتظار المراجعة", count: "\(store.hospitalReviewTrainees.count)", icon: "person.crop.circle.badge.exclamationmark", color: .orange)
                            WorkQueueMetricTile(title: "طلبات تدريب جديدة", count: "\(store.trainingRequests.count)", icon: "doc.badge.plus", color: .blue)
                            WorkQueueMetricTile(title: "تقييمات التدريب", count: "\(store.evaluationsList.count)", icon: "signature", color: .purple)
                        }
                        .padding(.horizontal)

                        // ── 3. CANDIDATES REVIEW & ONBOARDING SECTION ─────────
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Text("مرشحون بانتظار المراجعة والتسكين")
                                    .font(.headline.weight(.bold))
                                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                                Spacer()
                                Text("\(store.hospitalReviewTrainees.count) مرشح")
                                    .font(.caption.bold())
                                    .foregroundColor(.orange)
                            }
                            .padding(.horizontal)

                            if store.hospitalReviewTrainees.isEmpty {
                                Text("لا يوجد مرشحون حالياً بانتظار المراجعة.")
                                    .font(.subheadline)
                                    .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                                    .padding(.horizontal)
                            } else {
                                VStack(spacing: 12) {
                                    ForEach(store.hospitalReviewTrainees) { candidate in
                                        CandidateReviewCard(candidate: candidate) {
                                            selectedCandidate = candidate
                                        }
                                    }
                                }
                                .padding(.horizontal)
                            }
                        }

                         // ── 4. ACTIVE HOSPITAL TRAINEES SECTION ────────────────
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Text("المتدربون الحاليون والنشطون بالمستشفى")
                                    .font(.headline.weight(.bold))
                                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                                Spacer()
                                Text("\(store.trainerAssignedTraineesList.count) متدرب")
                                    .font(.caption.bold())
                                    .foregroundColor(MiranTheme.emerald)
                            }
                            .padding(.horizontal)

                            if store.trainerAssignedTraineesList.isEmpty {
                                Text("لا يوجد متدربون نشطون حالياً بالمستشفى.")
                                    .font(.subheadline)
                                    .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                                    .padding(.horizontal)
                            } else {
                                VStack(spacing: 12) {
                                    ForEach(store.trainerAssignedTraineesList) { trainee in
                                        Button {
                                            selectedActiveTrainee = trainee
                                        } label: {
                                            ActiveTraineeCard(trainee: trainee)
                                        }
                                        .buttonStyle(PlainButtonStyle())
                                    }
                                }
                                .padding(.horizontal)
                            }
                        }
                    }
                    .padding(.bottom, 30)
                }
                .refreshable {
                    await store.fetchHospitalData()
                }
            }
            .navigationTitle("مركز إدارات المستشفى")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(item: $selectedCandidate) { candidate in
                CandidateReviewSheet(candidate: candidate)
                    .environmentObject(store)
            }
            .sheet(item: $selectedActiveTrainee) { trainee in
                ActiveTraineeSheetView(trainee: trainee)
                    .environmentObject(authViewModel)
                    .environmentObject(store)
            }
            .task {
                await store.fetchHospitalData()
            }
        }
    }
}

// MARK: - Candidate Review Card
struct CandidateReviewCard: View {
    let candidate: TrainingRequestTraineeRow
    let onTap: () -> Void
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(candidate.nameAr ?? "متدرب مرشح")
                            .font(.headline.bold())
                            .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                        Text("الرقم الأكاديمي: \(candidate.academicNumber ?? "غير محدد")")
                            .font(.caption)
                            .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                    }
                    Spacer()
                    Text(candidate.status == "cluster_approved" ? "معتمد من التجمع" : candidate.status)
                        .font(.caption2.bold())
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.blue.opacity(0.15))
                        .foregroundColor(.blue)
                        .cornerRadius(6)
                }

                Divider()

                HStack {
                    Label(candidate.university?.nameAr ?? "الجامعة الموفدة", systemImage: "building.columns.fill")
                        .font(.caption)
                        .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                    Spacer()
                    Label(candidate.specialty ?? "طب وجراحة", systemImage: "cross.case.fill")
                        .font(.caption.bold())
                        .foregroundColor(MiranTheme.emerald)
                }
            }
            .padding(14)
            .background(MiranTheme.cardBackground(for: systemColorScheme))
            .cornerRadius(12)
            .shadow(color: Color.black.opacity(0.04), radius: 4, x: 0, y: 2)
        }
    }
}

// MARK: - Candidate Review Sheet (Modal Sheet)
struct CandidateReviewSheet: View {
    let candidate: TrainingRequestTraineeRow
    @EnvironmentObject var store: AppStore
    @Environment(\.presentationMode) var presentationMode
    @Environment(\.colorScheme) var systemColorScheme

    @State private var selectedDepartmentId: String = ""
    @State private var selectedTrainerId: String = ""
    @State private var isSubmitting = false
    @State private var alertMessage: String? = nil

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 16) {
                    // Section 1: Personal Info
                    VStack(alignment: .leading, spacing: 8) {
                        Text("البيانات الشخصية والتعريفية")
                            .font(.headline.bold())
                        HStack { Text("الاسم"); Spacer(); Text(candidate.nameAr ?? "-").bold() }
                        HStack { Text("رقم الهوية"); Spacer(); Text(candidate.nationalId ?? "-").bold() }
                        HStack { Text("الرقم الأكاديمي"); Spacer(); Text(candidate.academicNumber ?? "-").bold() }
                        HStack { Text("الجوال"); Spacer(); Text(candidate.mobile ?? "-").bold() }
                        HStack { Text("البريد الإلكتروني"); Spacer(); Text(candidate.email ?? "-").bold() }
                    }
                    .padding()
                    .background(MiranTheme.cardBackground(for: systemColorScheme))
                    .cornerRadius(12)

                    // Section 2: Academic Info
                    VStack(alignment: .leading, spacing: 8) {
                        Text("البيانات الأكاديمية والبرنامج")
                            .font(.headline.bold())
                        HStack { Text("الجامعة الموفدة"); Spacer(); Text(candidate.university?.nameAr ?? "-").bold() }
                        HStack { Text("البرنامج التدريبي"); Spacer(); Text(candidate.internshipProgram ?? "برنامج الامتياز").bold() }
                        HStack { Text("التخصص"); Spacer(); Text(candidate.specialty ?? "طب وجراحة").bold() }
                        if let gpa = candidate.gpa {
                            HStack { Text("المعدل الأكاديمي"); Spacer(); Text(String(format: "%.2f", gpa)).bold() }
                        }
                    }
                    .padding()
                    .background(MiranTheme.cardBackground(for: systemColorScheme))
                    .cornerRadius(12)

                    // Section 3: Documents Review Checklist
                    VStack(alignment: .leading, spacing: 8) {
                        Text("متطلبات التدريب والوثائق")
                            .font(.headline.bold())
                        if let docs = candidate.documents, !docs.isEmpty {
                            ForEach(docs) { doc in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(doc.titleAr ?? "مستند تدريبي").font(.subheadline.bold())
                                        if let status = doc.status {
                                            Text("الحالة: \(status)").font(.caption).foregroundColor(.gray)
                                        }
                                    }
                                    Spacer()
                                    Image(systemName: doc.status == "approved" ? "checkmark.circle.fill" : "hourglass.circle.fill")
                                        .foregroundColor(doc.status == "approved" ? .green : .orange)
                                }
                            }
                        } else {
                            Text("تم التحقق من الوثائق الأساسية بواسطة التجمع الصحي ✓")
                                .font(.caption)
                                .foregroundColor(.green)
                        }
                    }
                    .padding()
                    .background(MiranTheme.cardBackground(for: systemColorScheme))
                    .cornerRadius(12)

                    // Section 4: Assignment & Scope
                    VStack(alignment: .leading, spacing: 12) {
                        Text("تسكين القسم والمدرب السريري")
                            .font(.headline.bold())

                        Picker("القسم التدريبي", selection: $selectedDepartmentId) {
                            Text("اختر القسم").tag("")
                            ForEach(store.hospitalDepartmentsList) { dept in
                                Text(dept.nameAr).tag(dept.id)
                            }
                        }
                        .pickerStyle(MenuPickerStyle())

                        Picker("المدرب السريري المسؤول", selection: $selectedTrainerId) {
                            Text("اختر المدرب").tag("")
                            ForEach(store.hospitalTrainers) { tr in
                                Text(tr.nameAr).tag(tr.trainerProfileId)
                            }
                        }
                        .pickerStyle(MenuPickerStyle())
                    }
                    .padding()
                    .background(MiranTheme.cardBackground(for: systemColorScheme))
                    .cornerRadius(12)

                    // Section 5: Action Button
                    Button(action: approveCandidate) {
                        HStack {
                            Spacer()
                            if isSubmitting {
                                ProgressView()
                            } else {
                                Text("اعتماد وترقية البروفايل وتسكين المتدرب")
                                    .bold()
                            }
                            Spacer()
                        }
                        .padding()
                        .background(Color.green.opacity(0.2))
                        .foregroundColor(.green)
                        .cornerRadius(12)
                    }
                    .disabled(isSubmitting)
                }
                .padding()
            }
            .navigationTitle("مراجعة ملف المرشح")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إغلاق") {
                        presentationMode.wrappedValue.dismiss()
                    }
                }
            }
            .alert(item: Binding<AlertItem?>(
                get: { alertMessage.map { AlertItem(message: $0) } },
                set: { _ in alertMessage = nil }
            )) { item in
                Alert(title: Text("تنويه"), message: Text(item.message), dismissButton: .default(Text("موافق")))
            }
        }
    }

    private func approveCandidate() {
        isSubmitting = true
        Task {
            do {
                try await store.approveCandidateRow(rowId: candidate.id)
                if !selectedDepartmentId.isEmpty && !selectedTrainerId.isEmpty {
                    try await store.createRotation(
                        traineeProfileId: candidate.traineeProfileId ?? candidate.id,
                        departmentId: selectedDepartmentId,
                        trainerProfileId: selectedTrainerId,
                        startDate: candidate.startDate ?? "2026-09-01",
                        endDate: candidate.endDate ?? "2026-09-30",
                        status: "active"
                    )
                }
                alertMessage = "تم اعتماد المتدرب وتسكينه في النظام بنجاح"
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                presentationMode.wrappedValue.dismiss()
            } catch {
                alertMessage = "خطأ أثناء الحفظ: \(error.localizedDescription)"
            }
            isSubmitting = false
        }
    }
}

private struct AlertItem: Identifiable {
    let id = UUID()
    let message: String
}

// MARK: - Work Queue Metric Tile
struct WorkQueueMetricTile: View {
    let title: String
    let count: String
    let icon: String
    let color: Color
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                ZStack {
                    Circle()
                        .fill(color.opacity(0.12))
                        .frame(width: 36, height: 36)
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(color)
                }
                Spacer()
                Text(count)
                    .font(.title2.bold())
                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
            }
            Text(title)
                .font(.caption.weight(.bold))
                .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                .lineLimit(1)
        }
        .padding(14)
        .background(MiranTheme.cardBackground(for: systemColorScheme))
        .cornerRadius(12)
        .shadow(color: Color.black.opacity(0.03), radius: 3, x: 0, y: 1)
    }
}

// MARK: - Work Queue Action Card
struct WorkQueueActionCard: View {
    let title: String
    let subtitle: String
    let badge: String
    let badgeColor: Color
    let icon: String
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(badgeColor.opacity(0.12))
                    .frame(width: 44, height: 44)
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(badgeColor)
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(badge)
                        .font(.caption2.weight(.bold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(badgeColor.opacity(0.12))
                        .foregroundColor(badgeColor)
                        .cornerRadius(6)
                    Spacer()
                }

                Text(title)
                    .font(.subheadline.bold())
                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                    .lineLimit(1)

                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                    .lineLimit(2)
            }

            Image(systemName: "chevron.left")
                .font(.caption.weight(.bold))
                .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
        }
        .padding(14)
        .background(MiranTheme.cardBackground(for: systemColorScheme))
        .cornerRadius(16)
        .shadow(color: Color.black.opacity(0.03), radius: 6, x: 0, y: 2)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(MiranTheme.border(for: systemColorScheme), lineWidth: 1)
        )
    }
}

// MARK: - Active Trainee Card
struct ActiveTraineeCard: View {
    let trainee: TraineeProfileModel
    @Environment(\.colorScheme) var systemColorScheme

    private var rotation: RotationModel? { trainee.activeRotation }

    private func fmtDate(_ iso: String?) -> String {
        guard let iso else { return "—" }
        let f = ISO8601DateFormatter()
        let d = f.date(from: iso) ?? ISO8601DateFormatter().date(from: String(iso.prefix(10)) + "T00:00:00Z")
        guard let d else { return String(iso.prefix(10)) }
        let out = DateFormatter()
        out.locale = Locale(identifier: "ar")
        out.dateFormat = "d MMM yyyy"
        return out.string(from: d)
    }

    private var statusLabel: (text: String, color: Color) {
        switch trainee.applicationStatus {
        case "active":   return ("نشط", MiranTheme.emerald)
        case "draft":    return ("مسودة", .orange)
        case "inactive": return ("غير نشط", .red)
        default:         return (trainee.applicationStatus, .gray)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // ── Header row
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(MiranTheme.emerald.opacity(0.12))
                        .frame(width: 42, height: 42)
                    Image(systemName: "person.text.rectangle.fill")
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundColor(MiranTheme.emerald)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(trainee.person?.nameAr ?? "متدرب طبي")
                        .font(.body.weight(.bold))
                        .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))

                    Text(trainee.traineeNumber)
                        .font(.caption)
                        .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                }

                Text(statusLabel.text)
                    .font(.caption2.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(statusLabel.color.opacity(0.12))
                    .foregroundColor(statusLabel.color)
                    .cornerRadius(6)

                Spacer()
            }

            Divider()
                .padding(.vertical, 10)

            // ── Details grid
            VStack(spacing: 6) {
                if let specialty = trainee.specialtyAr, !specialty.isEmpty {
                    ActiveTraineeRow(icon: "stethoscope", label: "التخصص", value: specialty)
                }
                if let dept = rotation?.department?.nameAr {
                    ActiveTraineeRow(icon: "building.2", label: "القسم الحالي", value: dept)
                }
                if let trainer = rotation?.trainerProfile?.person?.nameAr {
                    ActiveTraineeRow(icon: "person.fill.checkmark", label: "المدرب", value: trainer)
                }
                if let rot = rotation {
                    ActiveTraineeRow(icon: "calendar", label: "التدوير الحالي",
                                     value: "\(fmtDate(rot.startDate)) — \(fmtDate(rot.endDate))")
                    let statusText = rot.status == "active" ? "جارٍ" : rot.status == "completed" ? "مكتمل" : rot.status
                    ActiveTraineeRow(icon: "circle.fill", label: "حالة التدريب", value: statusText)
                }
                if let org = trainee.organization?.nameAr {
                    ActiveTraineeRow(icon: "mappin.and.ellipse", label: "المستشفى", value: org)
                }
            }
        }
        .padding(14)
        .background(MiranTheme.cardBackground(for: systemColorScheme))
        .cornerRadius(14)
        .shadow(color: Color.black.opacity(0.05), radius: 6, x: 0, y: 2)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(MiranTheme.emerald.opacity(0.15), lineWidth: 1)
        )
    }
}

// MARK: - Active Trainee Row
private struct ActiveTraineeRow: View {
    let icon: String
    let label: String
    let value: String
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 12))
                .foregroundColor(MiranTheme.emerald)
                .frame(width: 16)
            Text(label + ":")
                .font(.caption.weight(.medium))
                .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
            Text(value)
                .font(.caption)
                .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                .lineLimit(1)
            Spacer()
        }
    }
}

// MARK: - Active Trainee Operational Sheet View
struct ActiveTraineeSheetView: View {
    let trainee: TraineeProfileModel
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) var dismiss
    @Environment(\.colorScheme) var systemColorScheme

    @State private var showReassignSheet = false
    @State private var showEditRotationSheet = false
    @State private var successMessage: String? = nil

    private var user: UserProfileResponse? { authViewModel.currentUser }
    private var rotation: RotationModel? { trainee.activeRotation }

    private func fmtDate(_ iso: String?) -> String {
        guard let iso else { return "—" }
        let f = ISO8601DateFormatter()
        let d = f.date(from: iso) ?? ISO8601DateFormatter().date(from: String(iso.prefix(10)) + "T00:00:00Z")
        guard let d else { return String(iso.prefix(10)) }
        let out = DateFormatter()
        out.locale = Locale(identifier: "ar")
        out.dateFormat = "d MMM yyyy"
        return out.string(from: d)
    }

    private var statusLabel: (text: String, color: Color) {
        switch trainee.applicationStatus {
        case "active":   return ("نشط", MiranTheme.emerald)
        case "draft":    return ("مسودة", .orange)
        case "inactive": return ("غير نشط", .red)
        default:         return (trainee.applicationStatus, .gray)
        }
    }

    // ── Capabilities / Services Authorization check via ServiceResolver / UserCaps
    private var userCaps: Set<String> {
        guard let u = user else { return [] }
        return Set(u.capabilities + u.permissions + u.roles + [u.primaryRole])
    }

    private var canAccessIDCard: Bool {
        userCaps.contains("trainee.view_card") || userCaps.contains("trainee") || userCaps.contains("hospital_training_admin") || userCaps.contains("training_supervisor") || userCaps.contains("trainer")
    }

    private var canAccessRotations: Bool {
        userCaps.contains("rotation.view") || userCaps.contains("training.operate") || userCaps.contains("hospital_training_admin") || userCaps.contains("training_supervisor") || userCaps.contains("trainer") || userCaps.contains("trainee")
    }

    private var canAccessLogbook: Bool {
        userCaps.contains("logbook.approve") || userCaps.contains("logbook.view") || userCaps.contains("trainer") || userCaps.contains("hospital_training_admin") || userCaps.contains("training_supervisor")
    }

    private var canAccessSchedule: Bool {
        userCaps.contains("schedule.view") || userCaps.contains("training.operate") || userCaps.contains("hospital_training_admin") || userCaps.contains("training_supervisor") || userCaps.contains("trainer") || userCaps.contains("trainee")
    }

    private var canAccessTimeline: Bool {
        userCaps.contains("timeline.view") || userCaps.contains("hospital.view_cluster") || userCaps.contains("hospital_training_admin") || userCaps.contains("cluster_administrator")
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color(.systemGroupedBackground)
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 16) {
                        // ── 1. IDENTITY HEADER ─────────────────────────
                        VStack(spacing: 12) {
                            HStack(spacing: 14) {
                                ZStack {
                                    Circle()
                                        .fill(MiranTheme.emerald.opacity(0.12))
                                        .frame(width: 54, height: 54)
                                    Image(systemName: "person.text.rectangle.fill")
                                        .font(.system(size: 24, weight: .bold))
                                        .foregroundColor(MiranTheme.emerald)
                                }

                                VStack(alignment: .leading, spacing: 4) {
                                    HStack(spacing: 8) {
                                        Text(trainee.person?.nameAr ?? "متدرب طبي")
                                            .font(.headline.weight(.bold))
                                            .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))

                                        Text(statusLabel.text)
                                            .font(.caption2.bold())
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 3)
                                            .background(statusLabel.color.opacity(0.12))
                                            .foregroundColor(statusLabel.color)
                                            .cornerRadius(6)
                                    }

                                    Text("الرقم الأكاديمي: \(trainee.traineeNumber)")
                                        .font(.subheadline)
                                        .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                                }

                                Spacer()
                            }
                        }
                        .padding(16)
                        .background(MiranTheme.cardBackground(for: systemColorScheme))
                        .cornerRadius(14)

                        // ── 2. PLACEMENT & TRAINER DETAILS ──────────────
                        VStack(alignment: .leading, spacing: 12) {
                            Text("أين المتدرب الآن؟ ومن المسؤول عنه؟")
                                .font(.caption.bold())
                                .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                                .padding(.horizontal, 4)

                            VStack(spacing: 10) {
                                if let specialty = trainee.specialtyAr, !specialty.isEmpty {
                                    SheetDetailRow(icon: "stethoscope", label: "التخصص", value: specialty)
                                }
                                if let org = trainee.organization?.nameAr {
                                    SheetDetailRow(icon: "building.2.fill", label: "المستشفى", value: org)
                                }
                                if let dept = rotation?.department?.nameAr {
                                    SheetDetailRow(icon: "mappin.and.ellipse", label: "القسم الحالي", value: dept)
                                }
                                if let trainer = rotation?.trainerProfile?.person?.nameAr {
                                    SheetDetailRow(icon: "person.fill.checkmark", label: "المدرب المشرف", value: trainer)
                                }
                                if let rot = rotation {
                                    SheetDetailRow(icon: "calendar", label: "فترة التدوير",
                                                   value: "\(fmtDate(rot.startDate)) — \(fmtDate(rot.endDate))")
                                    let statusText = rot.status == "active" ? "جارٍ النشاط" : rot.status == "completed" ? "مكتمل" : rot.status
                                    SheetDetailRow(icon: "clock.fill", label: "حالة التدوير", value: statusText)
                                }
                            }
                            .padding(16)
                            .background(MiranTheme.cardBackground(for: systemColorScheme))
                            .cornerRadius(14)
                        }

                        // ── 3. AUTHORIZED SERVICES & NAVIGATION ───────────
                        VStack(alignment: .leading, spacing: 12) {
                            Text("ما الذي يمكن متابعته؟ (الخدمات المتاحة)")
                                .font(.caption.bold())
                                .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                                .padding(.horizontal, 4)

                            VStack(spacing: 8) {
                                // 1. Digital ID Card
                                if canAccessIDCard {
                                    NavigationLink {
                                        DigitalIDCardView(profile: trainee, rotation: rotation, qrToken: nil)
                                    } label: {
                                        SheetServiceRow(icon: "person.text.rectangle", title: "البطاقة الرقمية", subtitle: "عرض بطاقة المتدرب والرمز الضوئي", color: .emerald)
                                    }
                                }

                                // 2. Rotation Passport
                                if canAccessRotations {
                                    NavigationLink {
                                        RotationPassportView()
                                    } label: {
                                        SheetServiceRow(icon: "doc.text.fill", title: "جواز التدويرات", subtitle: "استعراض تفاصيل وتطلعات الروتيشن", color: .blue)
                                    }
                                }

                                // 3. Clinical Logbook Management
                                if canAccessLogbook {
                                    NavigationLink {
                                        ClinicalLogbookManagementFullView()
                                    } label: {
                                        SheetServiceRow(icon: "book.closed.fill", title: "السجل السريري (Logbook)", subtitle: "استعراض ومراجعة الحالات السريرية", color: .purple)
                                    }
                                }

                                // 4. Schedule View
                                if canAccessSchedule {
                                    NavigationLink {
                                        ScheduleView()
                                    } label: {
                                        SheetServiceRow(icon: "calendar.badge.clock", title: "جدول التدريب والشفتات", subtitle: "عرض جدول المناوبات الأسبوعي", color: .orange)
                                    }
                                }

                                // 5. Timeline (Org Cluster view)
                                if canAccessTimeline, let timeline = store.clusterTimeline {
                                    VStack(alignment: .leading, spacing: 6) {
                                        HStack {
                                            Image(systemName: "chart.line.uptrend.xyaxis")
                                                .foregroundColor(.teal)
                                            Text("الخط الزمني للتدريب (Cluster Timeline)")
                                                .font(.subheadline.bold())
                                                .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                                            Spacer()
                                        }
                                        Text("إجمالي التدريب بالخط الزمني: \(timeline.traineeCount) متدرب • منجز: \(Int(timeline.averageCompletion))%")
                                            .font(.caption)
                                            .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                                    }
                                    .padding(14)
                                    .background(MiranTheme.cardBackground(for: systemColorScheme))
                                    .cornerRadius(12)
                                }
                            }
                        }

                        // ── 4. OPERATIONAL ACTIONS (إجراءات المتدرب) ────────
                        if canAccessRotations {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("إجراءات المتدرب")
                                    .font(.caption.bold())
                                    .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                                    .padding(.horizontal, 4)

                                VStack(spacing: 8) {
                                    // Action 1: Reassign Trainer
                                    Button {
                                        showReassignSheet = true
                                    } label: {
                                        SheetActionRow(icon: "person.2.gobackward", title: "تغيير المدرب المشرف", subtitle: "إعادة إسناد المتدرب لمدرب آخر بالسعة المتاحة", color: MiranTheme.emerald)
                                    }

                                    // Action 2: Edit Rotation
                                    if rotation != nil {
                                        Button {
                                            showEditRotationSheet = true
                                        } label: {
                                            SheetActionRow(icon: "pencil.circle.fill", title: "تعديل التدوير والقسم", subtitle: "تحديث القسم والتواريخ أو حالة التدوير", color: .blue)
                                        }
                                    }
                                }
                            }
                        }

                        if let successMessage {
                            Text(successMessage)
                                .font(.caption.bold())
                                .foregroundColor(MiranTheme.emerald)
                                .padding(10)
                                .frame(maxWidth: .infinity)
                                .background(MiranTheme.emerald.opacity(0.1))
                                .cornerRadius(8)
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle("الملف التشغيلي للمتدرب")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showReassignSheet) {
                TraineeReassignmentSheet()
                    .environmentObject(store)
            }
            .sheet(isPresented: $showEditRotationSheet) {
                if let rot = rotation {
                    EditRotationSheetView(rotation: rot)
                        .environmentObject(store)
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إغلاق") {
                        dismiss()
                    }
                    .font(.body.bold())
                }
            }
        }
    }
}

// MARK: - Detail Row Helper
private struct SheetDetailRow: View {
    let icon: String
    let label: String
    let value: String
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundColor(MiranTheme.emerald)
                .frame(width: 20)

            Text(label + ":")
                .font(.subheadline.weight(.medium))
                .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))

            Text(value)
                .font(.subheadline.bold())
                .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))

            Spacer()
        }
    }
}

// MARK: - Service Navigation Row Helper
private struct SheetServiceRow: View {
    enum RowColor {
        case emerald, blue, purple, orange
        var color: Color {
            switch self {
            case .emerald: return MiranTheme.emerald
            case .blue: return .blue
            case .purple: return .purple
            case .orange: return .orange
            }
        }
    }

    let icon: String
    let title: String
    let subtitle: String
    let color: RowColor
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(color.color.opacity(0.12))
                    .frame(width: 40, height: 40)
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(color.color)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body.weight(.bold))
                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
            }

            Spacer()

            Image(systemName: "chevron.left")
                .font(.caption.bold())
                .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
        }
        .padding(12)
        .background(MiranTheme.cardBackground(for: systemColorScheme))
        .cornerRadius(12)
    }
}

// MARK: - Sheet Action Row Helper
private struct SheetActionRow: View {
    let icon: String
    let title: String
    let subtitle: String
    let color: Color
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(color.opacity(0.12))
                    .frame(width: 40, height: 40)
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(color)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body.weight(.bold))
                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
            }

            Spacer()

            Image(systemName: "pencil")
                .font(.caption.bold())
                .foregroundColor(color)
        }
        .padding(12)
        .background(MiranTheme.cardBackground(for: systemColorScheme))
        .cornerRadius(12)
    }
}

// MARK: - Edit Rotation Sheet View
struct EditRotationSheetView: View {
    let rotation: RotationModel
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) var dismiss
    @Environment(\.colorScheme) var systemColorScheme

    @State private var selectedDepartmentId: String = ""
    @State private var selectedTrainerId: String = ""
    @State private var startDate: Date = Date()
    @State private var endDate: Date = Date().addingTimeInterval(30 * 86400)
    @State private var selectedStatus: String = "active"

    @State private var isSubmitting = false
    @State private var errorMessage: String? = nil

    private var dateFmt: DateFormatter {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }

    var body: some View {
        NavigationView {
            Form {
                Section("بيانات التدوير الحالية والجديدة") {
                    Picker("القسم", selection: $selectedDepartmentId) {
                        Text("اختر القسم...").tag("")
                        ForEach(store.hospitalRotationsList.compactMap { $0.department }, id: \.id) { dept in
                            Text(dept.nameAr).tag(dept.id)
                        }
                    }

                    Picker("المدرب المشرف", selection: $selectedTrainerId) {
                        Text("احتفاظ بالمدرب الحالي...").tag("")
                        ForEach(store.hospitalTrainers) { tr in
                            Text("\(tr.nameAr) (المتاح: \(tr.available))").tag(tr.trainerProfileId)
                        }
                    }

                    DatePicker("تاريخ البداية", selection: $startDate, displayedComponents: .date)
                    DatePicker("تاريخ النهاية", selection: $endDate, displayedComponents: .date)

                    Picker("حالة التدريب", selection: $selectedStatus) {
                        Text("نشط (Active)").tag("active")
                        Text("مجدول (Scheduled)").tag("scheduled")
                        Text("مكتمل (Completed)").tag("completed")
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(.caption.bold())
                            .foregroundColor(MiranTheme.error)
                    }
                }

                Section {
                    Button {
                        Task { await handleSave() }
                    } label: {
                        if isSubmitting {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text("تحديث التدوير")
                                .font(.headline.bold())
                                .frame(maxWidth: .infinity)
                                .foregroundColor(MiranTheme.emerald)
                        }
                    }
                    .disabled(isSubmitting)
                }
            }
            .navigationTitle("تعديل التدوير")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
            }
            .onAppear {
                selectedDepartmentId = rotation.departmentId
                selectedTrainerId = rotation.trainerProfileId
                selectedStatus = rotation.status
                let isoFmt = ISO8601DateFormatter()
                if let d1 = isoFmt.date(from: rotation.startDate) { startDate = d1 }
                if let d2 = isoFmt.date(from: rotation.endDate) { endDate = d2 }
            }
        }
    }

    private func handleSave() async {
        // Validate date bounds
        if endDate < startDate {
            errorMessage = "تاريخ النهاية يجب أن يكون بعد تاريخ البداية"
            return
        }

        isSubmitting = true
        errorMessage = nil

        let startStr = dateFmt.string(from: startDate) + "T00:00:00.000Z"
        let endStr = dateFmt.string(from: endDate) + "T00:00:00.000Z"

        do {
            try await store.updateRotation(
                id: rotation.id,
                departmentId: selectedDepartmentId.isEmpty ? nil : selectedDepartmentId,
                trainerProfileId: selectedTrainerId.isEmpty ? nil : selectedTrainerId,
                startDate: startStr,
                endDate: endStr,
                status: selectedStatus
            )
            await store.fetchHospitalData()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}
