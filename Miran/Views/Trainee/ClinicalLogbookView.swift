//
//  ClinicalLogbookView.swift
//  Miran
//
//  السجل السريري الإلكتروني وحقيبة المهارات والكفاءات في تطبيق iOS
//

import SwiftUI

struct ClinicalLogbookView: View {
    @State private var caseLogs: [ClinicalCaseLogModel] = []
    @State private var competencies: [CompetencyProgressModel] = []
    @State private var procedures: [ProcedureCatalogModel] = []
    @State private var overallPercentage: Int = 88
    @State private var isLoading = false
    @State private var errorMessage: String?

    // Add Log Sheet State
    @State private var showAddSheet = false
    @State private var diagnosisInput = ""
    @State private var selectedProcedureId = ""
    @State private var participationLevel = "performed"
    @State private var notesInput = ""

    var body: some View {
        NavigationStack {
            List {
                // Section 1: Competencies & Overall Progress
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            VStack(alignment: .leading) {
                                Text("نسبة إنجاز المهارات الكلية")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                Text("\(overallPercentage)%")
                                    .font(.system(size: 34, weight: .bold, design: .rounded))
                                    .foregroundStyle(.green)
                            }
                            Spacer()
                            Image(systemName: "checkmark.seal.fill")
                                .font(.system(size: 40))
                                .foregroundStyle(.green)
                        }

                        ProgressView(value: Double(overallPercentage), total: 100)
                            .tint(.green)
                    }
                    .padding(.vertical, 8)
                } header: {
                    Text("حقيبة المهارات والكفاءات")
                }

                // Section 2: Case Logs
                Section {
                    if caseLogs.isEmpty && !isLoading {
                        Text("لا توجد حالات سريرية مسجلة حالياً")
                            .foregroundStyle(.secondary)
                            .font(.subheadline)
                    } else {
                        ForEach(caseLogs) { log in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text(log.diagnosis)
                                        .font(.headline)
                                    Spacer()
                                    StatusBadge(status: log.status)
                                }

                                if let proc = log.procedure {
                                    Text("إجراء: \(proc.titleAr)")
                                        .font(.caption)
                                        .foregroundStyle(.green)
                                }

                                HStack {
                                    Text("مستوى المشاركة: \(participationLabel(log.participationLevel))")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                    Spacer()
                                    Text(log.performedAt.prefix(10))
                                        .font(.caption2)
                                        .foregroundStyle(.tertiary)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                } header: {
                    HStack {
                        Text("سجل الحالات والإجراءات السريرية")
                        Spacer()
                        Button {
                            showAddSheet = true
                        } label: {
                            Label("إضافة", systemImage: "plus.circle.fill")
                                .font(.caption).bold()
                        }
                    }
                }

                // Section 3: Procedures Catalog
                Section {
                    ForEach(procedures) { proc in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(proc.titleAr).font(.subheadline).bold()
                                Text(proc.category).font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("المطلوب: \(proc.minRequired)")
                                .font(.caption).bold()
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.green.opacity(0.15))
                                .cornerRadius(6)
                        }
                    }
                } header: {
                    Text("مكتبة الإجراءات الطبية المعتمدة")
                }
            }
            .navigationTitle("السجل السريري Logbook")
            .refreshable {
                await loadLogbookData()
            }
            .task {
                await loadLogbookData()
            }
            .sheet(isPresented: $showAddSheet) {
                NavigationStack {
                    Form {
                        Section("تفاصيل الحالة السريرية") {
                            TextField("التشخيص (e.g. أزمة قلبية)", text: $diagnosisInput)

                            Picker("الإجراء الطبي", selection: $selectedProcedureId) {
                                Text("اختر إجراء...").tag("")
                                ForEach(procedures) { p in
                                    Text(p.titleAr).tag(p.id)
                                }
                            }

                            Picker("مستوى المشاركة", selection: $participationLevel) {
                                Text("ملاحظة ومراقبة (Observation)").tag("observation")
                                Text("مساعدة مدرب (Assisted)").tag("assisted")
                                Text("إنجاز بإشراف (Performed)").tag("performed")
                                Text("إنجاز مستقل (Independent)").tag("performed_independently")
                            }

                            TextField("ملاحظات إضافية", text: $notesInput, axis: .vertical)
                                .lineLimit(3)
                        }
                    }
                    .navigationTitle("تسجيل حالة سريرية")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("إلغاء") { showAddSheet = false }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("تسجيل") {
                                Task {
                                    await submitNewCase()
                                }
                            }
                            .disabled(diagnosisInput.isEmpty)
                        }
                    }
                }
            }
        }
    }

    private func loadLogbookData() async {
        isLoading = true
        do {
            let logsResp: APIListResponse<ClinicalCaseLogModel> = try await APIClient.shared.request(endpoint: "/logbook/my-logs")
            self.caseLogs = logsResp.data

            let procsResp: APIListResponse<ProcedureCatalogModel> = try await APIClient.shared.request(endpoint: "/logbook/procedures")
            self.procedures = procsResp.data

            let compResp: CompetencyPortfolioResponse = try await APIClient.shared.request(endpoint: "/logbook/competencies")
            self.competencies = compResp.data
            self.overallPercentage = compResp.overallPercentage
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func submitNewCase() async {
        do {
            struct CaseBody: Encodable {
                let diagnosis: String
                let procedureId: String?
                let participationLevel: String
                let notes: String?
            }

            let body = CaseBody(
                diagnosis: diagnosisInput,
                procedureId: selectedProcedureId.isEmpty ? nil : selectedProcedureId,
                participationLevel: participationLevel,
                notes: notesInput.isEmpty ? nil : notesInput
            )

            let _: APIListResponse<ClinicalCaseLogModel> = try await APIClient.shared.request(
                endpoint: "/logbook/entries",
                method: "POST",
                body: body
            )

            showAddSheet = false
            diagnosisInput = ""
            notesInput = ""
            await loadLogbookData()
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    private func participationLabel(_ code: String) -> String {
        switch code {
        case "observation": return "ملاحظة"
        case "assisted": return "مساعدة"
        case "performed": return "إنجاز بإشراف"
        case "performed_independently": return "مستقل"
        default: return code
        }
    }
}

struct StatusBadge: View {
    let status: String

    var title: String {
        switch status {
        case "submitted": return "بانتظار المدرب"
        case "trainer_approved": return "معتمد من المدرب"
        case "completed": return "معتمد نهائياً"
        default: return status
        }
    }

    var color: Color {
        switch status {
        case "submitted": return .orange
        case "trainer_approved": return .blue
        case "completed": return .green
        default: return .gray
        }
    }

    var body: some View {
        Text(title)
            .font(.caption2).bold()
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .cornerRadius(4)
    }
}
