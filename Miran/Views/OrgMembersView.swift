//
//  OrgMembersView.swift
//  مِران
//
//  شاشة إدارة أعضاء الجهة — للمدير فقط (org_manager / platform_owner)
//  RBAC: تُعرض فقط إذا كان المستخدم يملك صلاحية manage_accounts
//

import SwiftUI

struct OrgMembersView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var members: [OrgMemberModel] = []
    @State private var availableRoles: [RoleModel] = []
    @State private var departments: [DepartmentModel] = []
    @State private var isLoading = false
    @State private var selectedRoleFilter = "الكل"
    @State private var showAddMember = false
    @State private var searchText = ""
    @State private var errorMessage: String?

    let roleFilters = ["الكل", "مدير الجهة", "مشرف أكاديمي", "مدرب", "متدرب"]
    let roleFilterCodes = ["", "org_manager", "academic_supervisor", "trainer", "trainee"]

    var filteredMembers: [OrgMemberModel] {
        var list = members
        let idx = roleFilters.firstIndex(of: selectedRoleFilter) ?? 0
        let code = roleFilterCodes[safe: idx] ?? ""
        if !code.isEmpty {
            list = list.filter { $0.roles.contains { $0.code == code } }
        }
        if !searchText.isEmpty {
            list = list.filter {
                ($0.nameAr ?? "").contains(searchText) ||
                $0.email.contains(searchText)
            }
        }
        return list
    }

    var body: some View {
        NavigationView {
            ZStack {
                MiranTheme.background.ignoresSafeArea()

                VStack(spacing: 0) {
                    // ── شريط الفلتر حسب الدور ─────────────────────────────
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(roleFilters, id: \.self) { filter in
                                Button(filter) { selectedRoleFilter = filter }
                                    .font(.caption.weight(.semibold))
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 7)
                                    .background(selectedRoleFilter == filter ? MiranTheme.emerald : Color.white.opacity(0.08))
                                    .foregroundColor(selectedRoleFilter == filter ? .white : MiranTheme.subtext)
                                    .cornerRadius(20)
                            }
                        }
                        .padding(.horizontal)
                        .padding(.vertical, 10)
                    }

                    // ── حقل البحث ─────────────────────────────────────────
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(MiranTheme.subtext)
                        TextField("بحث بالاسم أو البريد...", text: $searchText)
                            .foregroundColor(.white)
                    }
                    .padding(10)
                    .background(Color.white.opacity(0.08))
                    .cornerRadius(12)
                    .padding(.horizontal)
                    .padding(.bottom, 8)

                    Divider().background(Color.white.opacity(0.1))

                    // ── قائمة الأعضاء ─────────────────────────────────────
                    if isLoading {
                        Spacer()
                        ProgressView().tint(.white)
                        Spacer()
                    } else if filteredMembers.isEmpty {
                        Spacer()
                        VStack(spacing: 12) {
                            Image(systemName: "person.3")
                                .font(.system(size: 48))
                                .foregroundColor(MiranTheme.subtext)
                            Text("لا يوجد أعضاء")
                                .foregroundColor(MiranTheme.subtext)
                        }
                        Spacer()
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 10) {
                                ForEach(filteredMembers) { member in
                                    MemberCard(member: member, onDelete: { removeMember(id: member.id) })
                                }
                            }
                            .padding()
                        }
                        .refreshable { await loadMembers() }
                    }
                }
            }
            .navigationTitle("إدارة أعضاء الجهة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Text("\(filteredMembers.count) عضو")
                        .font(.caption)
                        .foregroundColor(MiranTheme.subtext)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showAddMember = true
                    } label: {
                        Image(systemName: "person.badge.plus.fill")
                            .foregroundColor(MiranTheme.emerald)
                    }
                }
            }
            .sheet(isPresented: $showAddMember, onDismiss: { Task { await loadMembers() } }) {
                AddMemberSheet(availableRoles: availableRoles, departments: departments)
            }
            .task { await loadMembers() }
        }
    }

    private func loadMembers() async {
        isLoading = true
        do {
            let res: PaginatedResponse<OrgMemberModel> = try await APIClient.shared.request(endpoint: "/org-members")
            self.members = res.data

            let rolesRes: APIListResponse<RoleModel> = try await APIClient.shared.request(endpoint: "/org-members/roles/available")
            self.availableRoles = rolesRes.data

            let deptRes: APIListResponse<DepartmentModel> = try await APIClient.shared.request(endpoint: "/org-members/departments")
            self.departments = deptRes.data
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func removeMember(id: String) {
        Task {
            do {
                let _: EmptyResponse = try await APIClient.shared.request(endpoint: "/org-members/\(id)", method: "DELETE")
                await loadMembers()
            } catch {
                self.errorMessage = error.localizedDescription
            }
        }
    }
}

// MARK: - Member Card
struct MemberCard: View {
    let member: OrgMemberModel
    let onDelete: () -> Void

    var roleColors: [(String, Color)] {
        member.roles.map { role in
            switch role.code {
            case "org_manager":        return (role.nameAr, MiranTheme.accent)
            case "academic_supervisor": return (role.nameAr, .purple)
            case "trainer":            return (role.nameAr, MiranTheme.emerald)
            case "trainee":            return (role.nameAr, .blue)
            default:                   return (role.nameAr, MiranTheme.subtext)
            }
        }
    }

    var body: some View {
        HStack(spacing: 14) {
            // Avatar
            ZStack {
                Circle()
                    .fill(LinearGradient(colors: [MiranTheme.emerald.opacity(0.3), MiranTheme.accent.opacity(0.3)],
                                        startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 50, height: 50)
                Text(String(member.nameAr?.prefix(1) ?? "?"))
                    .font(.title3.weight(.bold))
                    .foregroundColor(.white)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(member.nameAr ?? "غير محدد")
                    .font(.body.weight(.semibold))
                    .foregroundColor(.white)
                Text(member.email)
                    .font(.caption)
                    .foregroundColor(MiranTheme.subtext)

                // Roles badges
                HStack(spacing: 6) {
                    ForEach(roleColors, id: \.0) { name, color in
                        Text(name)
                            .font(.caption2.weight(.bold))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(color.opacity(0.2))
                            .foregroundColor(color)
                            .cornerRadius(8)
                    }
                }
            }

            Spacer()

            // حالة الحساب
            VStack(spacing: 4) {
                Circle()
                    .fill(member.isActive ? MiranTheme.emerald : .red)
                    .frame(width: 10, height: 10)
                Text(member.isActive ? "نشط" : "معطل")
                    .font(.caption2)
                    .foregroundColor(member.isActive ? MiranTheme.emerald : .red)
            }
        }
        .padding()
        .background(Color.white.opacity(0.05))
        .cornerRadius(16)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.white.opacity(0.08), lineWidth: 1))
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) { onDelete() } label: {
                Label("تعطيل", systemImage: "person.slash.fill")
            }
        }
    }
}

