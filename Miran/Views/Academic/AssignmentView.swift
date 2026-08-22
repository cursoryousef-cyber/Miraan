//
//  AssignmentView.swift
//  مِران
//
//  الإسناد: ربط كل متدرب بمدرب أساس، مع كشف اختلال التوزيع.
//

import SwiftUI

struct AssignmentView: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        NavigationStack {
            List {
                if store.isLoadImbalanced {
                    Section {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                            Text("اختلال في التوزيع: الفارق بين أكثر مدرب وأقلّه ٣ متدربين أو أكثر.")
                                .font(.caption)
                        }
                    }
                }

                Section("توزيع المدربين") {
                    ForEach(store.trainers) { tr in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(tr.nameAr).font(.subheadline).bold()
                                Text("\(tr.title) • \(store.department(tr.departmentID)?.name ?? "")")
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer()
                            MiranBadge("\(store.load(of: tr.id)) متدرب",
                                       color: store.load(of: tr.id) > 5 ? .orange : MiranTheme.accent)
                        }
                    }
                }

                Section {
                    ForEach(store.trainees.filter { $0.applicationStatus == .approved }) { t in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 10) {
                                TraineeAvatar(trainee: t, size: 34)
                                Text(t.nameAr).font(.subheadline)
                                Spacer()
                            }
                            Picker("المدرب الأساس", selection: trainerBinding(for: t)) {
                                ForEach(store.trainers) { tr in
                                    Text(tr.nameAr).tag(tr.id)
                                }
                            }
                            .pickerStyle(.menu)
                        }
                        .padding(.vertical, 2)
                    }
                } header: {
                    Text("إسناد المتدربين")
                } footer: {
                    Text("الإسناد إجباري: لا يدخل متدرب قسماً بلا مدرب أساس مسجّل باسمه.")
                }

                Section("إعدادات النداء") {
                    Stepper("السقف الأسبوعي للنداءات: \(store.weeklyCallCap)",
                            value: $store.weeklyCallCap, in: 1...15)
                    Text("ضابط منع الإرهاق — لا يتلقى المتدرب أكثر من هذا العدد أسبوعياً.")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("الإسناد")
        }
    }

    private func trainerBinding(for trainee: Trainee) -> Binding<UUID> {
        Binding(
            get: { trainee.trainerID ?? store.trainers.first!.id },
            set: { store.assign(trainee: trainee.id, to: $0) }
        )
    }
}
