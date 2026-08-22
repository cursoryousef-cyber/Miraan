//
//  TrainerPlanView.swift
//  مِران
//
//  خطة المدرب وقناة التواصل المغلقة مع متدربيه.
//

import SwiftUI

struct TrainerPlanView: View {
    @EnvironmentObject var store: AppStore
    @State private var weeklyGoals: [String] = [
        "إتقان عرض الحالة في الراوند خلال ٥ دقائق",
        "قراءة تخطيط القلب الأساسي",
        "كتابة ملخص خروج مكتمل"
    ]
    @State private var newGoal = ""
    @State private var message = ""
    @State private var sentMessages: [String] = []

    private var trainer: Trainer? { store.currentTrainer }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("الخطة تتحول تلقائياً إلى مهام مؤرخة على تقويم كل متدرب مسند إليك.")
                        .font(.caption).foregroundStyle(.secondary)
                }

                Section("أهداف الأسبوع") {
                    ForEach(weeklyGoals, id: \.self) { g in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "target").foregroundStyle(MiranTheme.accentLight)
                            Text(g).font(.subheadline)
                        }
                    }
                    .onDelete { weeklyGoals.remove(atOffsets: $0) }

                    HStack {
                        TextField("هدف جديد", text: $newGoal)
                        Button("إضافة") {
                            guard !newGoal.trimmingCharacters(in: .whitespaces).isEmpty else { return }
                            weeklyGoals.append(newGoal)
                            newGoal = ""
                        }
                        .font(.caption)
                    }
                }

                Section {
                    HStack {
                        TextField("رسالة لمتدربيك", text: $message, axis: .vertical)
                            .lineLimit(1...4)
                        Button {
                            guard !message.trimmingCharacters(in: .whitespaces).isEmpty else { return }
                            sentMessages.insert(message, at: 0)
                            message = ""
                        } label: {
                            Image(systemName: "paperplane.fill")
                        }
                    }
                    ForEach(sentMessages, id: \.self) { m in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(m).font(.subheadline)
                            Text("أُرسلت لـ \(store.traineesOf(trainer: trainer?.id ?? UUID()).count) متدربين")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                } header: {
                    Text("قناة التواصل المغلقة")
                } footer: {
                    Text("كل توجيه يُحفظ في ملف المتدرب. القيمة ليست في الرسالة، بل في أن الصلة موثّقة وقابلة للقياس.")
                }

                Section("مؤشر تفاعلك كمدرب") {
                    InfoRow(label: "التوجيهات المرسلة", value: "\(sentMessages.count)")
                    InfoRow(label: "النداءات المطلقة",
                            value: "\(store.trainerCalls(by: trainer?.id ?? UUID()).count)")
                    InfoRow(label: "التقييمات المشبوهة",
                            value: "\(store.suspiciousEvaluationCount(evaluatorID: trainer?.id ?? UUID()))")
                }
            }
            .navigationTitle("الخطة والتواصل")
        }
    }
}
