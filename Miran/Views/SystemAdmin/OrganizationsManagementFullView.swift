//
//  OrganizationsManagementFullView.swift
//  Miran
//
//  Full Production CRUD Interface for Organizations & Clusters.
//  Includes Search, Filter, Refresh, Create Modal, Edit Modal, Delete Alert, and API Integration.
//

import SwiftUI

struct OrganizationsManagementFullView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var organizations: [OrganizationModel] = []
    @State private var isLoading = false
    @State private var errorMessage: String? = nil
    @State private var searchText = ""
    @State private var selectedTypeFilter = "ALL"

    // Modals & Alerts
    @State private var showCreateSheet = false
    @State private var editingOrg: OrganizationModel? = nil
    @State private var orgToDelete: OrganizationModel? = nil
    @State private var showDeleteAlert = false

    var filteredOrganizations: [OrganizationModel] {
        organizations.filter { org in
            let matchesSearch = searchText.isEmpty ||
                org.displayName.localizedCaseInsensitiveContains(searchText) ||
                org.displayCode.localizedCaseInsensitiveContains(searchText)

            let matchesType = selectedTypeFilter == "ALL" || org.displayStatus == selectedTypeFilter || selectedTypeFilter.lowercased() == "all"
            return matchesSearch && matchesType
        }
    }

    var body: some View {
        ZStack {
            MiranTheme.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Search & Filter Header
                VStack(spacing: 12) {
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(MiranTheme.subtext)
                        TextField("البحث باسم الجهة أو الرمز...", text: $searchText)
                            .foregroundColor(.white)
                        if !searchText.isEmpty {
                            Button {
                                searchText = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(MiranTheme.subtext)
                            }
                        }
                    }
                    .padding()
                    .background(Color.white.opacity(0.06))
                    .cornerRadius(12)
                    .padding(.horizontal)

                    // Type Filter Horizontal Chips
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            FilterChip(title: "الكل", tag: "ALL", selectedTag: $selectedTypeFilter)
                            FilterChip(title: "تجمع صحي", tag: "health_cluster", selectedTag: $selectedTypeFilter)
                            FilterChip(title: "جامعة", tag: "university", selectedTag: $selectedTypeFilter)
                            FilterChip(title: "مستشفى مستقل", tag: "hospital", selectedTag: $selectedTypeFilter)
                        }
                        .padding(.horizontal)
                    }
                }
                .padding(.vertical, 12)
                .background(Color.white.opacity(0.02))

                // Content List
                if isLoading && organizations.isEmpty {
                    VStack(spacing: 12) {
                        ProgressView()
                            .tint(.white)
                        Text("جاري تحميل الجهات والتجمعات...")
                            .font(.caption)
                            .foregroundColor(MiranTheme.subtext)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if filteredOrganizations.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "building.2.slash")
                            .font(.system(size: 50))
                            .foregroundColor(MiranTheme.subtext)
                        Text("لا توجد جهات مطابقة للبحث")
                            .font(.headline)
                            .foregroundColor(.white)
                        Button("إعادة التحديث") {
                            Task { await fetchOrganizations() }
                        }
                        .font(.caption.bold())
                        .foregroundColor(MiranTheme.emerald)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        ForEach(filteredOrganizations) { org in
                            OrganizationRowCard(org: org) {
                                editingOrg = org
                            } onDelete: {
                                orgToDelete = org
                                showDeleteAlert = true
                            }
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                        }
                    }
                    .listStyle(.plain)
                    .refreshable {
                        await fetchOrganizations()
                    }
                }
            }
        }
        .navigationTitle("إدارة الجهات والتجمعات")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showCreateSheet = true
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.title3)
                        .foregroundColor(MiranTheme.emerald)
                }
            }
        }
        .task {
            await fetchOrganizations()
        }
        .sheet(isPresented: $showCreateSheet) {
            CreateOrganizationSheet { newOrg in
                Task {
                    await fetchOrganizations()
                }
            }
        }
        .sheet(item: $editingOrg) { org in
            EditOrganizationSheet(org: org) {
                Task {
                    await fetchOrganizations()
                }
            }
        }
        .alert("تأكيد حذف الجهة", isPresented: $showDeleteAlert, presenting: orgToDelete) { org in
            Button("حذف نهائي", role: .destructive) {
                Task {
                    await deleteOrg(id: org.id)
                }
            }
            Button("إلغاء", role: .cancel) {}
        } message: { org in
            Text("هل أنت تأكد من رغبتك في حذف جهة \"\(org.displayName)\"؟ لا يمكن التراجع عن هذا الإجراء.")
        }
    }

    private func fetchOrganizations() async {
        isLoading = true
        errorMessage = nil
        do {
            let res: APIListResponse<OrganizationModel> = try await APIClient.shared.request(endpoint: "/organizations")
            self.organizations = res.data
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func deleteOrg(id: String) async {
        do {
            try await APIClient.shared.requestVoid(endpoint: "/organizations/\(id)", method: "DELETE")
            await fetchOrganizations()
        } catch {
            // Error handled gracefully
        }
    }
}

// MARK: - Row Card
struct OrganizationRowCard: View {
    let org: OrganizationModel
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(org.displayName)
                        .font(.body.weight(.bold))
                        .foregroundColor(.white)
                    if let en = org.nameEn {
                        Text(en)
                            .font(.caption2)
                            .foregroundColor(MiranTheme.subtext)
                    }
                }
                Spacer()
                Text(org.displayCode)
                    .font(.caption.monospaced().bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(MiranTheme.emerald.opacity(0.15))
                    .foregroundColor(MiranTheme.emerald)
                    .cornerRadius(6)
            }

            HStack {
                Label(org.cityAr ?? "الرياض", systemImage: "mappin.circle.fill")
                    .font(.caption2)
                    .foregroundColor(MiranTheme.subtext)

                Spacer()

                HStack(spacing: 12) {
                    Button(action: onEdit) {
                        Image(systemName: "square.and.pencil")
                            .font(.caption)
                            .foregroundColor(.blue)
                            .padding(6)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(BorderlessButtonStyle())

                    Button(action: onDelete) {
                        Image(systemName: "trash.fill")
                            .font(.caption)
                            .foregroundColor(.red)
                            .padding(6)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(BorderlessButtonStyle())
                }
            }
        }
        .padding()
        .background(Color.white.opacity(0.04))
        .cornerRadius(14)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
        .padding(.vertical, 4)
    }
}

