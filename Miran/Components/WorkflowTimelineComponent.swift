//
//  WorkflowTimelineComponent.swift
//  Miran
//
//  Reusable Timeline & Lifecycle History Component displaying Entity State Transitions.
//

import SwiftUI

struct WorkflowTimelineComponent: View {
    let entityId: String
    @ObservedObject var workflowEngine = WorkflowEngine.shared

    var items: [WorkflowTimelineItem] {
        workflowEngine.timelineHistory[entityId] ?? [
            WorkflowTimelineItem(
                id: "sample-1",
                entityId: entityId,
                entityType: "AGREEMENT",
                fromState: "DRAFT",
                toState: "PENDING_REVIEW",
                actionByName: "أحمد المنصور (ملاحظ غيابات)",
                actionByRole: "academic_supervisor",
                timestamp: Date().addingTimeInterval(-86400),
                comments: "تم إرسال الاتفاقية للمراجعة القانونية الأكاديمية"
            ),
            WorkflowTimelineItem(
                id: "sample-2",
                entityId: entityId,
                entityType: "AGREEMENT",
                fromState: "PENDING_REVIEW",
                toState: "APPROVED",
                actionByName: "د. عبد الرحمن السعد (مدير التجمع)",
                actionByRole: "org_manager",
                timestamp: Date(),
                comments: "تمت الاعتمادات والتوقيع النهائي رسمياً"
            )
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label("سجل الاعتمادات والمراحل (Timeline)", systemImage: "clock.arrow.circlepath")
                    .font(.headline.bold())
                    .foregroundColor(.white)
                Spacer()
            }

            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    HStack(alignment: .top, spacing: 14) {
                        VStack(spacing: 0) {
                            Circle()
                                .fill(MiranTheme.emerald)
                                .frame(width: 14, height: 14)
                                .overlay(
                                    Circle()
                                        .stroke(Color.white, lineWidth: 2)
                                )

                            if index < items.count - 1 {
                                Rectangle()
                                    .fill(MiranTheme.emerald.opacity(0.4))
                                    .frame(width: 2, height: 44)
                            }
                        }

                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text("\(item.fromState) ➔ \(item.toState)")
                                    .font(.caption.bold())
                                    .foregroundColor(MiranTheme.emerald)
                                Spacer()
                                Text(item.timestamp, style: .date)
                                    .font(.caption2)
                                    .foregroundColor(MiranTheme.subtext)
                            }

                            Text("\(item.actionByName) (\(item.actionByRole))")
                                .font(.caption.bold())
                                .foregroundColor(.white)

                            if let comments = item.comments {
                                Text(comments)
                                    .font(.caption2)
                                    .foregroundColor(MiranTheme.subtext)
                            }
                        }
                        .padding(.bottom, index < items.count - 1 ? 16 : 0)
                    }
                }
            }
            .padding()
            .background(Color.white.opacity(0.04))
            .cornerRadius(14)
        }
    }
}
