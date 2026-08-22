//
//  CallCenterView.swift
//  مِران
//
//  Call center for Trainer / Hospital Admin.
//  Source of truth: store.apiCalls (TrainerCallModel from Backend).
//  Removed dependency on local TrainerCall / store.currentTrainer (SeedData).
//

import SwiftUI

struct CallCenterView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.colorScheme) var colorScheme
    @State private var showLauncher = false
    @State private var isRefreshing = false

    private var activeCalls: [TrainerCallModel] {
        store.apiCalls.filter { $0.status == "active" || $0.status == "launched" }
    }
    private var pastCalls: [TrainerCallModel] {
        store.apiCalls.filter { $0.status != "active" && $0.status != "launched" }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                MiranTheme.background(for: colorScheme).ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 14) {

                        // ── Launch Button ──────────────────────────────
                        Button { showLauncher = true } label: {
                            VStack(spacing: 10) {
                                Image(systemName: "bell.badge.fill")
                                    .font(.system(size: 42))
                                Text("إطلاق نداء")
                                    .font(.title3.bold())
                                Text("زر واحد — يقيس من يستجيب ومن يحضر فعلاً")
                                    .font(.caption)
                                    .opacity(0.85)
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 26)
                            .background(
                                LinearGradient(
                                    colors: [MiranTheme.accent, MiranTheme.accentLight],
                                    startPoint: .topLeading, endPoint: .bottomTrailing
                                ),
                                in: RoundedRectangle(cornerRadius: 18)
                            )
                        }
                        .buttonStyle(.plain)

                        // ── Active Calls (from API) ────────────────────
                        if !activeCalls.isEmpty {
                            VStack(alignment: .trailing, spacing: 10) {
                                HStack {
                                    Circle().fill(MiranTheme.error).frame(width: 8, height: 8)
                                    Text("نداءات جارية").font(.subheadline.bold())
                                        .foregroundColor(MiranTheme.primaryText(for: colorScheme))
                                }
                                .frame(maxWidth: .infinity, alignment: .trailing)

                                ForEach(activeCalls) { call in
                                    apiCallRow(call, live: true)
                                }
                            }
                            .padding()
                            .background(MiranTheme.surface(for: colorScheme))
                            .cornerRadius(16)
                            .overlay(RoundedRectangle(cornerRadius: 16).stroke(MiranTheme.error.opacity(0.3), lineWidth: 1))
                        }

                        // ── Past Calls (from API) ──────────────────────
                        VStack(alignment: .trailing, spacing: 10) {
                            Text("سجل النداءات")
                                .font(.subheadline.bold())
                                .foregroundColor(MiranTheme.primaryText(for: colorScheme))
                                .frame(maxWidth: .infinity, alignment: .trailing)

                            if pastCalls.isEmpty && activeCalls.isEmpty {
                                MiranEmptyView(
                                    icon: "bell.slash.fill",
                                    title: "لا توجد نداءات",
                                    subtitle: "لم يتم إطلاق أي نداء حتى الآن.",
                                    actionTitle: "إطلاق نداء",
                                    action: { showLauncher = true }
                                )
                            } else if pastCalls.isEmpty {
                                Text("لا توجد نداءات سابقة.")
                                    .font(.caption)
                                    .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                            } else {
                                ForEach(pastCalls) { call in
                                    apiCallRow(call, live: false)
                                    Divider()
                                }
                            }
                        }
                        .padding()
                        .background(MiranTheme.surface(for: colorScheme))
                        .cornerRadius(16)
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(MiranTheme.border(for: colorScheme), lineWidth: 1))
                    }
                    .padding()
                }
                .refreshable {
                    isRefreshing = true
                    await store.fetchTrainerData()
                    isRefreshing = false
                }
            }
            .navigationTitle("النداء")
            .sheet(isPresented: $showLauncher) {
                ApiCallLauncherSheet()
            }
        }
    }

    // MARK: - API Call Row (TrainerCallModel)

    @ViewBuilder
    private func apiCallRow(_ call: TrainerCallModel, live: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: callIcon(for: call.callType))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(callColor(for: call.callType), in: Circle())

            VStack(alignment: .trailing, spacing: 3) {
                Text(call.customTitle ?? callTypeAr(call.callType))
                    .font(.subheadline.bold())
                    .foregroundColor(MiranTheme.primaryText(for: colorScheme))
                if let location = call.location {
                    Text(location)
                        .font(.caption2)
                        .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                }
            }
            Spacer()

            VStack(alignment: .leading, spacing: 3) {
                if live {
                    Text("جارٍ الآن")
                        .font(.caption.bold())
                        .foregroundColor(MiranTheme.error)
                } else {
                    Text(formatDate(call.launchedAt))
                        .font(.caption2)
                        .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                }
                if let participants = call.participants {
                    Text("\(participants.count) مشارك")
                        .font(.caption2)
                        .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                }
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Helpers

    private func callIcon(for type: String) -> String {
        switch type {
        case "emergency": return "exclamationmark.triangle.fill"
        case "interesting": return "stethoscope"
        case "procedure": return "hand.raised.fill"
        default: return "bell.fill"
        }
    }

    private func callColor(for type: String) -> Color {
        switch type {
        case "emergency": return MiranTheme.error
        case "interesting": return MiranTheme.accent
        case "procedure": return MiranTheme.emerald
        default: return MiranTheme.teal
        }
    }

    private func callTypeAr(_ type: String) -> String {
        switch type {
        case "emergency": return "نداء طوارئ"
        case "interesting": return "حالة مثيرة للاهتمام"
        case "procedure": return "إجراء تدريبي"
        default: return type
        }
    }

    private func formatDate(_ str: String) -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: str) {
            let f = DateFormatter()
            f.locale = Locale(identifier: "ar")
            f.dateStyle = .short
            f.timeStyle = .short
            return f.string(from: date)
        }
        return str
    }
}

