//
//  IncomingCallView.swift
//  مِران
//
//  واجهة المتدرب أثناء النداء: زران فقط ثم عدّاد ثم «وصلت».
//

import SwiftUI

// MARK: - شريط النداء الوارد

struct IncomingCallBanner: View {
    @EnvironmentObject var store: AppStore
    let call: TrainerCall
    @State private var showSheet = true

    var body: some View {
        Button {
            showSheet = true
        } label: {
            HStack(spacing: 10) {
                Image(systemName: call.type.icon)
                    .font(.headline)
                VStack(alignment: .leading, spacing: 2) {
                    Text(call.displayTitle).font(.subheadline).bold()
                    Text(call.location).font(.caption2)
                }
                Spacer()
                Image(systemName: "chevron.up")
            }
            .foregroundStyle(.white)
            .padding(12)
            .background(call.type.color, in: RoundedRectangle(cornerRadius: 12))
            .shadow(radius: 6, y: 3)
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showSheet) {
            IncomingCallSheet(callID: call.id)
                .presentationDetents([.large])
        }
    }
}

// MARK: - شاشة الاستجابة الكاملة

struct IncomingCallSheet: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let callID: UUID

    @State private var showDecline = false
    @State private var declineReason = ""

    private var call: TrainerCall? { store.calls.first { $0.id == callID } }
    private var participant: CallParticipant? {
        guard let id = store.currentTraineeID else { return nil }
        return call?.participants.first { $0.traineeID == id }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                if let call, let p = participant {
                    VStack(spacing: 20) {

                        // رأس النداء
                        VStack(spacing: 10) {
                            Image(systemName: call.type.icon)
                                .font(.system(size: 44))
                                .foregroundStyle(.white)
                                .frame(width: 88, height: 88)
                                .background(call.type.color, in: Circle())

                            Text(call.displayTitle).font(.title2).bold()
                            MiranBadge("درجة الإلحاح: \(call.type.urgencyLabel)", color: call.type.color)
                        }
                        .padding(.top, 12)

                        // التفاصيل
                        VStack(alignment: .leading, spacing: 10) {
                            InfoRow(label: "الموقع", value: call.location, icon: "mappin.circle.fill")
                            InfoRow(label: "المدرب",
                                    value: store.trainer(call.trainerID)?.nameAr ?? "—",
                                    icon: "person.text.rectangle")
                            InfoRow(label: "المدة المتوقعة", value: "\(call.expectedMinutes) دقيقة", icon: "clock")
                            if !call.note.isEmpty {
                                Divider()
                                Text(call.note).font(.subheadline)
                            }
                        }
                        .miranCard(tint: call.type.color)

                        // منطقة الأزرار
                        actionArea(call: call, participant: p)

                        Text("الإشعار لا يحمل أي بيانات تعريفية للمريض — رقم الغرفة أو السرير فقط.")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .multilineTextAlignment(.center)
                    }
                    .padding()
                } else {
                    EmptyStateView(icon: "bell.slash",
                                   title: "انتهى النداء",
                                   message: "أُقفل هذا النداء من قبل المدرب.")
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("نداء وارد")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("إغلاق") { dismiss() }
                }
            }
            .alert("سبب الاعتذار", isPresented: $showDecline) {
                TextField("مثال: مع مريض في إجراء", text: $declineReason)
                Button("إرسال") {
                    if let id = store.currentTraineeID {
                        store.decline(callID: callID, traineeID: id,
                                      reason: declineReason.isEmpty ? "غير محدد" : declineReason)
                    }
                    dismiss()
                }
                Button("تراجع", role: .cancel) { }
            } message: {
                Text("الاعتذار المبرر لا يُحتسب غياباً ولا يخفض مؤشر حرصك.")
            }
        }
    }

    // MARK: منطقة الأزرار حسب الحالة

    @ViewBuilder
    private func actionArea(call: TrainerCall, participant p: CallParticipant) -> some View {
        switch p.state {

        case .notified:
            VStack(spacing: 12) {
                Button {
                    if let id = store.currentTraineeID {
                        store.acknowledge(callID: callID, traineeID: id)
                    }
                } label: {
                    Text("قادم")
                        .font(.title3.bold())
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.borderedProminent)
                .tint(call.type.color)

                Button {
                    showDecline = true
                } label: {
                    Text("لا أستطيع")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                }
                .buttonStyle(.bordered)
            }

        case .acknowledged:
            VStack(spacing: 14) {
                VStack(spacing: 4) {
                    Text("الوقت منذ الإشعار").font(.caption).foregroundStyle(.secondary)
                    LiveTimerText(since: p.notifiedAt, now: store.now)
                        .font(.system(size: 42, weight: .bold, design: .monospaced))
                }
                if let ack = p.ackSeconds {
                    MiranBadge("أقررت خلال \(Fmt.duration(ack))", color: MiranTheme.green, icon: "checkmark")
                }
                Button {
                    if let id = store.currentTraineeID {
                        store.markSelfArrived(callID: callID, traineeID: id)
                    }
                } label: {
                    Text("وصلت")
                        .font(.title2.bold())
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                }
                .buttonStyle(.borderedProminent)
                .tint(MiranTheme.green)
            }

        case .selfArrived:
            VStack(spacing: 10) {
                Label("سجّلنا وصولك", systemImage: "mappin.circle.fill")
                    .font(.headline)
                    .foregroundStyle(.blue)
                if call.type.requiresDualConfirmation {
                    Text("بانتظار تأكيد المدرب لحضورك.")
                        .font(.subheadline).foregroundStyle(.secondary)
                    ProgressView()
                }
                if let s = p.selfArrivalSeconds {
                    InfoRow(label: "زمن وصولك المُعلَن", value: Fmt.duration(s))
                }
            }
            .miranCard()

        case .confirmed:
            VStack(spacing: 8) {
                Label("حضور مؤكَّد", systemImage: "checkmark.seal.fill")
                    .font(.headline)
                    .foregroundStyle(MiranTheme.green)
                if let s = p.confirmedArrivalSeconds {
                    InfoRow(label: "زمن الوصول المؤكَّد", value: Fmt.duration(s))
                }
                if let g = p.verificationGapSeconds {
                    InfoRow(label: "فارق التحقق", value: Fmt.duration(abs(g)))
                }
            }
            .miranCard(tint: MiranTheme.green)

        case .declined:
            VStack(spacing: 6) {
                Label("اعتذرت عن هذا النداء", systemImage: "xmark.circle")
                    .foregroundStyle(.red)
                if let r = p.declineReason {
                    Text(r).font(.caption).foregroundStyle(.secondary)
                }
            }
            .miranCard()
        }
    }
}
