//
//  IncidentsFullView.swift
//  Miran
//
//  البلاغات والتصعيد — Role-aware incidents view.
//  Capability-gated: incident.view for reading, incident.create for reporting.
//  Replaces the placeholder Text("البلاغات والتصعيد") in DynamicMainTabView.
//

import SwiftUI

// MARK: - Incident Model (local until Backend endpoint is mapped)

struct IncidentItem: Identifiable {
    let id: String
    let titleAr: String
    let type: IncidentType
    let priority: IncidentPriority
    let status: IncidentStatus
    let createdAt: String
    let organizationName: String?
    let description: String?

    enum IncidentType: String {
        case safety = "سلامة"
        case clinical = "سريري"
        case administrative = "إداري"
        case equipment = "معدات"
        case other = "أخرى"
    }

    enum IncidentPriority: String {
        case critical = "حرج"
        case high = "عالي"
        case medium = "متوسط"
        case low = "منخفض"

        var color: Color {
            switch self {
            case .critical: return .red
            case .high: return .orange
            case .medium: return .yellow
            case .low: return .blue
            }
        }
    }

    enum IncidentStatus: String {
        case open = "مفتوح"
        case inReview = "قيد المراجعة"
        case resolved = "محلول"
        case closed = "مغلق"

        var color: Color {
            switch self {
            case .open: return .red
            case .inReview: return .orange
            case .resolved: return .green
            case .closed: return .gray
            }
        }
    }
}

// MARK: - Create Incident Sheet

struct CreateIncidentSheet: View {
    @Environment(\.dismiss) var dismiss
    @Environment(\.colorScheme) var colorScheme
    @State private var titleAr = ""
    @State private var description = ""
    @State private var selectedType = "سلامة"
    @State private var selectedPriority = "متوسط"
    @State private var isSubmitting = false
    @State private var showSuccess = false

    private let types = ["سلامة", "سريري", "إداري", "معدات", "أخرى"]
    private let priorities = ["حرج", "عالي", "متوسط", "منخفض"]

    var body: some View {
        NavigationStack {
            ZStack {
                MiranTheme.background(for: colorScheme).ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 18) {

                        // Title
                        VStack(alignment: .trailing, spacing: 6) {
                            Text("عنوان البلاغ")
                                .font(.caption.bold())
                                .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                            TextField("وصف مختصر للبلاغ", text: $titleAr)
                                .textFieldStyle(.plain)
                                .font(.body)
                                .padding(12)
                                .background(MiranTheme.surface(for: colorScheme))
                                .cornerRadius(10)
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(MiranTheme.border(for: colorScheme), lineWidth: 1))
                                .multilineTextAlignment(.trailing)
                        }

                        // Type
                        VStack(alignment: .trailing, spacing: 6) {
                            Text("نوع البلاغ")
                                .font(.caption.bold())
                                .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                            Picker("النوع", selection: $selectedType) {
                                ForEach(types, id: \.self) { Text($0) }
                            }
                            .pickerStyle(.segmented)
                        }

                        // Priority
                        VStack(alignment: .trailing, spacing: 6) {
                            Text("الأولوية")
                                .font(.caption.bold())
                                .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                            Picker("الأولوية", selection: $selectedPriority) {
                                ForEach(priorities, id: \.self) { Text($0) }
                            }
                            .pickerStyle(.segmented)
                        }

                        // Description
                        VStack(alignment: .trailing, spacing: 6) {
                            Text("التفاصيل")
                                .font(.caption.bold())
                                .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                            TextEditor(text: $description)
                                .frame(minHeight: 100)
                                .font(.body)
                                .padding(8)
                                .background(MiranTheme.surface(for: colorScheme))
                                .cornerRadius(10)
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(MiranTheme.border(for: colorScheme), lineWidth: 1))
                                .multilineTextAlignment(.trailing)
                        }

                        // Note: Backend endpoint pending
                        HStack(spacing: 8) {
                            Image(systemName: "info.circle.fill")
                                .foregroundColor(MiranTheme.info(for: colorScheme))
                            Text("سيتم إرسال البلاغ عبر Backend عند تفعيل الـ endpoint (/incidents).")
                                .font(.caption)
                                .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                        }
                        .padding(12)
                        .background(MiranTheme.info(for: colorScheme).opacity(0.08))
                        .cornerRadius(10)

                        Button {
                            // TODO: POST /incidents when endpoint is available
                            withAnimation { showSuccess = true }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { dismiss() }
                        } label: {
                            HStack {
                                if isSubmitting { ProgressView().tint(.white).scaleEffect(0.8) }
                                Text("إرسال البلاغ")
                                    .font(.headline)
                            }
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(titleAr.trimmingCharacters(in: .whitespaces).isEmpty ? Color.gray : MiranTheme.error)
                            .cornerRadius(14)
                        }
                        .disabled(titleAr.trimmingCharacters(in: .whitespaces).isEmpty || isSubmitting)
                    }
                    .padding()
                }
            }
            .navigationTitle("بلاغ جديد")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Main Incidents View

struct IncidentsFullView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.colorScheme) var colorScheme
    @State private var showCreateSheet = false
    @State private var selectedFilter = "الكل"

    private var user: UserProfileResponse? { authViewModel.currentUser }
    private var canCreate: Bool {
        guard let user else { return false }
        let caps = Set(user.capabilities + user.permissions)
        return caps.contains("incident.create")
    }
    private var canView: Bool {
        guard let user else { return false }
        let caps = Set(user.capabilities + user.permissions)
        return caps.contains("incident.view") || caps.contains("incident.create")
    }

    private let filters = ["الكل", "مفتوح", "قيد المراجعة", "محلول"]

    var body: some View {
        NavigationStack {
            ZStack {
                MiranTheme.background(for: colorScheme).ignoresSafeArea()

                VStack(spacing: 0) {
                    if canView {
                        // Filter bar
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(filters, id: \.self) { filter in
                                    Button {
                                        selectedFilter = filter
                                    } label: {
                                        Text(filter)
                                            .font(.caption.bold())
                                            .padding(.horizontal, 14)
                                            .padding(.vertical, 8)
                                            .background(selectedFilter == filter ? MiranTheme.error.opacity(0.15) : MiranTheme.surface(for: colorScheme))
                                            .foregroundColor(selectedFilter == filter ? MiranTheme.error : MiranTheme.secondaryText(for: colorScheme))
                                            .cornerRadius(20)
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 20)
                                                    .stroke(selectedFilter == filter ? MiranTheme.error.opacity(0.4) : MiranTheme.border(for: colorScheme), lineWidth: 1)
                                            )
                                    }
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                        }

                        // Empty state — endpoint not yet connected
                        MiranEmptyView(
                            icon: "exclamationmark.triangle.fill",
                            title: "لا توجد بلاغات",
                            subtitle: "لم يتم تسجيل أي بلاغات حتى الآن في هذا النطاق.",
                            actionTitle: canCreate ? "إنشاء بلاغ" : nil,
                            action: canCreate ? { showCreateSheet = true } : nil
                        )

                    } else {
                        // No capability
                        MiranEmptyView(
                            icon: "lock.shield.fill",
                            title: "غير مصرح",
                            subtitle: "لا تملك صلاحية عرض البلاغات في هذه الجهة."
                        )
                    }
                }
            }
            .navigationTitle("البلاغات والتصعيد")
            .toolbar {
                if canCreate {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            showCreateSheet = true
                        } label: {
                            Label("بلاغ جديد", systemImage: "plus")
                        }
                    }
                }
            }
            .sheet(isPresented: $showCreateSheet) {
                CreateIncidentSheet()
            }
        }
    }
}
