//
//  TraineeProfileView.swift
//  مِران
//
//  ملف المتدرب: البطاقة، الأوراق، التقييمات، الملف المحمول.
//

import SwiftUI
import UIKit

struct TraineeProfileView: View {
    @EnvironmentObject var store: AppStore

    private var trainee: Trainee? { store.currentTrainee }

    var body: some View {
        NavigationStack {
            List {
                if let t = trainee {
                    Section {
                        HStack(spacing: 12) {
                            TraineeAvatar(trainee: t, size: 60)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(t.nameAr).font(.headline)
                                Text(t.nameEn).font(.caption).foregroundStyle(.secondary)
                                Text("رقم المتدرب: \(t.traineeNumber)").font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 4)
                    }

                    Section("الهوية والصلاحية") {
                        NavigationLink {
                            IDCardView(traineeID: t.id)
                        } label: {
                            Label("البطاقة التعريفية والباركود", systemImage: "person.text.rectangle.fill")
                        }
                        NavigationLink {
                            DocumentsView(traineeID: t.id)
                        } label: {
                            HStack {
                                Label("أوراقي ومستنداتي", systemImage: "doc.on.doc.fill")
                                Spacer()
                                let expiring = t.documents.filter(\.isExpiringSoon).count
                                if expiring > 0 {
                                    MiranBadge("\(expiring) قرب الانتهاء", color: .orange)
                                }
                            }
                        }
                    }

                    Section("الأداء") {
                        NavigationLink {
                            MyEvaluationsView(traineeID: t.id)
                        } label: {
                            Label("تقييماتي", systemImage: "star.leadinghalf.filled")
                        }
                        NavigationLink {
                            DepartmentFeedbackView(traineeID: t.id)
                        } label: {
                            Label("تقييمي للقسم", systemImage: "square.and.pencil")
                        }
                        NavigationLink {
                            AttendanceHistoryView(traineeID: t.id)
                        } label: {
                            Label("سجل الحضور", systemImage: "clock.badge.checkmark")
                        }
                        NavigationLink {
                            PortfolioView(traineeID: t.id)
                        } label: {
                            Label("الملف المحمول", systemImage: "doc.richtext.fill")
                        }
                    }

                    Section("تبديل المتدرب (للتجربة)") {
                        Picker("المتدرب الحالي", selection: traineeBinding(for: t)) {
                            ForEach(store.trainees.filter { $0.applicationStatus == .approved }) { tr in
                                Text(tr.nameAr).tag(tr.id)
                            }
                        }
                    }

                    Section {
                        Button("تسجيل الخروج", role: .destructive) {
                            store.role = nil
                        }
                    }
                }
            }
            .navigationTitle("ملفي الشخصي")
        }
    }

    private func traineeBinding(for t: Trainee) -> Binding<UUID> {
        Binding(
            get: { store.currentTraineeID ?? t.id },
            set: { store.currentTraineeID = $0 }
        )
    }
}

// MARK: - البطاقة التعريفية

struct IDCardView: View {
    @EnvironmentObject var store: AppStore
    let traineeID: UUID
    @State private var showBack = false

