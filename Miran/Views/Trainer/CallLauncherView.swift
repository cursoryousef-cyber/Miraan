//
//  CallLauncherView.swift
//  مِران
//
//  إطلاق النداء: اختيار النوع والموقع والفئة المستهدفة.
//

import SwiftUI

struct CallLauncherView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    var onLaunched: (UUID) -> Void

    @State private var type: CallType = .interesting
    @State private var customTitle = ""
    @State private var note = ""
    @State private var location = "باطنية رجال — غرفة ١٢"
    @State private var minutes = 20
    @State private var selected: Set<UUID> = []

    private var trainer: Trainer? { store.currentTrainer }

    private var candidates: [Trainee] {
        guard let tr = trainer else { return [] }
        return store.traineesOf(trainer: tr.id)
    }

    var body: some View {
        NavigationStack {
            Form {
                typeSection
                if type == .custom { customTitleSection }
                detailsSection
                targetSection
                launchSection
            }
            .navigationTitle("إطلاق نداء")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("إلغاء") { dismiss() }
                }
            }
        }
    }

    @ViewBuilder
    private var typeSection: some View {
        Section("نوع النداء") {
            ForEach(CallType.allCases) { t in
                Button {
                    type = t
                    minutes = t.defaultMinutes
                } label: {
                    callTypeRow(t)
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func callTypeRow(_ t: CallType) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: t.icon)
                .foregroundStyle(.white)
                .frame(width: 34, height: 34)
                .background(t.color, in: Circle())

            VStack(alignment: .leading, spacing: 3) {
                Text(t.title).font(.subheadline).bold()
                    .foregroundStyle(.primary)
                Text(t.usage).font(.caption2).foregroundStyle(.secondary)
                HStack(spacing: 6) {
                    MiranBadge("إلحاح: \(t.urgencyLabel)", color: t.color)
                    MiranBadge(t.measurementLabel,
                               color: t.requiresDualConfirmation ? MiranTheme.green : .gray)
                }
            }
            Spacer()
            if type == t {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(MiranTheme.accent)
            }
        }
        .padding(.vertical, 3)
    }

    @ViewBuilder
    private var customTitleSection: some View {
        Section("عنوان النداء المخصص") {
            TextField("مثال: مراجعة أشعة صدر", text: $customTitle)
        }
    }

    @ViewBuilder
    private var detailsSection: some View {
        Section("التفاصيل") {
            TextField("الموقع (القسم والغرفة)", text: $location)
            TextField("ملاحظة قصيرة (اختياري)", text: $note, axis: .vertical)
                .lineLimit(2...4)
            Stepper("المدة المتوقعة: \(minutes) دقيقة", value: $minutes, in: 5...180, step: 5)
        }
    }

    @ViewBuilder
    private var targetSection: some View {
        Section {
            ForEach(candidates) { t in
                let check = store.canNotify(t.id)
                Button {
                    guard check.allowed else { return }
                    if selected.contains(t.id) { selected.remove(t.id) } else { selected.insert(t.id) }
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: selected.contains(t.id) ? "checkmark.square.fill" : "square")
                            .foregroundStyle(check.allowed ? MiranTheme.accent : .secondary)
                        TraineeAvatar(trainee: t, size: 32)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(t.nameAr).font(.subheadline)
                                .foregroundStyle(check.allowed ? .primary : .secondary)
                            if let reason = check.reason {
                                Text(reason).font(.caption2).foregroundStyle(.orange)
                            }
                        }
                        Spacer()
                        if !check.allowed {
                            Image(systemName: "bell.slash.fill").foregroundStyle(.orange)
                        }
                    }
                }
                .buttonStyle(.plain)
                .disabled(!check.allowed)
            }

            HStack {
                Button("تحديد الكل") {
                    selected = Set(candidates.filter { store.canNotify($0.id).allowed }.map(\.id))
                }
                Spacer()
                Button("إلغاء التحديد") { selected.removeAll() }
            }
            .font(.caption)
        } header: {
            Text("الفئة المستهدفة")
        } footer: {
            Text("النظام يقرأ الجدول قبل الإطلاق: لا يصل النداء لمتدرب في إجازة أو تجاوز السقف الأسبوعي (\(store.weeklyCallCap) نداءات).")
        }
    }

    @ViewBuilder
    private var launchSection: some View {
        Section {
            Button {
                launch()
            } label: {
                Text("إطلاق النداء الآن")
                    .bold()
                    .frame(maxWidth: .infinity)
            }
            .disabled(selected.isEmpty)
        }
    }

    private func launch() {
        guard let tr = trainer else { return }
        let call = store.launchCall(
            type: type,
            customTitle: customTitle,
            note: note,
            location: location,
            expectedMinutes: minutes,
            trainerID: tr.id,
            departmentID: tr.departmentID,
            targets: Array(selected)
        )
        onLaunched(call.id)
        dismiss()
    }
}
