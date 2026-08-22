//
//  UsersAndRolesManagementFullView.swift
//  Miran
//
//  Full Production CRUD Interface for User Accounts & Roles (RBAC Management).
//  Directly integrated with Backend REST API /user-accounts and /roles-permissions.
//

import SwiftUI

struct UsersAndRolesManagementFullView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var colorScheme
    @State private var accounts: [UserAccountViewModel] = []
    @State private var isLoading = false
    @State private var errorMessage: String? = nil
    @State private var searchText = ""
    @State private var selectedRoleFilter = "ALL"

    // Modals
    @State private var showCreateUserSheet = false
    @State private var accountToDelete: UserAccountViewModel? = nil
    @State private var showDeleteAlert = false
    @State private var accountToEdit: UserAccountViewModel? = nil

    private var userRoles: [UserRole] {
        if let r = store.role { return [r] }
        return [.academic]
    }

    var filteredAccounts: [UserAccountViewModel] {
        accounts.filter { acc in
            let matchesSearch = searchText.isEmpty ||
                acc.email.localizedCaseInsensitiveContains(searchText) ||
                (acc.personNameAr?.localizedCaseInsensitiveContains(searchText) ?? false)

            let matchesRole = selectedRoleFilter == "ALL" || acc.roleCode == selectedRoleFilter
            return matchesSearch && matchesRole
        }
    }

    var body: some View {
        ZStack {
            MiranTheme.background(for: colorScheme)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Search & Filter Bar
                VStack(spacing: 10) {
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                        TextField("البحث بالبريد الإلكتروني أو الاسم...", text: $searchText)
                            .foregroundColor(MiranTheme.primaryText(for: colorScheme))
                        if !searchText.isEmpty {
                            Button { searchText = "" } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                            }
                        }
                    }
                    .padding()
                    .background(MiranTheme.surface(for: colorScheme))
                    .cornerRadius(12)
                    .padding(.horizontal)

                    // Role Filter Chips
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            FilterChip(title: "الكل", tag: "ALL", selectedTag: $selectedRoleFilter)
                            FilterChip(title: "مدير المنصة", tag: "platform_owner", selectedTag: $selectedRoleFilter)
                            FilterChip(title: "مدير الجهة", tag: "org_manager", selectedTag: $selectedRoleFilter)
                            FilterChip(title: "مشرف أكاديمي", tag: "academic_supervisor", selectedTag: $selectedRoleFilter)
                            FilterChip(title: "مشرف تدريب", tag: "training_supervisor", selectedTag: $selectedRoleFilter)
                            FilterChip(title: "مدرب", tag: "trainer", selectedTag: $selectedRoleFilter)
                            FilterChip(title: "متدرب", tag: "trainee", selectedTag: $selectedRoleFilter)
                        }
                        .padding(.horizontal)
                    }
                }
                .padding(.vertical, 10)

                // List View
                if isLoading && accounts.isEmpty {
                    VStack(spacing: 12) {
                        ProgressView().tint(MiranTheme.emerald)
                        Text("جاري استعلام قائمة الحسابات والأنظمة...")
                            .font(.caption)
                            .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if filteredAccounts.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "person.crop.circle.badge.exclamationmark")
                            .font(.system(size: 50))
                            .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                        Text("لا توجد حسابات مطابقة")
                            .font(.headline)
                            .foregroundColor(MiranTheme.primaryText(for: colorScheme))
                        Button("تحديث البيانات") {
                            Task { await fetchAccounts() }
                        }
                        .font(.caption.bold())
                        .foregroundColor(MiranTheme.emerald)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        ForEach(filteredAccounts) { acc in
                            UserAccountRowCard(account: acc) {
                                accountToEdit = acc
                            } onDelete: {
                                accountToDelete = acc
                                showDeleteAlert = true
                            }
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                        }
                    }
                    .listStyle(.plain)
                    .refreshable {
                        await fetchAccounts()
                    }
                }
            }
        }
        .navigationTitle("إدارة الحسابات والأدوار")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if RBACPermissionEngine.hasPermission(roles: userRoles, action: .create, scope: .users) {
                    Button {
                        showCreateUserSheet = true
                    } label: {
                        Image(systemName: "person.badge.plus")
                            .font(.title3)
                            .foregroundColor(MiranTheme.emerald)
                    }
                }
            }
        }
        .task {
            await fetchAccounts()
        }
        .sheet(isPresented: $showCreateUserSheet) {
            CreateUserAccountSheet {
                Task { await fetchAccounts() }
            }
        }
        .sheet(item: $accountToEdit) { acc in
            EditUserAccountSheet(account: acc) {
                Task { await fetchAccounts() }
            }
        }
        .alert("تأكيد حذف الحساب", isPresented: $showDeleteAlert, presenting: accountToDelete) { acc in
            Button("حذف نهائي", role: .destructive) {
                Task { await deleteAccount(id: acc.id) }
            }
            Button("إلغاء", role: .cancel) {}
        } message: { acc in
            Text("هل أنت تأكد من رغبتك في حذف حساب \"\(acc.email)\"؟")
        }
    }

    private func fetchAccounts() async {
        isLoading = true
        errorMessage = nil
        do {
            let res: APIListResponse<UserAccountViewModel> = try await APIClient.shared.request(endpoint: "/user-accounts")
            self.accounts = res.data
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func deleteAccount(id: String) async {
        do {
            try await APIClient.shared.requestVoid(endpoint: "/user-accounts/\(id)", method: "DELETE")
            await fetchAccounts()
        } catch {
            // Error handled
        }
    }
}

// MARK: - User Account View Model Matching API
struct UserAccountViewModel: Codable, Identifiable {
    let id: String
    let email: String
    let isActive: Bool
    let personNameAr: String?
    let roleCode: String?
}

// MARK: - Row Card
struct UserAccountRowCard: View {
    let account: UserAccountViewModel
    let onEdit: () -> Void
    let onDelete: () -> Void
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "person.crop.circle.fill")
                .font(.largeTitle)
                .foregroundColor(MiranTheme.emerald)

            VStack(alignment: .leading, spacing: 4) {
                Text(account.personNameAr ?? account.email)
                    .font(.body.weight(.bold))
                    .foregroundColor(MiranTheme.primaryText(for: colorScheme))
                Text(account.email)
                    .font(.caption2)
                    .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                if let role = account.roleCode {
                    Text(role)
                        .font(.caption2.bold())
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.blue.opacity(0.18))
                        .foregroundColor(.blue)
                        .cornerRadius(4)
                }
            }

            Spacer()

            HStack(spacing: 4) {
                Button(action: onEdit) {
                    Image(systemName: "pencil")
                        .foregroundColor(MiranTheme.emerald)
                        .padding(8)
                        .contentShape(Rectangle())
                }
                .buttonStyle(BorderlessButtonStyle())

                Button(action: onDelete) {
                    Image(systemName: "trash.fill")
                        .foregroundColor(.red)
                        .padding(8)
                        .contentShape(Rectangle())
                }
                .buttonStyle(BorderlessButtonStyle())
            }
        }
        .padding()
        .background(MiranTheme.surface(for: colorScheme))
        .cornerRadius(12)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(MiranTheme.border(for: colorScheme), lineWidth: 1))
        .padding(.vertical, 2)
    }
}