// MARK: - Filter Chip Component
struct FilterChip: View {
    let title: String
    let tag: String
    @Binding var selectedTag: String

    var body: some View {
        Button {
            selectedTag = tag
        } label: {
            Text(title)
                .font(.caption.weight(.bold))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(selectedTag == tag ? MiranTheme.emerald : Color.white.opacity(0.06))
                .foregroundColor(selectedTag == tag ? .white : MiranTheme.subtext)
                .cornerRadius(8)
        }
    }
}

// MARK: - Create Organization Sheet
struct CreateOrganizationSheet: View {
    @Environment(\.dismiss) var dismiss
    @State private var code = ""
    @State private var nameAr = ""
    @State private var nameEn = ""
    @State private var type = "health_cluster"
    @State private var cityAr = "الرياض"
    @State private var isSubmitting = false
    @State private var errorMsg: String? = nil

    let onCreated: (OrganizationModel) -> Void

    var body: some View {
        NavigationView {
            ZStack {
                MiranTheme.background.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 16) {
                        if let err = errorMsg {
                            Text(err)
                                .font(.caption)
                                .foregroundColor(.red)
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("رمز الجهة (Code)")
                                .font(.caption.bold())
                                .foregroundColor(MiranTheme.subtext)
                            TextField("مثال: EHC", text: $code)
                                .padding()
                                .background(Color.white.opacity(0.06))
                                .cornerRadius(10)
                                .foregroundColor(.white)
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("اسم الجهة (بالعربي)")
                                .font(.caption.bold())
                                .foregroundColor(MiranTheme.subtext)
                            TextField("تجمع الرياض الصحي الأول", text: $nameAr)
                                .padding()
                                .background(Color.white.opacity(0.06))
                                .cornerRadius(10)
                                .foregroundColor(.white)
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("اسم الجهة (بالإنجليزي)")
                                .font(.caption.bold())
                                .foregroundColor(MiranTheme.subtext)
                            TextField("First Health Cluster", text: $nameEn)
                                .padding()
                                .background(Color.white.opacity(0.06))
                                .cornerRadius(10)
                                .foregroundColor(.white)
                        }

                        Button {
                            Task { await submitOrg() }
                        } label: {
                            HStack {
                                if isSubmitting {
                                    ProgressView().tint(.white)
                                } else {
                                    Text("حفظ وإنشاء الجهة")
                                        .font(.headline.bold())
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(MiranTheme.emerald)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                        }
                        .disabled(code.isEmpty || nameAr.isEmpty || isSubmitting)
                    }
                    .padding()
                }
            }
            .navigationTitle("إضافة جهة جديدة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("إلغاء") { dismiss() }
                        .foregroundColor(.red)
                }
            }
        }
    }

    private func submitOrg() async {
        isSubmitting = true
        errorMsg = nil
        do {
            let req = CreateOrganizationRequest(code: code, nameAr: nameAr, nameEn: nameEn.isEmpty ? nil : nameEn, type: type, cityAr: cityAr, regionAr: "الرياض", contactEmail: nil, contactPhone: nil)
            let created: OrganizationModel = try await APIClient.shared.request(endpoint: "/organizations", method: "POST", body: req)
            onCreated(created)
            dismiss()
        } catch {
            errorMsg = error.localizedDescription
        }
        isSubmitting = false
    }
}

