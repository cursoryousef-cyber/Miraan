//
//  DocumentsView.swift
//  مِران
//
//  وحدة الأوراق: المستندات وتواريخ الانتهاء والتنبيهات.
//

import SwiftUI

struct DocumentsView: View {
    @EnvironmentObject var store: AppStore
    let traineeID: UUID

    private var trainee: Trainee? { store.trainee(traineeID) }

    var body: some View {
        List {
            if let t = trainee {
                Section {
                    HStack {
                        Text("حالة الملف")
                        Spacer()
                        MiranBadge(t.applicationStatus.title, color: t.applicationStatus.color)
                    }
                }

                Section("المستندات الإلزامية") {
                    ForEach(t.documents.filter(\.isMandatory)) { doc in
                        documentRow(doc)
                    }
                }

                Section("مستندات حسب الفئة") {
                    ForEach(t.documents.filter { !$0.isMandatory }) { doc in
                        documentRow(doc)
                    }
                }

                Section {
                    Text("ينبّهك النظام قبل ٦٠ و٣٠ و٧ أيام من انتهاء أي مستند. وانتهاء مستند إلزامي يعلّق البطاقة تلقائياً حتى التجديد.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("أوراقي")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func documentRow(_ doc: TrainingDocument) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: doc.status.icon).foregroundStyle(doc.status.color)
                Text(doc.title).font(.subheadline)
                Spacer()
                MiranBadge(doc.status.title, color: doc.status.color)
            }

            if let expiry = doc.expiryDate {
                HStack {
                    Text("ينتهي: \(Fmt.date(expiry))")
                        .font(.caption2).foregroundStyle(.secondary)
                    Spacer()
                    if let days = doc.daysToExpiry, days <= 60 {
                        Text(days >= 0 ? "متبقٍ \(days) يوماً" : "منتهٍ")
                            .font(.caption2).bold()
                            .foregroundStyle(days > 30 ? .orange : .red)
                    }
                }
            }

            if let note = doc.reviewerNote {
                Text("ملاحظة المراجع: \(note)")
                    .font(.caption2).foregroundStyle(.orange)
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - سجل الحضور

struct AttendanceHistoryView: View {
    @EnvironmentObject var store: AppStore
    let traineeID: UUID

    var body: some View {
        List {
            Section {
                HStack {
                    Text("نسبة الحضور")
                    Spacer()
                    Text(Fmt.percent(store.attendanceRate(for: traineeID))).bold()
                }
            }
            Section("السجل") {
                ForEach(store.attendanceLog(for: traineeID)) { rec in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Fmt.date(rec.date)).font(.subheadline)
                            Text(rec.method).font(.caption2).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if let inTime = rec.checkIn {
                            VStack(alignment: .trailing, spacing: 2) {
                                Text(Fmt.time(inTime)).font(.caption).bold()
                                if rec.isLate {
                                    MiranBadge("متأخر", color: .orange)
                                }
                            }
                        } else {
                            MiranBadge("غياب", color: .red)
                        }
                    }
                }
            }
        }
        .navigationTitle("سجل الحضور")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - تقييماتي

struct MyEvaluationsView: View {
    @EnvironmentObject var store: AppStore
    let traineeID: UUID

    var body: some View {
        List {
            let evals = store.traineeEvaluations(for: traineeID)
            if evals.isEmpty {
                EmptyStateView(icon: "star", title: "لا توجد تقييمات",
                               message: "لم يُسجَّل لك تقييم بعد.")
            } else {
                ForEach(evals) { e in
                    evalSection(e)
                }
            }
        }
        .navigationTitle("تقييماتي")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func evalSection(_ e: Evaluation) -> some View {
        Section(e.isMidpoint ? "تقييم منتصف الدورة" : "التقييم النهائي") {
            HStack {
                Text("المتوسط")
                Spacer()
                Text(String(format: "%.1f من ٥", e.average)).bold()
                    .foregroundStyle(e.average >= 3.5 ? MiranTheme.green : .orange)
            }
            ForEach(e.items) { item in
                HStack {
                    Text(item.title).font(.subheadline)
                    Spacer()
                    HStack(spacing: 2) {
                        ForEach(1...5, id: \.self) { i in
                            Image(systemName: i <= item.score ? "star.fill" : "star")
                                .font(.caption2)
                                .foregroundStyle(i <= item.score ? Color.yellow : Color(.tertiaryLabel))
                        }
                    }
                }
            }
            if !e.comment.isEmpty {
                Text(e.comment).font(.caption).foregroundStyle(.secondary)
            }
            Text("المُقيِّم: \(store.trainer(e.evaluatorID)?.nameAr ?? "—") • \(Fmt.date(e.submittedAt))")
                .font(.caption2).foregroundStyle(.tertiary)
        }
    }
}

// MARK: - تقييم المتدرب للقسم (القفل المتبادل)

struct DepartmentFeedbackView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let traineeID: UUID

    @State private var supervision = 4
    @State private var opportunities = 4
    @State private var fairness = 4
    @State private var environment = 4
    @State private var comment = ""
    @State private var submitted = false

    private var rotation: Rotation? { store.currentRotation(for: traineeID) }

    var body: some View {
        Form {
            if let rot = rotation {
                Section {
                    Text("تقييمك للقسم مجهول الهوية تجاه القسم، ولا يطّلع عليه إلا الشؤون الأكاديمية. ولن يُعتمد تقييم مدربك لك حتى تُغلق هذا النموذج.")
                        .font(.caption).foregroundStyle(.secondary)
                }

                if store.hasFeedback(rotationID: rot.id) || submitted {
                    Section {
                        Label("تم إرسال تقييمك لهذا القسم", systemImage: "checkmark.seal.fill")
                            .foregroundStyle(MiranTheme.green)
                    }
                } else {
                    Section("قسم: \(store.department(rot.departmentID)?.name ?? "")") {
                        ratingRow("جودة الإشراف", $supervision)
                        ratingRow("توفر الفرص التعليمية", $opportunities)
                        ratingRow("عدالة توزيع العمل", $fairness)
                        ratingRow("بيئة العمل", $environment)
                    }
                    Section("ملاحظات") {
                        TextField("ملاحظاتك (اختياري)", text: $comment, axis: .vertical)
                            .lineLimit(3...6)
                    }
                    Section {
                        Button("إرسال التقييم") {
                            store.submitFeedback(DepartmentFeedback(
                                rotationID: rot.id,
                                departmentID: rot.departmentID,
                                supervisionQuality: supervision,
                                learningOpportunities: opportunities,
                                workloadFairness: fairness,
                                environment: environment,
                                comment: comment))
                            submitted = true
                        }
                        .frame(maxWidth: .infinity)
                        .bold()
                    }
                }
            } else {
                Text("لا يوجد روتيشن جارٍ.")
            }
        }
        .navigationTitle("تقييمي للقسم")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func ratingRow(_ title: String, _ value: Binding<Int>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline)
            HStack(spacing: 8) {
                ForEach(1...5, id: \.self) { i in
                    Button {
                        value.wrappedValue = i
                    } label: {
                        Image(systemName: i <= value.wrappedValue ? "star.fill" : "star")
                            .foregroundStyle(i <= value.wrappedValue ? .yellow : .secondary)
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
                Text("\(value.wrappedValue)/5").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - الملف المحمول

struct PortfolioView: View {
    @EnvironmentObject var store: AppStore
    let traineeID: UUID

    private var trainee: Trainee? { store.trainee(traineeID) }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let t = trainee {
                    VStack(spacing: 8) {
                        Image(systemName: "doc.richtext.fill")
                            .font(.system(size: 38)).foregroundStyle(MiranTheme.accent)
                        Text("الملف المحمول").font(.title3).bold()
                        Text("يُصدَر عند التخرج كملف PDF واحد موحّد معتمد بباركود تحقق.")
                            .font(.caption).foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.vertical, 8)

                    let d = store.diligence(for: t.id)

                    HStack(spacing: 10) {
                        StatTile(value: "\(store.traineeRotations(for: t.id).count)",
                                 label: "روتيشن", icon: "map.fill", color: MiranTheme.accent)
                        StatTile(value: "\(store.traineeEvaluations(for: t.id).count)",
                                 label: "تقييم", icon: "star.fill", color: .orange)
                    }
                    HStack(spacing: 10) {
                        StatTile(value: "\(d.totalCalls)",
                                 label: "نداء", icon: "bell.fill", color: .purple)
                        StatTile(value: "\(d.value)",
                                 label: "مؤشر الحرص", icon: "bolt.heart.fill", color: d.color)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        SectionTitle("محتويات الملف", systemImage: "list.bullet.rectangle")
                        ForEach([
                            "كل روتيشن ومدته واسم مدربه",
                            "جميع التقييمات ودرجاتها",
                            "سجل الحالات والإجراءات",
                            "ساعات التدريب والجلسات التعليمية",
                            "مؤشر الحرص ونتائج النداءات",
                            "الشهادات المكتسبة",
                            "شهادة إتمام معتمدة بباركود تحقق"
                        ], id: \.self) { item in
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.caption).foregroundStyle(MiranTheme.green)
                                Text(item).font(.subheadline)
                                Spacer()
                            }
                        }
                    }
                    .miranCard()

                    Button {
                        // في الإنتاج: توليد PDF وتصديره
                    } label: {
                        Label("تصدير الملف PDF", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)

                    Text("زر التصدير مُعطّل في النسخة التجريبية — يُفعَّل عند الربط بالخادم.")
                        .font(.caption2).foregroundStyle(.tertiary)
                }
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("الملف المحمول")
        .navigationBarTitleDisplayMode(.inline)
    }
}
