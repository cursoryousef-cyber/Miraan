//
//  TraineeJourneyHomeView.swift
//  Miran
//
//  الشاشة الرئيسية لـ "مساعد التدريب الصحي" — رحلتي التدريبية (Trainee Journey Assistant).
//  تعرض المرحلة الحالية، نسبة التقدم، الخطوة القادمة، مناوبة اليوم، والإجراءات السريعة.
//

import SwiftUI

struct TraineeJourneyHomeView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var systemColorScheme

    var user: UserProfileResponse? { authViewModel.currentUser }

    private var traineeRotations: [RotationModel] {
        store.apiRotations.isEmpty ? store.hospitalRotationsList : store.apiRotations
    }

    private var totalRotations: Int { max(1, traineeRotations.count) }
    private var completedRotations: Int { traineeRotations.filter { $0.status == "completed" || $0.status == "passed" }.count }
    private var activeRotation: RotationModel? { traineeRotations.first(where: { $0.status == "active" || $0.status == "in_progress" }) }
    private var currentStageNumber: Int { min(totalRotations, completedRotations + (activeRotation != nil ? 1 : 0)) }
    private var progressPercentage: Double { Double(currentStageNumber) / Double(totalRotations) }

    var body: some View {
        NavigationView {
            ZStack {
                MiranTheme.background(for: systemColorScheme)
                    .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        // ── 1. WELCOME HEADER BANNER ───────────────────────────
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("أهلاً بك، \(user?.nameAr ?? "طبيب الامتياز") 👋")
                                        .font(.title2.bold())
                                        .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                                    Text(user?.activeOrganization.displayName ?? "مستشفى الأمير عبدالعزيز بن مساعد")
                                        .font(.caption.weight(.medium))
                                        .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                                }
                                Spacer()
                                Image(systemName: "sparkles")
                                    .font(.system(size: 26))
                                    .foregroundColor(MiranTheme.emerald)
                            }
                        }
                        .padding(.horizontal)
                        .padding(.top, 10)

                        // ── 2. ACTIVE JOURNEY STAGE CARD ────────────────────────
                        VStack(alignment: .leading, spacing: 14) {
                            HStack {
                                Label("رحلتي التدريبية", systemImage: "flag.checkered.circle.fill")
                                    .font(.headline.weight(.bold))
                                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                                Spacer()
                                Text("المرحلة \(currentStageNumber) من \(totalRotations)")
                                    .font(.caption.weight(.bold))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(MiranTheme.emerald.opacity(0.12))
                                    .foregroundColor(MiranTheme.emerald)
                                    .cornerRadius(8)
                            }

                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Text(activeRotation?.department?.nameAr ?? "التدريب السريري الفعّال")
                                        .font(.title3.bold())
                                        .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                                    Spacer()
                                    Text("\(Int(progressPercentage * 100))%")
                                        .font(.headline.bold())
                                        .foregroundColor(MiranTheme.emerald)
                                }

                                GeometryReader { geo in
                                    ZStack(alignment: .leading) {
                                        RoundedRectangle(cornerRadius: 6)
                                            .fill(MiranTheme.secondarySurface(for: systemColorScheme))
                                            .frame(height: 8)
                                        RoundedRectangle(cornerRadius: 6)
                                            .fill(LinearGradient(colors: [MiranTheme.emerald, MiranTheme.teal], startPoint: .leading, endPoint: .trailing))
                                            .frame(width: max(0, min(geo.size.width, geo.size.width * CGFloat(progressPercentage))), height: 8)
                                    }
                                }
                                .frame(height: 8)
                            }

                            HStack(spacing: 6) {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(MiranTheme.emerald)
                                    .font(.caption)
                                Text("المتطلبات، القبول، التوزيع والتعيين بالقسم مكتملة بنجاح.")
                                    .font(.caption)
                                    .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                            }
                        }
                        .padding(18)
                        .background(MiranTheme.cardBackground(for: systemColorScheme))
                        .cornerRadius(20)
                        .shadow(color: Color.black.opacity(0.04), radius: 8, x: 0, y: 2)
                        .overlay(
                            RoundedRectangle(cornerRadius: 20)
                                .stroke(MiranTheme.border(for: systemColorScheme), lineWidth: 1)
                        )
                        .padding(.horizontal)

                        // ── 3. NEXT REQUIRED ACTION CARD (DYNAMIC ASSISTANT) ────
                        VStack(alignment: .leading, spacing: 12) {
                            HStack(spacing: 8) {
                                Image(systemName: "lightbulb.fill")
                                    .foregroundColor(.orange)
                                    .font(.headline)
                                Text("الخطوة القادمة في رحلتك")
                                    .font(.headline.weight(.bold))
                                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                            }

                            Text("إكمال 3 حالات سريرية في قسم الباطنة وطلب الاعتماد من المدرب المباشر.")
                                .font(.subheadline)
                                .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))

                            NavigationLink(destination: ClinicalLogbookView()) {
                                HStack {
                                    Text("تسجيل وتوثيق حالة جديدة")
                                        .font(.caption.weight(.bold))
                                    Image(systemName: "arrow.left")
                                        .font(.caption)
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .background(MiranTheme.emerald)
                                .foregroundColor(.white)
                                .cornerRadius(12)
                            }
                            .padding(.top, 4)
                        }
                        .padding(18)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.orange.opacity(0.06))
                        .cornerRadius(20)
                        .overlay(
                            RoundedRectangle(cornerRadius: 20)
                                .stroke(Color.orange.opacity(0.2), lineWidth: 1)
                        )
                        .padding(.horizontal)

                        // ── 4. TODAY'S SHIFT CARD ──────────────────────────────
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Text("مناوبة اليوم")
                                    .font(.headline.weight(.bold))
                                    .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                                Spacer()
                                Text("الأربعاء، 12 أغسطس")
                                    .font(.caption)
                                    .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                            }

                            HStack(spacing: 16) {
                                ZStack {
                                    Circle()
                                        .fill(MiranTheme.emerald.opacity(0.12))
                                        .frame(width: 48, height: 48)
                                    Image(systemName: "stethoscope")
                                        .font(.system(size: 22, weight: .bold))
                                        .foregroundColor(MiranTheme.emerald)
                                }

                                VStack(alignment: .leading, spacing: 4) {
                                    Text("قسم الباطنة - العناية المركزة")
                                        .font(.subheadline.weight(.bold))
                                        .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                                    Text("08:00 صباحاً — 04:00 مساءً (8 ساعات)")
                                        .font(.caption)
                                        .foregroundColor(MiranTheme.secondaryText(for: systemColorScheme))
                                    Text("المدرب المباشر: د. فواز جمال الديدب")
                                        .font(.caption2.weight(.medium))
                                        .foregroundColor(MiranTheme.emerald)
                                }
                                Spacer()
                            }
                        }
                        .padding(18)
                        .background(MiranTheme.cardBackground(for: systemColorScheme))
                        .cornerRadius(20)
                        .shadow(color: Color.black.opacity(0.04), radius: 8, x: 0, y: 2)
                        .overlay(
                            RoundedRectangle(cornerRadius: 20)
                                .stroke(MiranTheme.border(for: systemColorScheme), lineWidth: 1)
                        )
                        .padding(.horizontal)

                        // ── 5. QUICK ACTIONS GRID ──────────────────────────────
                        VStack(alignment: .leading, spacing: 12) {
                            Text("وصول سريع للخدمات")
                                .font(.headline.weight(.bold))
                                .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
                                .padding(.horizontal)

                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                                NavigationLink(destination: ScheduleView()) {
                                    QuickActionTile(title: "جدولي التدريبي", icon: "calendar", color: MiranTheme.emerald)
                                }
                                NavigationLink(destination: ClinicalLogbookView()) {
                                    QuickActionTile(title: "السجل السريري", icon: "book.closed.fill", color: MiranTheme.teal)
                                }
                                NavigationLink(destination: TodayView()) {
                                    QuickActionTile(title: "الكفاءات والمهام", icon: "checkmark.seal.fill", color: .blue)
                                }
                                NavigationLink(destination: TraineeProfileView()) {
                                    QuickActionTile(title: "بطاقتي الرقمية", icon: "vcard.fill", color: .purple)
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                    .padding(.bottom, 30)
                }
            }
            .navigationTitle("مساعد مِران")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - Quick Action Tile Subview
struct QuickActionTile: View {
    let title: String
    let icon: String
    let color: Color
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.12))
                    .frame(width: 38, height: 38)
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(color)
            }
            Text(title)
                .font(.caption.weight(.bold))
                .foregroundColor(MiranTheme.primaryText(for: systemColorScheme))
            Spacer()
        }
        .padding(12)
        .background(MiranTheme.cardBackground(for: systemColorScheme))
        .cornerRadius(14)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(MiranTheme.border(for: systemColorScheme), lineWidth: 1)
        )
    }
}