// MARK: - Edit Organization Sheet
struct EditOrganizationSheet: View {
    @Environment(\.dismiss) var dismiss
    let org: OrganizationModel
    @State private var nameAr: String
    @State private var nameEn: String
    @State private var isSubmitting = false

    let onUpdated: () -> Void

    init(org: OrganizationModel, onUpdated: @escaping () -> Void) {
        self.org = org
        self._nameAr = State(initialValue: org.nameAr ?? "")
        self._nameEn = State(initialValue: org.nameEn ?? "")
        self.onUpdated = onUpdated
    }

    var body: some View {
        NavigationView {
            ZStack {
                MiranTheme.background.ignoresSafeArea()

                VStack(spacing: 16) {
                    Text("تعديل جهة: \(org.displayCode)")
                        .font(.subheadline)
                        .foregroundColor(MiranTheme.subtext)

                    TextField("الاسم بالعربي", text: $nameAr)
                        .padding()
                        .background(Color.white.opacity(0.06))
                        .cornerRadius(10)
                        .foregroundColor(.white)

                    TextField("الاسم بالإنجليزي", text: $nameEn)
                        .padding()
                        .background(Color.white.opacity(0.06))
                        .cornerRadius(10)
                        .foregroundColor(.white)

                    Button {
                        Task { await updateOrg() }
                    } label: {
                        HStack {
                            if isSubmitting {
                                ProgressView().tint(.white)
                            } else {
                                Text("حفظ التغييرات")
                                    .font(.headline.bold())
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(MiranTheme.emerald)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .disabled(isSubmitting)
                    Spacer()
                }
                .padding()
            }
            .navigationTitle("تعديل بيانات الجهة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("إلغاء") { dismiss() }
                        .foregroundColor(.red)
                }
            }
        }
    }

    private func updateOrg() async {
        isSubmitting = true
        do {
            let req = UpdateOrganizationRequest(nameAr: nameAr, nameEn: nameEn.isEmpty ? nil : nameEn, status: nil, cityAr: nil, regionAr: nil, contactEmail: nil, contactPhone: nil)
            try await APIClient.shared.requestVoid(endpoint: "/organizations/\(org.id)", method: "PUT", body: req)
            onUpdated()
            dismiss()
        } catch {
            // Handle error
        }
        isSubmitting = false
    }
}