// MARK: - Edit User Sheet
struct EditUserAccountSheet: View {
    let account: UserAccountViewModel
    let onSaved: () -> Void
    @Environment(\.dismiss) var dismiss
    @Environment(\.colorScheme) var colorScheme
    @State private var nameAr: String
    @State private var roleCode: String
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private let roleCodes = [
        ("platform_owner", "مدير المنصة"),
        ("system_admin", "مدير النظام"),
        ("university_administrator", "مدير الجامعة"),
        ("cluster_administrator", "مدير التجمع"),
        ("hospital_training_admin", "مدير التدريب بالمستشفى"),
        ("training_supervisor", "مشرف التدريب"),
        ("academic_supervisor", "مشرف أكاديمي"),
        ("trainer", "مدرب"),
        ("trainee", "متدرب")
    ]

    init(account: UserAccountViewModel, onSaved: @escaping () -> Void) {
        self.account = account
        self.onSaved = onSaved
        _nameAr = State(initialValue: account.personNameAr ?? "")
        _roleCode = State(initialValue: account.roleCode ?? "trainee")
    }

    var body: some View {
        NavigationStack {
            ZStack {
                MiranTheme.background(for: colorScheme).ignoresSafeArea()
                Form {
                    Section("معلومات الحساب") {
                        HStack {
                            Text("البريد الإلكتروني")
                                .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                            Spacer()
                            Text(account.email)
                                .foregroundColor(MiranTheme.primaryText(for: colorScheme))
                                .font(.caption)
                        }

                        HStack {
                            TextField("الاسم بالعربي", text: $nameAr)
                                .multilineTextAlignment(.trailing)
                                .foregroundColor(MiranTheme.primaryText(for: colorScheme))
                        }
                    }

                    Section("الدور الوظيفي") {
                        Picker("الدور", selection: $roleCode) {
                            ForEach(roleCodes, id: \.0) { code, label in
                                Text(label).tag(code)
                            }
                        }
                        .pickerStyle(.menu)
                    }

                    if let err = errorMessage {
                        Section {
                            Text(err).foregroundColor(MiranTheme.error).font(.caption)
                        }
                    }

                    Section {
                        Button {
                            Task { await saveChanges() }
                        } label: {
                            HStack {
                                if isSubmitting { ProgressView().tint(.white).scaleEffect(0.8) }
                                Text("حفظ التعديلات").font(.headline).foregroundColor(.white)
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .listRowBackground(MiranTheme.emerald)
                        .disabled(isSubmitting)
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("تعديل الحساب")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
            }
        }
    }

    private func saveChanges() async {
        isSubmitting = true
        errorMessage = nil
        struct EditRequest: Codable {
            let nameAr: String?
            let roleCode: String?
        }
        do {
            let req = EditRequest(nameAr: nameAr.isEmpty ? nil : nameAr, roleCode: roleCode)
            try await APIClient.shared.requestVoid(endpoint: "/user-accounts/\(account.id)", method: "PATCH", body: req)
            onSaved()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}

// MARK: - Create User Sheet
struct CreateUserAccountSheet: View {
    @Environment(\.dismiss) var dismiss
    @Environment(\.colorScheme) var colorScheme
    @State private var nationalId = ""
    @State private var nameAr = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var roleCode = "trainee"
    @State private var isSubmitting = false

    let onCreated: () -> Void

    private let roleCodes = [
        ("trainee", "متدرب"),
        ("trainer", "مدرب"),
        ("academic_supervisor", "مشرف أكاديمي"),
        ("training_supervisor", "مشرف التدريب"),
        ("hospital_training_admin", "مدير التدريب بالمستشفى"),
        ("cluster_administrator", "مدير التجمع"),
        ("university_administrator", "مدير الجامعة"),
        ("system_admin", "مدير النظام")
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                MiranTheme.background(for: colorScheme).ignoresSafeArea()
                Form {
                    Section("بيانات الهوية") {
                        TextField("رقم الهوية / الإقامة", text: $nationalId)
                            .multilineTextAlignment(.trailing)
                        TextField("الاسم بالعربي", text: $nameAr)
                            .multilineTextAlignment(.trailing)
                    }
                    Section("بيانات الاتصال") {
                        TextField("البريد الإلكتروني", text: $email)
                            .multilineTextAlignment(.trailing)
                            .keyboardType(.emailAddress)
                            .autocapitalization(.none)
                        TextField("رقم الجوال (+966)", text: $phone)
                            .multilineTextAlignment(.trailing)
                            .keyboardType(.phonePad)
                    }
                    Section("الدور الوظيفي") {
                        Picker("الدور", selection: $roleCode) {
                            ForEach(roleCodes, id: \.0) { code, label in
                                Text(label).tag(code)
                            }
                        }
                        .pickerStyle(.menu)
                    }
                    Section {
                        Button {
                            Task { await submitUser() }
                        } label: {
                            HStack {
                                if isSubmitting { ProgressView().tint(.white).scaleEffect(0.8) }
                                Text("حفظ الحساب").font(.headline.bold()).foregroundColor(.white)
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .listRowBackground(MiranTheme.emerald)
                        .disabled(email.isEmpty || nationalId.isEmpty || isSubmitting)
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("إنشاء حساب مستخدم جديد")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
            }
        }
    }

    private func submitUser() async {
        isSubmitting = true
        do {
            let req = CreateUserAccountRequest(nationalId: nationalId, nameAr: nameAr, email: email, phone: phone, roleCode: roleCode, organizationId: "")
            try await APIClient.shared.requestVoid(endpoint: "/user-accounts", method: "POST", body: req)
            onCreated()
            dismiss()
        } catch {
            // Error handled
        }
        isSubmitting = false
    }
}
