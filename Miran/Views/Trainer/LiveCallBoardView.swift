//
//  LiveCallBoardView.swift
//  مِران
//
//  اللوحة الحية للمدرب: من أقرّ، من في الطريق، من أعلن وصوله، ومن لم يستجب.
//  ضغطة واحدة على الاسم = تأكيد الحضور فعلياً (مبدأ التأكيد المزدوج).
//

import SwiftUI

struct LiveCallBoardView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let callID: UUID

    private var call: TrainerCall? { store.calls.first { $0.id == callID } }

    var body: some View {
        NavigationStack {
            ScrollView {
                if let call {
                    VStack(spacing: 14) {
                        header(call)
                        stats(call)
                        participantsSection(call)
                        if call.isActive { endButton(call) } else { summary(call) }
                    }
                    .padding()
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("لوحة النداء")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("إغلاق") { dismiss() }
                }
            }
        }
    }

    // MARK: الرأس

    private func header(_ call: TrainerCall) -> some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                Image(systemName: call.type.icon)
                    .font(.title2).foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(call.type.color, in: Circle())

                VStack(alignment: .leading, spacing: 3) {
                    Text(call.displayTitle).font(.headline)
                    Text(call.location).font(.caption).foregroundStyle(.secondary)
                    if call.type.requiresDualConfirmation {
                        MiranBadge("تأكيد من الطرفين", color: MiranTheme.green, icon: "checkmark.seal")
                    }
                }
                Spacer()
            }

            if call.isActive {
                HStack {
                    Circle().fill(MiranTheme.green).frame(width: 8, height: 8)
                    Text("جارٍ الآن").font(.caption).foregroundStyle(MiranTheme.green)
                    Spacer()
                    LiveTimerText(since: call.launchedAt, now: store.now)
                        .font(.title3).bold()
                }
            } else if let ended = call.endedAt {
                HStack {
                    Text("انتهى \(Fmt.time(ended))").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                }
            }
        }
        .miranCard(tint: call.type.color)
    }

    // MARK: الإحصاءات

    private func stats(_ call: TrainerCall) -> some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                StatTile(value: "\(call.acknowledgedCount)/\(call.participants.count)",
                         label: "أقرّوا", icon: "hand.raised.fill", color: .orange)
                StatTile(value: "\(call.arrivedCount)/\(call.participants.count)",
                         label: "وصلوا", icon: "mappin.circle.fill", color: .blue)
            }
            HStack(spacing: 10) {
                StatTile(value: call.averageAckSeconds.map { Fmt.duration($0) } ?? "—",
                         label: "متوسط الإقرار", icon: "timer", color: MiranTheme.accent)
                StatTile(value: call.averageArrivalSeconds.map { Fmt.duration($0) } ?? "—",
                         label: "متوسط الوصول", icon: "figure.walk", color: MiranTheme.green)
            }
        }
    }

    // MARK: قائمة المشاركين

    private func participantsSection(_ call: TrainerCall) -> some View {
        VStack(alignment: .leading, spacing: 14) {

            group(call, title: "أعلنوا الوصول — بانتظار تأكيدك",
                  icon: "mappin.circle.fill",
                  states: [.selfArrived], showConfirm: true)

            group(call, title: "في الطريق",
                  icon: "figure.walk",
                  states: [.acknowledged], showConfirm: true)

            group(call, title: "حضور مؤكَّد",
                  icon: "checkmark.seal.fill",
                  states: [.confirmed], showConfirm: false)

            group(call, title: "لم يستجيبوا",
                  icon: "circle",
                  states: [.notified], showConfirm: true)

            group(call, title: "اعتذروا",
                  icon: "xmark.circle",
                  states: [.declined], showConfirm: false)
        }
    }

    @ViewBuilder
    private func group(_ call: TrainerCall,
                       title: String,
                       icon: String,
                       states: [ParticipantState],
                       showConfirm: Bool) -> some View {
        let items = call.participants.filter { states.contains($0.state) }
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionTitle("\(title) (\(items.count))", systemImage: icon)
                ForEach(items) { p in
                    participantRow(call: call, participant: p, showConfirm: showConfirm)
                }
            }
            .miranCard(tint: items.first?.state.color ?? .clear)
        }
    }

    private func participantRow(call: TrainerCall,
                                participant p: CallParticipant,
                                showConfirm: Bool) -> some View {
        HStack(spacing: 10) {
            if let t = store.trainee(p.traineeID) {
                TraineeAvatar(trainee: t, size: 38)
                VStack(alignment: .leading, spacing: 3) {
                    Text(t.nameAr).font(.subheadline).bold()
                    HStack(spacing: 6) {
                        if let ack = p.ackSeconds {
                            Text("إقرار \(Fmt.duration(ack))").font(.caption2).foregroundStyle(.secondary)
                        }
                        if let s = p.selfArrivalSeconds {
                            Text("• أعلن \(Fmt.duration(s))").font(.caption2).foregroundStyle(.blue)
                        }
                        if let c = p.confirmedArrivalSeconds {
                            Text("• مؤكَّد \(Fmt.duration(c))").font(.caption2).foregroundStyle(MiranTheme.green)
                        }
                    }
                    if let gap = p.verificationGapSeconds, abs(gap) > 60 {
                        Text("فارق تحقق \(Fmt.duration(abs(gap)))")
                            .font(.caption2).foregroundStyle(.orange)
                    }
                    if let r = p.declineReason {
                        Text(r).font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
            Spacer()

            if p.state == .acknowledged || p.state == .notified {
                LiveTimerText(since: p.notifiedAt, now: store.now)
                    .font(.caption2).foregroundStyle(.secondary)
            }

            if showConfirm && call.isActive && p.state != .confirmed && p.state != .declined {
                Button {
                    store.confirmArrival(callID: call.id, traineeID: p.traineeID)
                } label: {
                    Text("حضر")
                        .font(.caption).bold()
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(MiranTheme.green, in: Capsule())
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
            } else {
                MiranBadge(p.state.title, color: p.state.color, icon: p.state.icon)
            }
        }
        .padding(.vertical, 3)
    }

    // MARK: الإنهاء والخلاصة

    private func endButton(_ call: TrainerCall) -> some View {
        Button(role: .destructive) {
            store.endCall(call.id)
        } label: {
            Label("إنهاء النداء وإقفال السجل", systemImage: "stop.circle.fill")
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent)
        .tint(.red)
    }

    private func summary(_ call: TrainerCall) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("خلاصة النداء", systemImage: "chart.bar.doc.horizontal")
            InfoRow(label: "نسبة الاستجابة", value: Fmt.percent(call.responseRate))
            InfoRow(label: "نسبة الحضور الفعلي", value: Fmt.percent(call.attendanceRate))
            InfoRow(label: "متوسط زمن الإقرار",
                    value: call.averageAckSeconds.map { Fmt.duration($0) } ?? "—")
            InfoRow(label: "متوسط زمن الوصول",
                    value: call.averageArrivalSeconds.map { Fmt.duration($0) } ?? "—")
            InfoRow(label: "المعتذرون", value: "\(call.declinedCount)")
            Divider()
            Text("أُقفل السجل ولا تُقبل بعده أي استجابة. تُرحَّل هذه الأرقام إلى مؤشر الحرص لكل متدرب.")
                .font(.caption2).foregroundStyle(.tertiary)
        }
        .miranCard()
    }
}