// MARK: - Add Member Sheet
struct AddMemberSheet: View {
    @Environment(\.dismiss) var dismiss
    let availableRoles: [RoleModel]
    let departments: [DepartmentModel]

    @State private var nameAr = ""
    @State private var nationalId = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var selectedRoleCode = ""
    @State private var selectedDeptId = ""
    @State private var traineeNumber = ""
    @State private var level = "intern"
    @State private var isLoading = false
    @State private var errorMsg = ""

    var selectableRoles: [RoleModel] {
        availableRoles.filter { $0.code != "trainee" }
    }

    var body: some View {
        NavigationView {
            Form {
                Section("البيانات الشخصية") {
                    TextField("الاسم بالعربية", text: $nameAr)
                    TextField("رقم الهوية الوطنية", text: $nationalId)
                        .keyboardType(.numberPad)
                    TextField("البريد الإلكتروني", text: $email)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                    TextField("رقم الجوال", text: $phone)
                        .keyboardType(.phonePad)
                }

                Section("الدور والجهة") {
                    Picker("الدور الوظيفي", selection: $selectedRoleCode) {
                        Text("اختر الدور الوظيفي...").tag("")
                        ForEach(selectableRoles) { role in
                            Text(role.nameAr).tag(role.code)
                        }
                    }

                    if selectedRoleCode == "trainer" {
                        Picker("القسم السريري", selection: $selectedDeptId) {
                            Text("اختر قسماً...").tag("")
                            ForEach(departments) { dept in
                                Text(dept.nameAr).tag(dept.id)
                            }
                        }
                    }
                }

                if !errorMsg.isEmpty {
                    Section {
                        Text(errorMsg).foregroundColor(.red).font(.caption)
                    }
                }
            }
            .navigationTitle("إضافة عضو جديد")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if selectedRoleCode.isEmpty {
                    selectedRoleCode = selectableRoles.first?.code ?? ""
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isLoading {
                        ProgressView()
                    } else {
                        Button("إضافة") { Task { await addMember() } }
                            .disabled(nameAr.trimmingCharacters(in: .whitespaces).isEmpty || nationalId.trimmingCharacters(in: .whitespaces).isEmpty || email.trimmingCharacters(in: .whitespaces).isEmpty || selectedRoleCode.isEmpty)
                    }
                }
            }
        }
    }

    private func addMember() async {
        if selectedRoleCode.isEmpty {
            errorMsg = "الرجاء اختيار الدور الوظيفي المناسب للعضو"
            return
        }
        isLoading = true
        errorMsg = ""
        do {
            struct CreateMemberRequest: Encodable {
                let nameAr: String
                let nationalId: String
                let email: String
                let phone: String
                let roleCode: String
                let departmentId: String?
            }
            let req = CreateMemberRequest(
                nameAr: nameAr.trimmingCharacters(in: .whitespaces),
                nationalId: nationalId.trimmingCharacters(in: .whitespaces),
                email: email.trimmingCharacters(in: .whitespaces),
                phone: phone.trimmingCharacters(in: .whitespaces),
                roleCode: selectedRoleCode,
                departmentId: selectedDeptId.isEmpty ? nil : selectedDeptId
            )
            let _: EmptyResponse = try await APIClient.shared.request(endpoint: "/org-members", method: "POST", body: req)
            dismiss()
        } catch {
            errorMsg = error.localizedDescription
        }
        isLoading = false
    }
}

// MARK: - API Models
struct OrgMemberModel: Codable, Identifiable {
    let id: String
    let email: String
    let username: String?
    let isActive: Bool
    let nameAr: String?
    let nameEn: String?
    let nationalId: String?
    let phone: String?
    let roles: [RoleModel]
    let isPrimary: Bool?
}

struct RoleModel: Codable, Identifiable {
    let id: String
    let code: String
    let nameAr: String
    let nameEn: String?
    let hierarchyLevel: Int?
}

struct PaginatedResponse<T: Codable>: Codable {
    let data: [T]
    let meta: MetaModel?
}

struct MetaModel: Codable {
    let total: Int
    let page: Int
    let limit: Int
}

struct EmptyResponse: Codable {}

// MARK: - Safe Array subscript
extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
