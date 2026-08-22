//
//  RotationPassportView.swift
//  مِران
//
//  جواز الروتيشن — يُفتح قبل ٤٨ ساعة من دخول القسم.
//

import SwiftUI

struct RotationPassportView: View {
    @EnvironmentObject var store: AppStore

    private var trainee: Trainee? { store.currentTrainee }

    private var rotation: Rotation? {
        guard let t = trainee else { return nil }
        if let current = store.currentRotation(for: t.id) { return current }
        // يُفتح مسبقاً قبل ٤٨ ساعة
        if let next = store.nextRotation(for: t.id),
           next.startDate.timeIntervalSinceNow <= 48 * 3600 {
            return next
        }
        return store.nextRotation(for: t.id)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if let rot = rotation, let dept = store.department(rot.departmentID) {

                        if !rot.isCurrent {
                            HStack {
                                Image(systemName: "envelope.open.fill")
                                Text("جواز الروتيشن القادم — يبدأ \(Fmt.date(rot.startDate))")
                                    .font(.subheadline)
                            }
                            .miranCard(tint: .orange)
                        }

                        header(dept: dept, rot: rot)
                        objectives(dept: dept, rot: rot)
                        locations(dept: dept)
                        mistakes(dept: dept)
                        firstDay(dept: dept)
                        privileges(dept: dept)
                        peers(rot: rot)

                    } else {
                        EmptyStateView(icon: "map",
                                       title: "لا يوجد روتيشن",
                                       message: "لم يُسند لك قسم بعد.")
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("جواز الروتيشن")
        }
    }

    private func header(dept: Department, rot: Rotation) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(dept.name).font(.title2).bold()
            InfoRow(label: "المدرب الأساس",
                    value: store.trainer(rot.trainerID)?.nameAr ?? "—", icon: "person.text.rectangle")
            InfoRow(label: "التحويلة",
                    value: store.trainer(rot.trainerID)?.extensionNumber ?? "—", icon: "phone.fill")
            InfoRow(label: "المدة",
                    value: "\(Fmt.shortDate(rot.startDate)) — \(Fmt.shortDate(rot.endDate))", icon: "calendar")
        }
        .miranCard(tint: MiranTheme.accent)
    }

    private func objectives(dept: Department, rot: Rotation) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("الأهداف التعليمية", systemImage: "target")
            ForEach(Array(dept.objectives.enumerated()), id: \.offset) { idx, obj in
                Button {
                    store.toggleObjective(rot.id, index: idx)
                } label: {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: rot.completedObjectives.contains(idx)
                              ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(rot.completedObjectives.contains(idx)
                                             ? MiranTheme.green : Color.secondary)
                        Text(obj)
                            .font(.subheadline)
                            .multilineTextAlignment(.leading)
                            .foregroundStyle(.primary)
                        Spacer()
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .miranCard()
    }

    private func locations(dept: Department) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("المواقع والمواعيد", systemImage: "mappin.and.ellipse")
            InfoRow(label: "الراوند", value: dept.roundTime, icon: "clock")
            InfoRow(label: "مكان الراوند", value: dept.roundLocation, icon: "figure.walk")
            InfoRow(label: "غرفة الاجتماعات", value: dept.meetingRoom, icon: "door.left.hand.open")
        }
        .miranCard()
    }

    private func mistakes(dept: Department) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("أكثر الأخطاء شيوعاً هنا", systemImage: "exclamationmark.triangle.fill")
            ForEach(Array(dept.commonMistakes.enumerated()), id: \.offset) { idx, m in
                HStack(alignment: .top, spacing: 8) {
                    Text("\(idx + 1).").font(.caption).bold().foregroundStyle(.orange)
                    Text(m).font(.subheadline)
                    Spacer()
                }
            }
        }
        .miranCard(tint: .orange)
    }

    private func firstDay(dept: Department) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionTitle("ما هو متوقع منك في اليوم الأول", systemImage: "1.circle.fill")
            Text(dept.firstDayExpectations).font(.subheadline)
        }
        .miranCard()
    }

    private func privileges(dept: Department) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("صلاحياتك السريرية", systemImage: "checkmark.shield.fill")
            ForEach(PrivilegeLevel.allCases, id: \.self) { level in
                let items = dept.privileges.filter { $0.level == level }
                if !items.isEmpty {
                    HStack {
                        Image(systemName: level.icon).foregroundStyle(level.color)
                        Text(level.title).font(.subheadline).bold().foregroundStyle(level.color)
                        Spacer()
                    }
                    ForEach(items) { p in
                        Text("• \(p.title)").font(.caption).padding(.trailing, 22)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
        .miranCard()
    }

    private func peers(rot: Rotation) -> some View {
        let peers = store.rotations
            .filter { $0.departmentID == rot.departmentID && $0.isCurrent && $0.traineeID != rot.traineeID }
            .compactMap { store.trainee($0.traineeID) }

        return VStack(alignment: .leading, spacing: 10) {
            SectionTitle("زملاؤك في هذه الدورة", systemImage: "person.3.fill")
            if peers.isEmpty {
                Text("لا يوجد زملاء مسجّلون.").font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(peers) { p in
                    HStack(spacing: 10) {
                        TraineeAvatar(trainee: p, size: 34)
                        Text(p.nameAr).font(.subheadline)
                        Spacer()
                        MiranBadge(p.level.title, color: p.level.stripeColor)
                    }
                }
            }
        }
        .miranCard()
    }
}