// MARK: - API Call Launcher Sheet (uses store.launchCall → POST /calls/launch)

struct ApiCallLauncherSheet: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) var dismiss
    @Environment(\.colorScheme) var colorScheme
    @State private var selectedType = "interesting"
    @State private var customTitle = ""
    @State private var note = ""
    @State private var location = ""
    @State private var expectedMinutes = 20
    @State private var isLaunching = false
    @State private var errorMessage: String?

    private let callTypes = [
        ("interesting", "حالة مثيرة للاهتمام", "stethoscope"),
        ("procedure", "إجراء تدريبي", "hand.raised.fill"),
        ("emergency", "نداء طوارئ", "exclamationmark.triangle.fill"),
        ("custom", "مخصص", "bell.fill")
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                MiranTheme.background(for: colorScheme).ignoresSafeArea()
                Form {
                    Section("نوع النداء") {
                        ForEach(callTypes, id: \.0) { type in
                            Button {
                                selectedType = type.0
                            } label: {
                                HStack {
                                    Image(systemName: type.2).foregroundColor(MiranTheme.accent)
                                    Text(type.1).foregroundColor(MiranTheme.primaryText(for: colorScheme))
                                    Spacer()
                                    if selectedType == type.0 {
                                        Image(systemName: "checkmark").foregroundColor(MiranTheme.emerald)
                                    }
                                }
                            }
                        }
                    }

                    if selectedType == "custom" {
                        Section("عنوان مخصص") {
                            TextField("عنوان النداء", text: $customTitle)
                                .multilineTextAlignment(.trailing)
                        }
                    }

                    Section("تفاصيل") {
                        TextField("الموقع (اختياري)", text: $location)
                            .multilineTextAlignment(.trailing)
                        TextField("ملاحظة (اختياري)", text: $note)
                            .multilineTextAlignment(.trailing)
                        Stepper("المدة المتوقعة: \(expectedMinutes) دقيقة", value: $expectedMinutes, in: 5...120, step: 5)
                    }

                    if let err = errorMessage {
                        Section {
                            Text(err).foregroundColor(MiranTheme.error).font(.caption)
                        }
                    }

                    Section {
                        Button {
                            Task {
                                isLaunching = true
                                errorMessage = nil
                                do {
                                    try await store.launchCall(
                                        callType: selectedType,
                                        customTitle: selectedType == "custom" ? customTitle : nil,
                                        note: note.isEmpty ? nil : note,
                                        location: location.isEmpty ? nil : location,
                                        expectedMinutes: expectedMinutes,
                                        departmentId: nil
                                    )
                                    dismiss()
                                } catch {
                                    errorMessage = error.localizedDescription
                                }
                                isLaunching = false
                            }
                        } label: {
                            HStack {
                                if isLaunching { ProgressView().tint(.white).scaleEffect(0.8) }
                                Text("إطلاق النداء الآن")
                                    .font(.headline)
                                    .foregroundColor(.white)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                        }
                        .listRowBackground(MiranTheme.accent)
                        .disabled(isLaunching)
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("إطلاق نداء")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
            }
        }
    }
}
