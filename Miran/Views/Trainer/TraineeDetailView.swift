//
//  TraineeDetailView.swift
//  مِران
//
//  تفاصيل المتدرب من جهة المدرب + نموذج التقييم.
//

import SwiftUI

struct TraineeDetailView: View {
    @EnvironmentObject var store: AppStore
    let traineeID: UUID
    @State private var showEvaluation = false

    private var trainee: Trainee? { store.trainee(traineeID) }
    private var rotation: Rotation? { store.currentRotation(for: traineeID) }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let t = trainee {
                    header(t)
                    diligence(t)
                    rotationCard()
                    evaluationsCard(t)
                    actions(t)
                }
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(trainee?.nameAr ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showEvaluation) {
            if let rot = rotation {
                EvaluationFormView(traineeID: traineeID, rotationID: rot.id)
            }
        }
    }

    private func header(_ t: Trainee) -> some View {
        HStack(spacing: 12) {
            TraineeAvatar(trainee: t, size: 58)
            VStack(alignment: .leading, spacing: 4) {
                Text(t.nameAr).font(.headline)
                Text("\(t.level.title) • \(t.specialty)").font(.caption).foregroundStyle(.secondary)
                MiranBadge(t.cardStatus.title, color: t.cardStatus.color, icon: "checkmark.shield")
            }
            Spacer()
        }
        .miranCard()
    }

    private func diligence(_ t: Trainee) -> some View {
        let d = store.diligence(for: t.id)
        return VStack(alignment: .leading, spacing: 12) {
            SectionTitle("مؤشر الحرص", systemImage: "bolt.heart.fill")
            HStack(spacing: 16) {
                ScoreDial(score: Double(d.value), label: d.label, color: d.color, size: 100)
                VStack(alignment: .leading, spacing: 8) {
                    InfoRow(label: "الاستجابة", value: Fmt.percent(d.responseRate))
                    InfoRow(label: "الحضور الفعلي", value: Fmt.percent(d.attendanceRate))
                    InfoRow(label: "متوسط الإقرار",
                            value: d.averageAckSeconds.map { Fmt.duration($0) } ?? "—")
                    InfoRow(label: "عدد النداءات", value: "\(d.totalCalls)")
                }
            }
        }
        .miranCard(tint: d.color)
    }

    @ViewBuilder
    private func rotationCard() -> some View {
        if let rot = rotation, let dept = store.department(rot.departmentID) {
            VStack(alignment: .leading, spacing: 10) {
                SectionTitle("الروتيشن الحالي", systemImage: "map.fill")
                InfoRow(label: "القسم", value: dept.name)
                InfoRow(label: "متبقٍ", value: "\(rot.daysRemaining) يوماً")
                MiranProgressBar(value: rot.progress)

                let done = rot.completedObjectives.count
                InfoRow(label: "الأهداف المكتملة", value: "\(done) من \(dept.objectives.count)")

                Divider()
                HStack {
                    Text("اجتماع منتصف الدورة").font(.subheadline)
                    Spacer()
                    if rot.midpointMeetingDone {
                        MiranBadge("تم", color: MiranTheme.green, icon: "checkmark")
                    } else {
                        Button("تسجيل الاجتماع") {
                            store.markMidpointMeetingDone(rot.id)
                        }
                        .font(.caption).buttonStyle(.bordered)
                    }
                }
                if !rot.midpointMeetingDone {
                    Text("لا يُفتح التقييم النهائي قبل تنفيذ اجتماع منتصف الدورة.")
                        .font(.caption2).foregroundStyle(.orange)
                }
            }
            .miranCard()
        }
    }

    private func evaluationsCard(_ t: Trainee) -> some View {
        let evals = store.traineeEvaluations(for: t.id)
        return VStack(alignment: .leading, spacing: 10) {
            SectionTitle("التقييمات", systemImage: "star.leadinghalf.filled")
            if evals.isEmpty {
                Text("لا توجد تقييمات بعد.").font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(evals) { e in
                    HStack {
                        Text(e.isMidpoint ? "منتصف الدورة" : "نهائي").font(.subheadline)
                        Spacer()
                        Text(String(format: "%.1f", e.average)).bold()
                            .foregroundStyle(e.average >= 3.5 ? MiranTheme.green : .orange)
                        if e.isSuspicious {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                        }
                    }
                }
            }
        }
        .miranCard()
    }

    private func actions(_ t: Trainee) -> some View {
        VStack(spacing: 10) {
            Button {
                showEvaluation = true
            } label: {
                Label("تقييم المتدرب", systemImage: "square.and.pencil")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)

            if let rot = rotation, !store.hasFeedback(rotationID: rot.id) {
                Text("القفل المتبادل: لن يُعتمد تقييمك النهائي حتى يُغلق المتدرب تقييمه للقسم.")
                    .font(.caption2).foregroundStyle(.orange)
                    .multilineTextAlignment(.center)
            }
        }
    }
}

