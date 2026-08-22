//
//  RiskView.swift
//  مِران
//
//  الإنذار المبكر للتعثّر وخطة التحسين المؤتمتة.
//

import SwiftUI

struct RiskView: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {

                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "info.circle.fill").foregroundStyle(MiranTheme.accent)
                        Text("يجمع النظام بين التقييمات المنخفضة ومؤشر الحرص والأهداف غير المكتملة، فيُصدر التنبيه في الشهر الثالث بدلاً من نهاية السنة.")
                            .font(.caption)
                        Spacer()
                    }
                    .miranCard(tint: MiranTheme.accent)

                    if store.riskFlags.isEmpty {
                        EmptyStateView(icon: "checkmark.shield.fill",
                                       title: "لا توجد إنذارات",
                                       message: "جميع المتدربين ضمن النطاق الطبيعي.")
                    } else {
                        ForEach(store.riskFlags) { flag in
                            RiskCard(flag: flag)
                        }
                    }

                    if !store.improvementPlans.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            SectionTitle("خطط التحسين المعتمدة", systemImage: "list.bullet.clipboard.fill")
                            ForEach(store.improvementPlans) { plan in
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(store.trainee(plan.traineeID)?.nameAr ?? "—")
                                        .font(.subheadline).bold()
                                    Text(plan.reason).font(.caption2).foregroundStyle(.secondary)
                                    ForEach(plan.goals, id: \.self) { g in
                                        Text("• \(g)").font(.caption)
                                    }
                                    HStack {
                                        Text("حتى \(Fmt.shortDate(plan.endDate))")
                                            .font(.caption2).foregroundStyle(.secondary)
                                        Spacer()
                                        MiranBadge(Fmt.percent(plan.progress), color: MiranTheme.accent)
                                    }
                                }
                                .padding(.vertical, 4)
                                Divider()
                            }
                        }
                        .miranCard()
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("الإنذار المبكر")
        }
    }
}

struct RiskCard: View {
    @EnvironmentObject var store: AppStore
    let flag: AppStore.RiskFlag
    @State private var showPlan = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let t = store.trainee(flag.traineeID) {
                HStack(spacing: 10) {
                    TraineeAvatar(trainee: t, size: 42)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(t.nameAr).font(.subheadline).bold()
                        Text("\(t.level.title) • \(t.specialty)")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer()
                    MiranBadge("\(flag.reasons.count) مؤشر", color: .orange, icon: "exclamationmark")
                }

                Divider()

                ForEach(flag.reasons, id: \.self) { r in
                    HStack(alignment: .top, spacing: 6) {
                        Image(systemName: "arrow.left.circle.fill")
                            .font(.caption2).foregroundStyle(.orange)
                        Text(r).font(.caption)
                        Spacer()
                    }
                }

                Button {
                    showPlan = true
                } label: {
                    Label("عرض خطة التحسين المقترحة", systemImage: "wand.and.stars")
                        .font(.caption).frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
        }
        .miranCard(tint: .orange)
        .sheet(isPresented: $showPlan) {
            ImprovementPlanSheet(flag: flag)
        }
    }
}

struct ImprovementPlanSheet: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let flag: AppStore.RiskFlag

    var body: some View {
        NavigationStack {
            let plan = store.suggestedPlan(for: flag)
            List {
                Section {
                    Text("اقترح النظام هذه الخطة تلقائياً بناءً على أسباب الإنذار. يمكنك اعتمادها كما هي أو تعديلها.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("المتدرب") {
                    Text(store.trainee(flag.traineeID)?.nameAr ?? "—").bold()
                }
                Section("سبب الإنذار") {
                    Text(plan.reason).font(.subheadline)
                }
                Section("الأهداف المقترحة") {
                    ForEach(plan.goals, id: \.self) { g in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "target").foregroundStyle(MiranTheme.accentLight)
                            Text(g).font(.subheadline)
                        }
                    }
                }
                Section("المدة") {
                    InfoRow(label: "من", value: Fmt.date(plan.startDate))
                    InfoRow(label: "إلى", value: Fmt.date(plan.endDate))
                }
                Section {
                    Button("اعتماد الخطة") {
                        store.adopt(plan)
                        dismiss()
                    }
                    .frame(maxWidth: .infinity)
                    .bold()
                }
            }
            .navigationTitle("خطة التحسين")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("إغلاق") { dismiss() }
                }
            }
        }
    }
}
