//
//  ReportsView.swift
//  مِران
//
//  التقارير: مؤشر الحرص، تصنيف الأقسام، كاشف التقييم الآلي.
//

import SwiftUI

struct ReportsView: View {
    @EnvironmentObject var store: AppStore

    private var approved: [Trainee] {
        store.trainees.filter { $0.applicationStatus == .approved }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    overview
                    diligenceRanking
                    departmentRanking
                    evaluatorAudit
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("التقارير")
        }
    }

    // MARK: نظرة عامة

    private var overview: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                StatTile(value: "\(approved.count)", label: "متدرب نشط",
                         icon: "person.2.fill", color: MiranTheme.accent)
                StatTile(value: "\(store.calls.count)", label: "نداء",
                         icon: "bell.fill", color: .purple)
            }
            HStack(spacing: 10) {
                let avgDiligence = approved.isEmpty ? 0 :
                    approved.map { store.diligence(for: $0.id).value }.reduce(0, +) / max(1, approved.count)
                StatTile(value: "\(avgDiligence)", label: "متوسط الحرص",
                         icon: "bolt.heart.fill", color: MiranTheme.green)
                StatTile(value: "\(store.riskFlags.count)", label: "إنذار مبكر",
                         icon: "exclamationmark.triangle.fill", color: .orange)
            }
        }
    }

    // MARK: ترتيب المتدربين بمؤشر الحرص

    private var diligenceRanking: some View {
        let ranked = approved
            .map { ($0, store.diligence(for: $0.id)) }
            .sorted { $0.1.value > $1.1.value }

        return VStack(alignment: .leading, spacing: 10) {
            SectionTitle("مؤشر الحرص لكل متدرب", systemImage: "chart.bar.fill")
            ForEach(Array(ranked.enumerated()), id: \.offset) { idx, pair in
                let (t, d) = pair
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        Text("\(idx + 1)").font(.caption).bold()
                            .frame(width: 20)
                            .foregroundStyle(.secondary)
                        TraineeAvatar(trainee: t, size: 30)
                        Text(t.nameAr).font(.subheadline)
                        Spacer()
                        Text("\(d.value)").font(.subheadline).bold().foregroundStyle(d.color)
                    }
                    MiranProgressBar(value: Double(d.value) / 100, color: d.color)
                }
                .padding(.vertical, 3)
            }
            Text("المؤشر يجمع: نسبة الاستجابة، ومتوسط زمن الإقرار، ومتوسط زمن الوصول المؤكَّد، ونسبة الحضور الفعلي.")
                .font(.caption2).foregroundStyle(.tertiary)
        }
        .miranCard()
    }

    // MARK: تصنيف الأقسام

    private var departmentRanking: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("تصنيف الأقسام التدريبية", systemImage: "building.2.fill")
            ForEach(store.departments) { dept in
                HStack {
                    Text(dept.name).font(.subheadline)
                    Spacer()
                    if let rating = store.departmentRating(dept.id) {
                        HStack(spacing: 2) {
                            ForEach(1...5, id: \.self) { i in
                                Image(systemName: Double(i) <= rating.rounded() ? "star.fill" : "star")
                                    .font(.caption2)
                                    .foregroundStyle(.yellow)
                            }
                            Text(String(format: "%.1f", rating)).font(.caption).bold()
                        }
                    } else {
                        Text("لا توجد تقييمات").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 2)
            }
            Text("مصدر التصنيف: تقييم المتدربين للأقسام، مجهول الهوية تجاه القسم.")
                .font(.caption2).foregroundStyle(.tertiary)
        }
        .miranCard()
    }

    // MARK: كاشف التقييم الآلي

    private var evaluatorAudit: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("كاشف التقييم الآلي", systemImage: "eye.trianglebadge.exclamationmark.fill")
            ForEach(store.trainers) { tr in
                let count = store.suspiciousEvaluationCount(evaluatorID: tr.id)
                HStack {
                    Text(tr.nameAr).font(.subheadline)
                    Spacer()
                    if count > 0 {
                        MiranBadge("\(count) تقييم مشبوه", color: .orange, icon: "exclamationmark")
                    } else {
                        MiranBadge("سليم", color: MiranTheme.green, icon: "checkmark")
                    }
                }
            }
            Text("يرصد النظام الدرجة الكاملة للجميع في أقل من ٤٠ ثانية، فيُخفَّض وزن تقييمات المُقيِّم ويُنبَّه المسؤول.")
                .font(.caption2).foregroundStyle(.tertiary)
        }
        .miranCard(tint: .orange)
    }
}