// MARK: - نموذج التقييم

struct EvaluationFormView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let traineeID: UUID
    let rotationID: UUID

    @State private var scores: [String: Int] = [
        "المعرفة النظرية": 4,
        "المهارات السريرية": 4,
        "السلوك المهني": 4,
        "التواصل": 4,
        "الالتزام": 4
    ]
    @State private var comment = ""
    @State private var isMidpoint = false
    @State private var startedAt = Date()

    private let criteria = ["المعرفة النظرية", "المهارات السريرية", "السلوك المهني", "التواصل", "الالتزام"]

    /// تعليق إجباري لأي درجة منخفضة
    private var requiresComment: Bool {
        scores.values.contains { $0 <= 2 }
    }

    private var canSubmit: Bool {
        !(requiresComment && comment.trimmingCharacters(in: .whitespaces).isEmpty)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("تقييم منتصف الدورة", isOn: $isMidpoint)
                }

                Section("البنود") {
                    ForEach(criteria, id: \.self) { c in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(c).font(.subheadline)
                            HStack(spacing: 8) {
                                ForEach(1...5, id: \.self) { i in
                                    Button {
                                        scores[c] = i
                                    } label: {
                                        Image(systemName: i <= (scores[c] ?? 0) ? "star.fill" : "star")
                                            .foregroundStyle(i <= (scores[c] ?? 0) ? .yellow : .secondary)
                                    }
                                    .buttonStyle(.plain)
                                }
                                Spacer()
                                Text("\(scores[c] ?? 0)/5").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }

                Section {
                    TextField(requiresComment ? "التعليق إجباري لوجود درجة منخفضة" : "تعليق (اختياري)",
                              text: $comment, axis: .vertical)
                        .lineLimit(3...6)
                } header: {
                    Text("التعليق")
                } footer: {
                    if requiresComment {
                        Text("لا تُقبل درجة منخفضة بلا مبرر مكتوب.")
                            .foregroundStyle(.orange)
                    }
                }

                Section {
                    Button("اعتماد التقييم") { submit() }
                        .disabled(!canSubmit)
                        .frame(maxWidth: .infinity)
                        .bold()
                } footer: {
                    Text("يقيس النظام المدة التي استغرقتها في التقييم. الدرجة الكاملة للجميع في أقل من ٤٠ ثانية تُعلَّم كتقييم مشبوه ويُخفَّض وزنها.")
                }
            }
            .navigationTitle("تقييم المتدرب")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("إلغاء") { dismiss() }
                }
            }
        }
    }

    private func submit() {
        let items = criteria.map { EvaluationItem(title: $0, score: scores[$0] ?? 3) }
        let elapsed = Int(Date().timeIntervalSince(startedAt))
        store.submitEvaluation(Evaluation(
            rotationID: rotationID,
            traineeID: traineeID,
            evaluatorID: store.currentTrainerID ?? UUID(),
            isMidpoint: isMidpoint,
            items: items,
            comment: comment,
            submittedAt: Date(),
            secondsSpent: elapsed
        ))
        dismiss()
    }
}
