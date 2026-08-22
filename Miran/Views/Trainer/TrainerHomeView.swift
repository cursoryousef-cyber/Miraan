//
//  TrainerHomeView.swift
//  مِران
//
//  لوحة المدرب: متدربوه، إسنادهم، ومؤشراتهم.
//

import SwiftUI

struct TrainerHomeView: View {
    @EnvironmentObject var store: AppStore

    private var trainer: Trainer? { store.currentTrainer }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    if let tr = trainer {
                        header(tr)
                        loadWarning
                        traineeList(tr)
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("متدربوني")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("خروج") { store.role = nil }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        Picker("المدرب", selection: trainerBinding) {
                            ForEach(store.trainers) { t in
                                Text(t.nameAr).tag(t.id)
                            }
                        }
                    } label: {
                        Image(systemName: "person.crop.circle.badge.checkmark")
                    }
                }
            }
        }
    }

    private func header(_ tr: Trainer) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(tr.nameAr).font(.headline)
            Text("\(tr.title) • \(store.department(tr.departmentID)?.name ?? "")")
                .font(.caption).foregroundStyle(.secondary)
            Divider()
            HStack(spacing: 10) {
                StatTile(value: "\(store.traineesOf(trainer: tr.id).count)",
                         label: "متدرب مسند", icon: "person.2.fill", color: MiranTheme.accent)
                StatTile(value: "\(store.trainerCalls(by: tr.id).count)",
                         label: "نداء أُطلق", icon: "bell.fill", color: .purple)
            }
        }
        .miranCard(tint: MiranTheme.accent)
    }

    @ViewBuilder
    private var loadWarning: some View {
        if store.isLoadImbalanced {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                Text("اختلال في توزيع المتدربين بين المدربين — الفارق ٣ متدربين أو أكثر.")
                    .font(.caption)
                Spacer()
            }
            .miranCard(tint: .orange)
        }
    }

    private func traineeList(_ tr: Trainer) -> some View {
        VStack(spacing: 10) {
            ForEach(store.traineesOf(trainer: tr.id)) { t in
                NavigationLink {
                    TraineeDetailView(traineeID: t.id)
                } label: {
                    HStack(spacing: 12) {
                        TraineeAvatar(trainee: t, size: 46)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(t.nameAr).font(.subheadline).bold()
                            Text("\(t.level.title) • \(t.specialty)")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        Spacer()
                        let d = store.diligence(for: t.id)
                        VStack(spacing: 2) {
                            Text("\(d.value)").font(.headline).foregroundStyle(d.color)
                            Text("الحرص").font(.system(size: 8)).foregroundStyle(.secondary)
                        }
                        Image(systemName: "chevron.left").foregroundStyle(.tertiary)
                    }
                    .miranCard()
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var trainerBinding: Binding<UUID> {
        Binding(
            get: { store.currentTrainerID ?? store.trainers.first!.id },
            set: { store.currentTrainerID = $0 }
        )
    }
}