    private var trainee: Trainee? { store.trainee(traineeID) }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                if let t = trainee {

                    // حالة البطاقة
                    HStack {
                        Circle().fill(t.cardStatus.color).frame(width: 12, height: 12)
                        Text("حالة البطاقة: \(t.cardStatus.title)").font(.subheadline).bold()
                        Spacer()
                    }
                    .miranCard(tint: t.cardStatus.color)

                    // البطاقة نفسها
                    ZStack {
                        if showBack { cardBack(t) } else { cardFront(t) }
                    }
                    .frame(height: 220)
                    .animation(.easeInOut, value: showBack)

                    Button {
                        showBack.toggle()
                    } label: {
                        Label(showBack ? "عرض الوجه الأمامي" : "عرض الوجه الخلفي",
                              systemImage: "arrow.triangle.2.circlepath")
                    }
                    .buttonStyle(.bordered)

                    // مصفوفة الصلاحيات
                    if let dept = store.department(store.currentRotation(for: t.id)?.departmentID) {
                        VStack(alignment: .leading, spacing: 10) {
                            SectionTitle("مصفوفة الصلاحيات السريرية", systemImage: "checkmark.shield.fill")
                            Text("هذا ما يظهر لأي موظف يمسح الباركود.")
                                .font(.caption).foregroundStyle(.secondary)
                            ForEach(PrivilegeLevel.allCases, id: \.self) { level in
                                let items = dept.privileges.filter { $0.level == level }
                                if !items.isEmpty {
                                    HStack {
                                        Image(systemName: level.icon).foregroundStyle(level.color)
                                        Text(level.title).font(.subheadline).bold().foregroundStyle(level.color)
                                        Spacer()
                                    }
                                    .padding(.top, 4)
                                    ForEach(items) { p in
                                        Text("• \(p.title)")
                                            .font(.caption)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                }
                            }
                        }
                        .miranCard()
                    }

                    // بيانات التحقق
                    VStack(alignment: .leading, spacing: 10) {
                        SectionTitle("بيانات التحقق", systemImage: "qrcode.viewfinder")
                        InfoRow(label: "معرّف البطاقة", value: String(t.cardUUID.prefix(8)) + "…")
                        InfoRow(label: "انتهاء الصلاحية", value: Fmt.date(t.accessExpiry))
                        InfoRow(label: "الجهة المعتمِدة", value: "الشؤون الأكاديمية")
                        Divider()
                        Text("الباركود لا يحمل أي بيانات شخصية — فقط معرّفاً عشوائياً موقّعاً رقمياً.")
                            .font(.caption2).foregroundStyle(.tertiary)
                    }
                    .miranCard()
                }
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("البطاقة التعريفية")
        .navigationBarTitleDisplayMode(.inline)
    }

    // الوجه الأمامي — مقاس CR80
    private func cardFront(_ t: Trainee) -> some View {
        HStack(spacing: 0) {
            Rectangle()
                .fill(t.level.stripeColor)
                .frame(width: 12)

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("مِـران").font(.headline).bold().foregroundStyle(MiranTheme.accent)
                        Text("الشؤون الأكاديمية والتدريب")
                            .font(.system(size: 8)).foregroundStyle(.secondary)
                    }
                    Spacer()
                    TraineeAvatar(trainee: t, size: 56)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(t.nameAr).font(.subheadline).bold()
                    Text(t.nameEn).font(.system(size: 9)).foregroundStyle(.secondary)
                }

                HStack(spacing: 6) {
                    MiranBadge(t.level.title, color: t.level.stripeColor)
                    Text(t.specialty).font(.system(size: 9)).foregroundStyle(.secondary)
                }

                Spacer()

                HStack {
                    Text("رقم: \(t.traineeNumber)").font(.system(size: 9))
                    Spacer()
                    Text("تنتهي: \(Fmt.shortDate(t.accessExpiry))").font(.system(size: 9))
                }
                .foregroundStyle(.secondary)
            }
            .padding(12)
        }
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemGroupedBackground)))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.gray.opacity(0.3)))
    }

    // الوجه الخلفي
    private func cardBack(_ t: Trainee) -> some View {
        VStack(spacing: 8) {
            QRCodeView(content: t.verificationURL, size: 110)
            Text("امسح للتحقق من الصلاحية").font(.system(size: 10)).bold()
            Text("رقم الاعتماد: MRN-\(t.traineeNumber)").font(.system(size: 9)).foregroundStyle(.secondary)
            Text("الطوارئ الداخلية: ٩٩٩ • الأمن: ٩٩٧")
                .font(.system(size: 9)).foregroundStyle(.secondary)
            Text("هذه البطاقة لا تخوّل حاملها ممارسة أي عمل خارج نطاق الصلاحيات المعتمدة")
                .font(.system(size: 8))
                .foregroundStyle(.red)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemGroupedBackground)))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.gray.opacity(0.3)))
    }
}
