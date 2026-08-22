//
//  ApplicationsReviewView.swift
//  مِران
//
//  مراجعة ملفات المتدربين واعتمادها وإصدار البطاقات.
//

import SwiftUI

struct ApplicationsReviewView: View {
    @EnvironmentObject var store: AppStore
    @State private var filter: ApplicationStatus? = .submitted

    private var filtered: [Trainee] {
        guard let filter else { return store.trainees }
        return store.trainees.filter { $0.applicationStatus == filter }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        chip("الكل", nil)
                        chip("قيد المراجعة", .submitted)
                        chip("ناقص", .incomplete)
                        chip("معتمد", .approved)
                        chip("مرفوض", .rejected)
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 10)
                }

                List {
                    ForEach(filtered) { t in
                        NavigationLink {
                            ApplicationDetailView(traineeID: t.id)
                        } label: {
                            HStack(spacing: 10) {
                                TraineeAvatar(trainee: t, size: 42)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(t.nameAr).font(.subheadline).bold()
                                    Text("\(t.level.title) • \(t.traineeNumber)")
                                        .font(.caption2).foregroundStyle(.secondary)
                                }
                                Spacer()
                                MiranBadge(t.applicationStatus.title, color: t.applicationStatus.color)
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("مراجعة الملفات")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("خروج") { store.role = nil }
                }
            }
        }
    }

    private func chip(_ title: String, _ status: ApplicationStatus?) -> some View {
        Button {
            filter = status
        } label: {
            Text(title)
                .font(.caption).bold()
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(filter == status ? MiranTheme.accent : Color(.secondarySystemGroupedBackground),
                            in: Capsule())
                .foregroundStyle(filter == status ? .white : .primary)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - تفاصيل الملف

struct ApplicationDetailView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let traineeID: UUID

    @State private var note = ""
    @State private var showNoteAlert = false
    @State private var months = 12

    private var trainee: Trainee? { store.trainee(traineeID) }

    var body: some View {
        List {
            if let t = trainee {
                Section {
                    HStack(spacing: 12) {
                        TraineeAvatar(trainee: t, size: 60)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(t.nameAr).font(.headline)
                            Text(t.nameEn).font(.caption).foregroundStyle(.secondary)
                            MiranBadge(t.applicationStatus.title, color: t.applicationStatus.color)
                        }
                        Spacer()
                    }
                }

                Section("البيانات") {
                    InfoRow(label: "رقم المتدرب", value: t.traineeNumber)
                    InfoRow(label: "المستوى", value: t.level.title)
                    InfoRow(label: "التخصص", value: t.specialty)
                    InfoRow(label: "الجهة المبتعثة", value: t.sponsor)
                    InfoRow(label: "الجوال", value: t.phone)
                    InfoRow(label: "البريد", value: t.email)
                }

                Section("المستندات") {
                    ForEach(t.documents) { doc in
                        HStack {
                            Image(systemName: doc.status.icon).foregroundStyle(doc.status.color)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(doc.title).font(.subheadline)
                                if let e = doc.expiryDate {
                                    Text("ينتهي \(Fmt.shortDate(e))")
                                        .font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            if doc.isMandatory {
                                MiranBadge("إلزامي", color: .gray)
                            }
                        }
                    }
                }

                if t.applicationStatus != .approved {
                    Section("الاعتماد") {
                        Stepper("مدة الصلاحية: \(months) شهراً", value: $months, in: 1...36)
                        Button {
                            store.approveApplication(traineeID, months: months)
                        } label: {
                            Label("اعتماد وإصدار البطاقة", systemImage: "checkmark.seal.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)

                        Button {
                            showNoteAlert = true
                        } label: {
                            Label("طلب استكمال", systemImage: "exclamationmark.bubble")
                        }

                        Button(role: .destructive) {
                            store.rejectApplication(traineeID, note: "")
                        } label: {
                            Label("رفض الملف", systemImage: "xmark.circle")
                        }
                    }
                } else {
                    Section("البطاقة") {
                        InfoRow(label: "الحالة", value: t.cardStatus.title)
                        InfoRow(label: "تنتهي", value: Fmt.date(t.accessExpiry))

                        if t.cardStatus == .active {
                            Button("تعليق البطاقة") { store.suspendCard(traineeID) }
                            Button("إبطال البطاقة", role: .destructive) { store.revokeCard(traineeID) }
                        } else {
                            Button("إعادة تفعيل البطاقة") { store.reactivateCard(traineeID) }
                        }

                        NavigationLink {
                            IDCardView(traineeID: traineeID)
                        } label: {
                            Label("عرض البطاقة", systemImage: "person.text.rectangle")
                        }
                    }
                }
            }
        }
        .navigationTitle("تفاصيل الملف")
        .navigationBarTitleDisplayMode(.inline)
        .alert("طلب استكمال", isPresented: $showNoteAlert) {
            TextField("ما المطلوب استكماله؟", text: $note)
            Button("إرسال") {
                store.requestCompletion(traineeID, note: note)
            }
            Button("إلغاء", role: .cancel) { }
        }
    }
}
