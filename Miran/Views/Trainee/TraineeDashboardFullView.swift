//
//  TraineeDashboardFullView.swift
//  Miran
//
//  Dedicated Interactive Dashboard Interface for Trainees / Interns.
//  Presents Active Rotation, Department, Clinical Competencies, Tasks, ID Card, and Emergency Alert Triggers.
//

import SwiftUI

// MARK: - لوحة تحكم طبيب الامتياز والمتدرب (Trainee / Intern)
struct TraineeDashboardFullView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @StateObject private var traineeVM = TraineeViewModel()
    @Environment(\.colorScheme) var colorScheme

    @State private var showNewCaseSheet = false
    @State private var showDigitalIDSheet = false
    @State private var showColleaguesSheet = false

    private var activeRotation: RotationModel? {
        traineeVM.rotations.first(where: { $0.status == "active" })
    }

    var body: some View {
        SharedDashboardShell(
            roleTitle: "لوحة طبيب الامتياز والمتدرب",
            subtitle: "الروتيشن الحالي، المدرب المباشر، تسجـيل الحالات السريرية، والبطاقة الرقمية",
            iconName: "person.text.rectangle.fill",
            accentColor: MiranTheme.primary
        ) {
            VStack(spacing: 20) {
                // 1. Real Trainee KPI Stat Cards
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    SharedKPICard(
                        title: "رقم المتدرب",
                        value: traineeVM.traineeProfile?.traineeNumber ?? "—",
                        subtitle: "الرقم الأكاديمي المعتمد",
                        iconName: "vcard.fill",
                        color: MiranTheme.primary
                    ) {
                        showDigitalIDSheet = true
                    }

                    SharedKPICard(
                        title: "الحالات السريرية",
                        value: "\(store.caseLogsList.count)",
                        subtitle: "السجل التجريبي المسجل",
                        iconName: "doc.plaintext.fill",
                        color: MiranTheme.emerald
                    )

                    SharedKPICard(
                        title: "زملاء التدريب",
                        value: "\(traineeVM.colleagues.count)",
                        subtitle: "الأطباء بنفس الروتيشن",
                        iconName: "person.2.fill",
                        color: .purple
                    ) {
                        showColleaguesSheet = true
                    }

                    SharedKPICard(
                        title: "الروتيشنات المنجزة",
                        value: "\(traineeVM.rotations.filter { $0.status == "completed" }.count)",
                        subtitle: "المراحل السريرية المنتهية",
                        iconName: "checkmark.seal.fill",
                        color: .blue
                    )
                }
                .padding(.horizontal)

                        // Current Rotation Active Card
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Label("الروتيشن الحالي والتدريب الميداني", systemImage: "clock.badge.checkmark.fill")
                                    .font(.headline.bold())
                                    .foregroundColor(.white)
                                Spacer()
                                if activeRotation != nil {
                                    Text("نشط الان 🟢")
                                        .font(.caption2.bold())
                                        .foregroundColor(MiranTheme.emerald)
                                }
                            }

                            if let rotation = activeRotation {
                                HStack(spacing: 16) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("القسم السريري:")
                                            .font(.caption)
                                            .foregroundColor(MiranTheme.subtext)
                                        Text(rotation.department?.nameAr ?? "—")
                                            .font(.subheadline.bold())
                                            .foregroundColor(.white)
                                    }

                                    Spacer()

                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("المدرب المباشر:")
                                            .font(.caption)
                                            .foregroundColor(MiranTheme.subtext)
                                        Text(rotation.trainerProfile?.person?.nameAr ?? "—")
                                            .font(.subheadline.bold())
                                            .foregroundColor(MiranTheme.emerald)
                                    }
                                }

                                Divider().background(Color.white.opacity(0.1))

                                Text("\(String(rotation.startDate.prefix(10))) → \(String(rotation.endDate.prefix(10)))")
                                    .font(.caption.monospaced())
                                    .foregroundColor(MiranTheme.subtext)
                            } else {
                                Text("لا يوجد روتيشن نشط حالياً")
                                    .font(.subheadline)
                                    .foregroundColor(MiranTheme.subtext)
                            }
                        }
                        .padding()
                        .background(Color.white.opacity(0.04))
                        .cornerRadius(16)
                        .padding(.horizontal)

                        // Colleagues
                        Button {
                            showColleaguesSheet = true
                        } label: {
                            AdminActionRow(
                                title: "زملائي في التدريب",
                                subtitle: traineeVM.colleagues.isEmpty ? "لا يوجد زملاء آخرون في هذا الدوران" : "\(traineeVM.colleagues.count) زميل في نفس الروتيشن",
                                icon: "person.2.fill",
                                color: MiranTheme.emerald
                            )
                        }
                        .padding(.horizontal)

                        // Actions
                        HStack(spacing: 12) {
                            Button {
                                showNewCaseSheet = true
                            } label: {
                                HStack {
                                    Image(systemName: "plus.circle.fill")
                                    Text("تسجيل حالة سريرية")
                                        .font(.caption.bold())
                                }
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(MiranTheme.emerald)
                                .foregroundColor(.white)
                                .cornerRadius(12)
                            }
                        // Quick Actions Section
                        SharedSectionCard(title: "الإجراءات اليومية والبطاقة الرقمية", iconName: "bolt.fill") {
                            VStack(spacing: 10) {
                                SharedQuickActionButton(
                                    title: "تسجيل حالة سريرية جديدة (Logbook)",
                                    subtitle: "إضافة حالة جديدة لطلب الاعتماد من مدربك المباشر",
                                    iconName: "plus.circle.fill",
                                    color: MiranTheme.emerald
                                ) {
                                    showNewCaseSheet = true
                                }

                                SharedQuickActionButton(
                                    title: "عرض بطاقة المتدرب الرقمية (Digital ID)",
                                    subtitle: "بطاقة الهوية والرمز الاستجابة السريع للتحقق",
                                    iconName: "vcard.fill",
                                    color: MiranTheme.primary
                                ) {
                                    showDigitalIDSheet = true
                                }

                                NavigationLink(destination: ClinicalLogbookManagementFullView()) {
                                    SharedQuickActionButton(
                                        title: "سجل الحالات المعتمدة والمهارات",
                                        subtitle: "متابعة الحالات المسجلة وساعات التدريب السريري",
                                        iconName: "doc.text.fill",
                                        color: .purple
                                    ) {}
                                }
                                .buttonStyle(PlainButtonStyle())
                            }
                        }
                    }
            }
        }
        .task {
            await traineeVM.fetchDashboardData()
        }
        .refreshable {
            await traineeVM.fetchDashboardData()
        }
        .sheet(isPresented: $showDigitalIDSheet) {
            DigitalIDCardView(profile: traineeVM.traineeProfile, rotation: activeRotation, qrToken: traineeVM.cardQrToken)
        }
        .sheet(isPresented: $showColleaguesSheet) {
            TrainingColleaguesView(colleagues: traineeVM.colleagues)
        }
        .sheet(isPresented: $showNewCaseSheet) {
            CreateClinicalCaseSheet {
                Task { await traineeVM.fetchDashboardData() }
            }
        }
    }
}

// MARK: - Colleagues sheet

struct TrainingColleaguesView: View {
    let colleagues: [TrainingColleagueModel]
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            ZStack {
                MiranTheme.background.ignoresSafeArea()
                if colleagues.isEmpty {
                    Text("لا يوجد زملاء آخرون في هذا الدوران")
                        .foregroundColor(MiranTheme.subtext)
                } else {
                    List(colleagues) { colleague in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(colleague.nameAr).font(.subheadline.bold()).foregroundColor(.white)
                            Text("\(colleague.specialty ?? "") · \(colleague.departmentNameAr)")
                                .font(.caption)
                                .foregroundColor(MiranTheme.subtext)
                        }
                        .listRowBackground(Color.white.opacity(0.04))
                    }
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("زملائي في التدريب")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("إغلاق") { dismiss() }
                }
            }
        }
    }
}
