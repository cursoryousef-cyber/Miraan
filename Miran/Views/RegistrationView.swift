//
//  RegistrationView.swift
//  مِران
//
//  التسجيل الذاتي للمتدرب: البيانات، الصورة، ثم رفع المستندات.
//

import SwiftUI
import UIKit
import PhotosUI

struct RegistrationView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss

    @State private var step = 0

    // البيانات
    @State private var nameAr = ""
    @State private var nameEn = ""
    @State private var nationalID = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var emergency = ""
    @State private var sponsor = ""
    @State private var specialty = ""
    @State private var level: TraineeLevel = .intern

    // التحقق بالرمز
    @State private var otpSent = false
    @State private var otp = ""

    // الصورة
    @State private var photoItem: PhotosPickerItem?
    @State private var photoData: Data?

    private var canProceedData: Bool {
        !nameAr.isEmpty && nationalID.count >= 10 && phone.count >= 10 && otpSent && otp.count == 4
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {

                // مؤشر الخطوات
                HStack(spacing: 6) {
                    ForEach(0..<3, id: \.self) { i in
                        Capsule()
                            .fill(i <= step ? MiranTheme.accent : Color.gray.opacity(0.25))
                            .frame(height: 5)
                    }
                }
                .padding()

                TabView(selection: $step) {
                    dataStep.tag(0)
                    photoStep.tag(1)
                    documentsStep.tag(2)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
            }
            .navigationTitle("التسجيل الذاتي")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("إلغاء") { dismiss() }
                }
            }
        }
    }

    // MARK: الخطوة ١ — البيانات

    private var dataStep: some View {
        Form {
            Section("البيانات الأساسية") {
                TextField("الاسم الرباعي بالعربية", text: $nameAr)
                TextField("الاسم بالإنجليزية", text: $nameEn)
                TextField("رقم الهوية أو الإقامة", text: $nationalID)
                    .keyboardType(.numberPad)
                Picker("المستوى", selection: $level) {
                    ForEach(TraineeLevel.allCases) { l in
                        Text(l.title).tag(l)
                    }
                }
                TextField("التخصص", text: $specialty)
                TextField("الجهة المبتعثة", text: $sponsor)
            }

            Section("التواصل") {
                TextField("رقم الجوال", text: $phone)
                    .keyboardType(.phonePad)
                TextField("البريد الإلكتروني", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                TextField("جهة الاتصال في الطوارئ", text: $emergency)
                    .keyboardType(.phonePad)
            }

            Section {
                if !otpSent {
                    Button("إرسال رمز التحقق") {
                        otpSent = true
                    }
                    .disabled(phone.count < 10)
                } else {
                    TextField("رمز التحقق (أدخل أي ٤ أرقام)", text: $otp)
                        .keyboardType(.numberPad)
                    Label("أُرسل رمز إلى \(phone)", systemImage: "checkmark.circle.fill")
                        .font(.caption).foregroundStyle(MiranTheme.green)
                }
            } header: {
                Text("التحقق من الجوال")
            } footer: {
                Text("في النسخة التجريبية أي أربعة أرقام مقبولة.")
            }

            Section {
                Button("التالي — الصورة الشخصية") {
                    withAnimation { step = 1 }
                }
                .disabled(!canProceedData)
                .frame(maxWidth: .infinity)
                .bold()
            }
        }
    }

    // MARK: الخطوة ٢ — الصورة

    private var photoStep: some View {
        ScrollView {
            VStack(spacing: 18) {
                Text("الصورة الشخصية").font(.headline).padding(.top, 8)

                ZStack {
                    if let photoData, let ui = UIImage(data: photoData) {
                        Image(uiImage: ui)
                            .resizable().scaledToFill()
                    } else {
                        Rectangle().fill(Color.gray.opacity(0.15))
                        VStack(spacing: 6) {
                            Image(systemName: "person.crop.rectangle.badge.plus")
                                .font(.system(size: 40)).foregroundStyle(.secondary)
                            Text("اختر صورة").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .frame(width: 180, height: 240)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(MiranTheme.accent.opacity(0.4), style: StrokeStyle(lineWidth: 2, dash: [6]))
                )

                PhotosPicker(selection: $photoItem, matching: .images) {
                    Label("اختيار صورة من المكتبة", systemImage: "photo.on.rectangle")
                }
                .buttonStyle(.borderedProminent)
                .onChange(of: photoItem) { newValue in
                    Task {
                        if let data = try? await newValue?.loadTransferable(type: Data.self) {
                            photoData = data
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    SectionTitle("مواصفات الصورة", systemImage: "checklist")
                    ForEach([
                        "وجه واضح أمامي وخلفية فاتحة موحدة",
                        "بدون غطاء للوجه أو نظارة شمسية",
                        "لا تقل عن 600×800 بكسل بنسبة 3:4",
                        "JPG أو PNG بحد أقصى ٢ ميجابايت"
                    ], id: \.self) { s in
                        HStack(alignment: .top, spacing: 6) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.caption2).foregroundStyle(MiranTheme.green)
                            Text(s).font(.caption)
                            Spacer()
                        }
                    }
                    Divider()
                    Text("الصورة لا تُعتمد إلا بموافقة الشؤون الأكاديمية، ويمكن رفضها وطلب بديلة مع ذكر السبب.")
                        .font(.caption2).foregroundStyle(.tertiary)
                }
                .miranCard()
                .padding(.horizontal)

                HStack {
                    Button("رجوع") { withAnimation { step = 0 } }
                        .buttonStyle(.bordered)
                    Button("التالي — المستندات") { withAnimation { step = 2 } }
                        .buttonStyle(.borderedProminent)
                        .disabled(photoData == nil)
                }
                .padding(.bottom, 20)
            }
            .padding(.horizontal)
        }
        .background(Color(.systemGroupedBackground))
    }

    // MARK: الخطوة ٣ — المستندات والإرسال

    private var documentsStep: some View {
        ScrollView {
            VStack(spacing: 14) {
                Text("المستندات المطلوبة").font(.headline).padding(.top, 8)

                VStack(alignment: .leading, spacing: 10) {
                    ForEach(requiredDocuments, id: \.0) { title, mandatory in
                        HStack {
                            Image(systemName: "doc.badge.plus").foregroundStyle(MiranTheme.accentLight)
                            Text(title).font(.subheadline)
                            Spacer()
                            if mandatory {
                                MiranBadge("إلزامي", color: .gray)
                            }
                        }
                    }
                    Divider()
                    Text("PDF أو JPG أو PNG — بحد أقصى ٥ ميجابايت للملف. سينبّهك النظام قبل ٦٠ و٣٠ و٧ أيام من انتهاء أي مستند.")
                        .font(.caption2).foregroundStyle(.tertiary)
                }
                .miranCard()

                Button {
                    submit()
                } label: {
                    Label("إرسال الملف للشؤون الأكاديمية", systemImage: "paperplane.fill")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)

                Button("رجوع") { withAnimation { step = 1 } }
                    .buttonStyle(.bordered)

                Text("بعد الإرسال تراجع الشؤون الأكاديمية أوراقك، ثم تمنحك الصلاحية وتصدر بطاقتك، فيظهر أمامك كل شيء مجدولاً ومنظماً.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                    .padding(.bottom, 24)
            }
            .padding(.horizontal)
        }
        .background(Color(.systemGroupedBackground))
    }

    private var requiredDocuments: [(String, Bool)] {
        [
            ("صورة الهوية أو الإقامة", true),
            ("خطاب الجهة المبتعثة", true),
            ("بطاقة التصنيف المهني", true),
            ("شهادة التخرج أو إفادة قيد", true),
            ("شهادة BLS", true),
            ("شهادة ACLS أو PALS", false),
            ("سجل التطعيمات", true),
            ("تأمين المسؤولية الطبية", true),
            ("تعهد السرية وسياسة المنشأة", true),
            ("الفحص الطبي واللياقة", false)
        ]
    }

    private func submit() {
        let docs = requiredDocuments.map { title, mandatory in
            TrainingDocument(title: title, isMandatory: mandatory, hasExpiry: true,
                             expiryDate: Calendar.current.date(byAdding: .month, value: 12, to: Date()),
                             status: .pending)
        }

        let newTrainee = Trainee(
            traineeNumber: String(Int.random(in: 11040...11999)),
            nameAr: nameAr,
            nameEn: nameEn.isEmpty ? nameAr : nameEn,
            nationalID: nationalID,
            level: level,
            specialty: specialty.isEmpty ? "غير محدد" : specialty,
            sponsor: sponsor.isEmpty ? "غير محدد" : sponsor,
            phone: phone,
            email: email,
            emergencyContact: emergency,
            photoData: photoData,
            applicationStatus: .submitted,
            cardStatus: .notIssued,
            documents: docs
        )

        store.trainees.append(newTrainee)
        dismiss()
    }
}
