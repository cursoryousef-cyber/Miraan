//
//  AppStore.swift
//  مِران
//
//  مخزن الحالة المركزي: البيانات، المنطق، والعمليات.
//  البيانات تُجلب من Backend API (Production).
//  جميع البيانات التجريبية (SeedData) تمت إزالتها.
//

import Foundation
import Combine
import SwiftUI

@MainActor
final class AppStore: ObservableObject {

    // MARK: - الجلسة

    @Published var role: UserRole?
    @Published var currentTraineeID: UUID?
    @Published var currentTrainerID: UUID?

    // MARK: - البيانات

    @Published var trainees: [Trainee] = []
    @Published var trainers: [Trainer] = []
    @Published var departments: [Department] = []
    @Published var rotations: [Rotation] = []
    @Published var shifts: [Shift] = []
    @Published var attendance: [AttendanceRecord] = []
    @Published var calls: [TrainerCall] = []
    @Published var evaluations: [Evaluation] = []
    @Published var departmentFeedback: [DepartmentFeedback] = []
    @Published var improvementPlans: [ImprovementPlan] = []

    // MARK: - بيانات API (Production)

    @Published var apiNotifications: [NotificationModel] = []
    @Published var apiRotations: [RotationModel] = []
    @Published var apiCalls: [TrainerCallModel] = []
    @Published var apiTraineeProfile: TraineeProfileModel?
    @Published var apiTrainerProfile: TrainerProfileModel?

    // MARK: - البيانات التشغيلية والمزامنة الحية (Production API)
    @Published var hospitalTrainers: [TrainerQualifiedCardModel] = []
    @Published var hospitalDepartmentsList: [DepartmentModel] = []
    @Published var hospitalRotationsList: [RotationModel] = []
    @Published var hospitalShiftsList: [ShiftItemModel] = []
    @Published var trainerAssignedTraineesList: [TraineeProfileModel] = []
    @Published var tasksList: [TaskModel] = []
    @Published var attendanceList: [AttendanceItemModel] = []
    @Published var caseLogsList: [ClinicalCaseLogItemModel] = []
    @Published var procedureCatalogList: [ProcedureCatalogItemModel] = []
    @Published var evaluationsList: [EvaluationItemModel] = []
    @Published var hospitalReviewTrainees: [TrainingRequestTraineeRow] = []

    // MARK: - طلبات التدريب الواردة للتجمع (Cluster)

    @Published var trainingRequests: [TrainingRequestItem] = []
    @Published var trainingRequestsLoading = false
    @Published var trainingRequestsError: String?
    @Published var trainingRequestsLoaded = false

    @Published var trainingRequestDetail: TrainingRequestItem?
    @Published var requestDetailLoading = false
    @Published var requestDetailError: String?
    @Published var requestDetailLoaded = false

    @Published var requestTrainees: [TrainingRequestTraineeRow] = []
    @Published var requestTraineesLoading = false
    @Published var requestTraineesError: String?
    @Published var requestTraineesLoaded = false

    /// رسائل نجاح/فشل آخر إجراء على طلب (تُعرض كـ Alert في الشاشة).
    @Published var requestActionResultMessage: String?

    // MARK: - لوحة قيادة التجمع (إحصاءات فعلية من Backend)

    @Published var organizationStatistics: OrganizationStatisticsModel?
    @Published var hospitalCards: [HospitalCardModel] = []
    @Published var clusterTimeline: ClusterTimelineDashboard?
    @Published var clusterStatsLoading = false
    @Published var clusterStatsError: String?
    @Published var clusterStatsLoaded = false

    // MARK: - الإعدادات

    /// السقف الأسبوعي للنداءات لكل متدرب — ضابط منع الإرهاق
    @Published var weeklyCallCap: Int = 4

    /// ساعة حية تُحدَّث كل ثانية لتشغيل العدّادات
    @Published var now: Date = Date()

    private var ticker: AnyCancellable?

    // MARK: - التهيئة

    init() {
        // Production: لا يتم استدعاء seed() — جميع البيانات من Backend API
        ticker = Timer.publish(every: 1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] date in
                self?.now = date
            }
    }

    // MARK: - جلب البيانات من Backend API

    /// تُستدعى بعد تسجيل الدخول لجلب جميع البيانات الحقيقية
    func fetchAllProductionData() async {
        print("🔄 [AppStore] Fetching all production data from API...")

        // Fetch Notifications
        do {
            let result: APIListResponse<NotificationModel> = try await APIClient.shared.request(endpoint: "/notifications")
            self.apiNotifications = result.data
            print("✅ [AppStore] Notifications: \(result.data.count)")
        } catch {
            print("❌ [AppStore] Failed to fetch notifications: \(error.localizedDescription)")
        }

        // Fetch Rotations
        do {
            let result: APIListResponse<RotationModel> = try await APIClient.shared.request(endpoint: "/rotations/my")
            self.apiRotations = result.data
            print("✅ [AppStore] Rotations: \(result.data.count)")
        } catch {
            print("❌ [AppStore] Failed to fetch rotations: \(error.localizedDescription)")
        }

        // Fetch Active Calls
        do {
            let result: APIListResponse<TrainerCallModel> = try await APIClient.shared.request(endpoint: "/calls/active")
            self.apiCalls = result.data
            print("✅ [AppStore] Active Calls: \(result.data.count)")
        } catch {
            print("❌ [AppStore] Failed to fetch calls: \(error.localizedDescription)")
        }

        // Fetch Trainee Profile
        do {
            let profile: TraineeProfileModel = try await APIClient.shared.request(endpoint: "/trainees/me")
            self.apiTraineeProfile = profile
            print("✅ [AppStore] Trainee Profile: \(profile.traineeNumber)")
        } catch {
            print("⚠️ [AppStore] No trainee profile (user may not be a trainee): \(error.localizedDescription)")
        }

        // Fetch Trainer Profile
        do {
            let profile: TrainerProfileModel = try await APIClient.shared.request(endpoint: "/trainers/me")
            self.apiTrainerProfile = profile
            print("✅ [AppStore] Trainer Profile loaded")
        } catch {
            print("⚠️ [AppStore] No trainer profile (user may not be a trainer): \(error.localizedDescription)")
        }

        // Fetch operational data based on role
        await fetchHospitalData()
        await fetchTrainerData()
        await fetchTraineeData()
    }

    // MARK: - Production Operational API Methods (Hospital Admin / Trainer / Trainee)

    /// 1. Hospital Training Admin Data Fetch
    func fetchHospitalData() async {
        // Qualified Trainer Cards with Capacity & Occupancy
        do {
            let cards: [TrainerQualifiedCardModel] = try await APIClient.shared.request(endpoint: "/trainers/qualified-workspace-cards")
            self.hospitalTrainers = cards
        } catch {
            print("⚠️ [AppStore] fetchHospitalData qualified-workspace-cards: \(error.localizedDescription)")
        }

        // Departments
        do {
            let res: APIListResponse<DepartmentModel> = try await APIClient.shared.request(endpoint: "/rotations/departments")
            self.hospitalDepartmentsList = res.data
        } catch {
            print("⚠️ [AppStore] fetchHospitalData departments: \(error.localizedDescription)")
        }

        // Hospital Rotations
        do {
            let res: APIListResponse<RotationModel> = try await APIClient.shared.request(endpoint: "/rotations")
            self.hospitalRotationsList = res.data
        } catch {
            print("⚠️ [AppStore] fetchHospitalData rotations: \(error.localizedDescription)")
        }

        // Hospital Shifts
        do {
            let res: APIDataResponse<[ShiftItemModel]> = try await APIClient.shared.request(endpoint: "/operations/calendar")
            self.hospitalShiftsList = res.data
        } catch {
            print("⚠️ [AppStore] fetchHospitalData shifts: \(error.localizedDescription)")
        }

        // Hospital Review Trainees
        do {
            let list = try await APIClient.shared.fetchHospitalReviewTrainees()
            self.hospitalReviewTrainees = list
        } catch {
            print("⚠️ [AppStore] fetchHospitalData hospitalReviewTrainees: \(error.localizedDescription)")
        }

        // Active Hospital Trainees
        do {
            let res: APIListResponse<TraineeProfileModel> = try await APIClient.shared.request(endpoint: "/operations/trainer/assigned-interns")
            self.trainerAssignedTraineesList = res.data
        } catch {
            print("⚠️ [AppStore] fetchHospitalData assigned-interns: \(error.localizedDescription)")
        }
    }

    func approveCandidateRow(rowId: String) async throws {
        try await APIClient.shared.approveCandidateRow(rowId: rowId)
        await fetchHospitalData()
    }

    func rejectCandidateRow(rowId: String, reason: String) async throws {
        try await APIClient.shared.rejectCandidateRow(rowId: rowId, reason: reason)
        await fetchHospitalData()
    }

    func returnCandidateRowToUniversity(rowId: String, notes: String) async throws {
        try await APIClient.shared.returnCandidateRowToUniversity(rowId: rowId, notes: notes)
        await fetchHospitalData()
    }

    func reviewCandidateDocument(docId: String, action: String, notes: String? = nil) async throws {
        try await APIClient.shared.reviewCandidateDocument(docId: docId, action: action, notes: notes)
        await fetchHospitalData()
    }

    /// 2. Trainer Operational Data Fetch
    func fetchTrainerData() async {
        // Assigned Trainees
        do {
            let res: APIListResponse<TraineeProfileModel> = try await APIClient.shared.request(endpoint: "/operations/trainer/assigned-interns")
            self.trainerAssignedTraineesList = res.data
        } catch {
            print("⚠️ [AppStore] fetchTrainerData assigned-interns: \(error.localizedDescription)")
        }

        // Trainer Tasks
        do {
            let res: APIListResponse<TaskModel> = try await APIClient.shared.request(endpoint: "/operations/tasks")
            self.tasksList = res.data
        } catch {
            print("⚠️ [AppStore] fetchTrainerData tasks: \(error.localizedDescription)")
        }

        // Active Calls
        do {
            let res: APIListResponse<TrainerCallModel> = try await APIClient.shared.request(endpoint: "/calls/active")
            self.apiCalls = res.data
        } catch {
            print("⚠️ [AppStore] fetchTrainerData calls: \(error.localizedDescription)")
        }

        // Pending Evaluations
        do {
            let res: APIListResponse<EvaluationItemModel> = try await APIClient.shared.request(endpoint: "/operations/evaluations/my-pending")
            self.evaluationsList = res.data
        } catch {
            print("⚠️ [AppStore] fetchTrainerData evaluations: \(error.localizedDescription)")
        }
    }

    /// 3. Trainee Operational Data Fetch
    func fetchTraineeData() async {
        // My Rotations
        do {
            let res: APIListResponse<RotationModel> = try await APIClient.shared.request(endpoint: "/rotations/my")
            self.apiRotations = res.data
        } catch {
            print("⚠️ [AppStore] fetchTraineeData rotations: \(error.localizedDescription)")
        }

        // My Tasks
        do {
            let res: APIListResponse<TaskModel> = try await APIClient.shared.request(endpoint: "/operations/tasks")
            self.tasksList = res.data
        } catch {
            print("⚠️ [AppStore] fetchTraineeData tasks: \(error.localizedDescription)")
        }

        // My Incoming Calls
        do {
            let res: APIListResponse<TrainerCallModel> = try await APIClient.shared.request(endpoint: "/calls/my-incoming")
            self.apiCalls = res.data
        } catch {
            print("⚠️ [AppStore] fetchTraineeData calls: \(error.localizedDescription)")
        }

        // Procedure Catalog
        do {
            let res: APIListResponse<ProcedureCatalogItemModel> = try await APIClient.shared.request(endpoint: "/logbook/procedures")
            self.procedureCatalogList = res.data
        } catch {
            print("⚠️ [AppStore] fetchTraineeData procedures: \(error.localizedDescription)")
        }
    }

    // MARK: - Operational Mutations (Hospital Admin / Trainer / Trainee)

    func createDepartment(nameAr: String, nameEn: String?, code: String?, capacity: Int) async throws {
        let req = CreateDepartmentRequest(nameAr: nameAr, nameEn: nameEn, code: code, capacity: capacity, roundLocation: nil, roundTime: nil, meetingRoom: nil)
        let _: APIDataResponse<DepartmentModel> = try await APIClient.shared.request(endpoint: "/rotations/departments", method: "POST", body: req)
        await fetchHospitalData()
    }

    func updateDepartment(id: String, nameAr: String?, capacity: Int?, isActive: Bool?) async throws {
        let body: [String: AnyEncodable] = [
            "nameAr": AnyEncodable(nameAr),
            "capacity": AnyEncodable(capacity)
        ]
        let _: APIDataResponse<DepartmentModel> = try await APIClient.shared.request(endpoint: "/rotations/departments/\(id)", method: "PATCH", body: body)
        await fetchHospitalData()
    }

    func deleteDepartment(id: String) async throws {
        try await APIClient.shared.requestVoid(endpoint: "/rotations/departments/\(id)", method: "DELETE")
        await fetchHospitalData()
    }

    func createRotation(traineeProfileId: String, departmentId: String, trainerProfileId: String, startDate: String, endDate: String, status: String? = "scheduled") async throws {
        let req = CreateRotationRequest(traineeProfileId: traineeProfileId, departmentId: departmentId, trainerProfileId: trainerProfileId, startDate: startDate, endDate: endDate, status: status)
        let _: APIDataResponse<RotationModel> = try await APIClient.shared.request(endpoint: "/rotations", method: "POST", body: req)
        await fetchHospitalData()
    }

    func updateRotation(id: String, departmentId: String?, trainerProfileId: String?, startDate: String?, endDate: String?, status: String?) async throws {
        struct UpdateRotationRequest: Encodable {
            let departmentId: String?
            let trainerProfileId: String?
            let startDate: String?
            let endDate: String?
            let status: String?
        }
        let req = UpdateRotationRequest(departmentId: departmentId, trainerProfileId: trainerProfileId, startDate: startDate, endDate: endDate, status: status)
        let _: APIDataResponse<RotationModel> = try await APIClient.shared.request(endpoint: "/rotations/\(id)", method: "PATCH", body: req)
        await fetchHospitalData()
    }

    func deleteRotation(id: String) async throws {
        try await APIClient.shared.requestVoid(endpoint: "/rotations/\(id)", method: "DELETE")
        await fetchHospitalData()
    }

    func reassignTrainer(traineeProfileId: String, targetTrainerProfileId: String, reason: String?) async throws {
        let req = ReassignTrainerRequest(traineeProfileId: traineeProfileId, targetTrainerProfileId: targetTrainerProfileId, reason: reason)
        let _: APIDataResponse<TraineeProfileModel> = try await APIClient.shared.request(endpoint: "/trainers/reassign", method: "POST", body: req)
        await fetchHospitalData()
    }

    func createTask(assignedToId: String, titleAr: String, description: String?, dueDate: String?, priority: String? = "medium") async throws {
        let req = CreateTaskRequest(assignedToId: assignedToId, titleAr: titleAr, description: description, dueDate: dueDate, priority: priority)
        let _: APIDataResponse<TaskModel> = try await APIClient.shared.request(endpoint: "/operations/tasks", method: "POST", body: req)
        await fetchTrainerData()
    }

    func completeTask(id: String) async throws {
        let _: APIDataResponse<TaskModel> = try await APIClient.shared.request(endpoint: "/operations/tasks/\(id)/complete", method: "PATCH")
        await fetchTraineeData()
    }

    func launchCall(callType: String, customTitle: String?, note: String?, location: String?, expectedMinutes: Int?, departmentId: String?) async throws {
        let req = CreateCallRequest(callType: callType, customTitle: customTitle, note: note, location: location, expectedMinutes: expectedMinutes, departmentId: departmentId)
        let _: APIDataResponse<TrainerCallModel> = try await APIClient.shared.request(endpoint: "/calls/launch", method: "POST", body: req)
        await fetchTrainerData()
    }

    func ackCall(id: String) async throws {
        let _: APIDataResponse<CallParticipantModel> = try await APIClient.shared.request(endpoint: "/calls/\(id)/ack", method: "POST")
        await fetchTraineeData()
    }

    func onWayCall(id: String) async throws {
        let _: APIDataResponse<CallParticipantModel> = try await APIClient.shared.request(endpoint: "/calls/\(id)/on-way", method: "POST")
        await fetchTraineeData()
    }

    func arrivedCall(id: String) async throws {
        let _: APIDataResponse<CallParticipantModel> = try await APIClient.shared.request(endpoint: "/calls/\(id)/arrived", method: "POST")
        await fetchTraineeData()
    }

    func approveAttendance(id: String) async throws {
        let _: APIDataResponse<AttendanceItemModel> = try await APIClient.shared.request(endpoint: "/operations/attendance/\(id)/approve", method: "PATCH")
        await fetchTrainerData()
    }

    func rejectAttendance(id: String, reason: String?) async throws {
        struct RejectReasonBody: Encodable { let reason: String? }
        let _: APIDataResponse<AttendanceItemModel> = try await APIClient.shared.request(endpoint: "/operations/attendance/\(id)/reject", method: "PATCH", body: RejectReasonBody(reason: reason))
        await fetchTrainerData()
    }

    func checkIn(geoLat: Double?, geoLng: Double?, method: String = "mobile_gps") async throws {
        struct CheckInReq: Encodable { let geoLat: Double?; let geoLng: Double?; let method: String }
        let _: APIDataResponse<AttendanceItemModel> = try await APIClient.shared.request(endpoint: "/operations/attendance/check-in", method: "POST", body: CheckInReq(geoLat: geoLat, geoLng: geoLng, method: method))
        await fetchTraineeData()
    }

    func checkOut(id: String) async throws {
        let _: APIDataResponse<AttendanceItemModel> = try await APIClient.shared.request(endpoint: "/operations/attendance/\(id)/check-out", method: "POST")
        await fetchTraineeData()
    }

    func requestAttendanceCorrection(id: String, reason: String) async throws {
        struct CorrectionReq: Encodable { let reason: String }
        let _: APIDataResponse<AttendanceItemModel> = try await APIClient.shared.request(endpoint: "/operations/attendance/\(id)/correction-request", method: "POST", body: CorrectionReq(reason: reason))
        await fetchTraineeData()
    }

    func submitCaseLog(diagnosis: String, specialtyAr: String?, complexity: String, participationLevel: String, procedureId: String?, departmentId: String?, notes: String?) async throws {
        let req = CreateClinicalCaseLogRequest(diagnosis: diagnosis, specialtyAr: specialtyAr, complexity: complexity, participationLevel: participationLevel, procedureId: procedureId, departmentId: departmentId, notes: notes)
        let _: APIDataResponse<ClinicalCaseLogItemModel> = try await APIClient.shared.request(endpoint: "/logbook/case-logs", method: "POST", body: req)
        await fetchTraineeData()
    }

    func completeMidpointMeeting(rotationId: String, notes: String?) async throws {
        struct MidpointNotesReq: Encodable { let notes: String? }
        let _: APIDataResponse<RotationModel> = try await APIClient.shared.request(endpoint: "/operations/evaluations/midpoint/\(rotationId)/complete", method: "PATCH", body: MidpointNotesReq(notes: notes))
        await fetchTrainerData()
    }

    func submitEvaluation(formId: String, evaluateeId: String, rotationId: String, totalScore: Double, notes: String?) async throws {
        let req = SubmitEvaluationRequest(formId: formId, evaluateeId: evaluateeId, rotationId: rotationId, totalScore: totalScore, notes: notes)
        let _: APIDataResponse<EvaluationItemModel> = try await APIClient.shared.request(endpoint: "/operations/evaluations", method: "POST", body: req)
        await fetchTrainerData()
    }

    func submitDepartmentEvaluation(departmentId: String, score: Double, notes: String?) async throws {
        struct DeptEvalReq: Encodable { let departmentId: String; let score: Double; let notes: String? }
        let _: APIDataResponse<EvaluationItemModel> = try await APIClient.shared.request(endpoint: "/operations/evaluations/department", method: "POST", body: DeptEvalReq(departmentId: departmentId, score: score, notes: notes))
        await fetchTraineeData()
    }

    // MARK: - طلبات التدريب الواردة (Cluster)

    /// قائمة طلبات التدريب الواردة للتجمع — مع حالات تحميل/خطأ/فارغ تُعرض في الشاشة.
    func fetchTrainingRequests() async {
        trainingRequestsLoading = true
        trainingRequestsError = nil
        do {
            let result: APIListResponse<TrainingRequestItem> = try await APIClient.shared.request(
                endpoint: "/training-requests?page=1&limit=100"
            )
            self.trainingRequests = result.data
            self.trainingRequestsLoaded = true
            print("✅ [AppStore] Training requests: \(result.data.count)")
        } catch {
            self.trainingRequestsError = error.localizedDescription
            print("❌ [AppStore] Failed to fetch training requests: \(error.localizedDescription)")
        }
        trainingRequestsLoading = false
    }

    func fetchTrainingRequestDetail(id: String) async {
        requestDetailLoading = true
        requestDetailError = nil
        do {
            let result: APIDataResponse<TrainingRequestItem> = try await APIClient.shared.request(
                endpoint: "/training-requests/\(id)"
            )
            self.trainingRequestDetail = result.data
            self.requestDetailLoaded = true
        } catch {
            self.requestDetailError = error.localizedDescription
        }
        requestDetailLoading = false
    }

    func fetchRequestTrainees(id: String) async {
        requestTraineesLoading = true
        requestTraineesError = nil
        do {
            let result: APIListResponse<TrainingRequestTraineeRow> = try await APIClient.shared.request(
                endpoint: "/training-requests/\(id)/trainees"
            )
            self.requestTrainees = result.data
            self.requestTraineesLoaded = true
        } catch {
            self.requestTraineesError = error.localizedDescription
        }
        requestTraineesLoading = false
    }

    /// بعد أي إجراء على الطلب: إعادة جلب التفاصيل والقائمة فقط (لا إعادة تحميل كامل للشاشة).
    private func refreshClusterRequests(after id: String) async {
        if requestDetailLoaded || trainingRequestDetail?.id == id {
            await fetchTrainingRequestDetail(id: id)
        }
        if trainingRequestsLoaded {
            await fetchTrainingRequests()
        }
    }

    /// الموافقة النهائية — ترمي الخطأ لعرضه في الشاشة (لا يُبتلع).
    func approveTrainingRequest(id: String) async throws {
        let _: TrainingRequestActionResult = try await APIClient.shared.request(endpoint: "/training-requests/\(id)/approve", method: "POST")
        self.requestActionResultMessage = "تمت الموافقة على طلب التدريب بنجاح"
        try await refreshClusterRequests(after: id)
    }

    /// رفض الطلب — الأدوار المخوَّلة فقط (Backend يفرض CLUSTER_ROLES).
    func rejectTrainingRequest(id: String, reason: String) async throws {
        let body = RejectTrainingRequestBody(reason: reason)
        let _: TrainingRequestActionResult = try await APIClient.shared.request(
            endpoint: "/training-requests/\(id)/reject", method: "POST", body: body
        )
        self.requestActionResultMessage = "تم رفض طلب التدريب"
        try await refreshClusterRequests(after: id)
    }

    func returnTrainingRequestToUniversity(id: String, notes: String) async throws {
        let body = ReturnTrainingRequestToUniversityBody(notes: notes)
        let _: TrainingRequestActionResult = try await APIClient.shared.request(
            endpoint: "/training-requests/\(id)/return-to-university", method: "POST", body: body
        )
        self.requestActionResultMessage = "أُعيد طلب التدريب للجامعة للتعديل"
        try await refreshClusterRequests(after: id)
    }

    func autoAllocateTrainingRequest(id: String) async throws {
        let _: TrainingRequestActionResult = try await APIClient.shared.request(endpoint: "/training-requests/\(id)/auto-allocate", method: "POST")
        self.requestActionResultMessage = "تم تنفيذ التوزيع التلقائي على المستشفيات"
        try await refreshClusterRequests(after: id)
    }

    // MARK: - لوحة قيادة التجمع (إحصاءات فعلية)

    func fetchClusterDashboard() async {
        clusterStatsLoading = true
        clusterStatsError = nil

        // الإحصاءات العامة للتجمع
        do {
            let stats: APIDataResponse<OrganizationStatisticsModel> = try await APIClient.shared.request(
                endpoint: "/organizations/statistics"
            )
            self.organizationStatistics = stats.data
        } catch {
            self.clusterStatsError = error.localizedDescription
            print("❌ [AppStore] Statistics failed: \(error.localizedDescription)")
        }

        // بطاقات المستشفيات (استجابة مصفوفة مكشوفة — لا تُغلَّف)
        do {
            let cards: [HospitalCardModel] = try await APIClient.shared.request(
                endpoint: "/organizations/hospitals-cards"
            )
            self.hospitalCards = cards
        } catch {
            if self.clusterStatsError == nil { self.clusterStatsError = error.localizedDescription }
            print("❌ [AppStore] Hospital cards failed: \(error.localizedDescription)")
        }

        // ملخص الخطوط الزمنية للتجمع (معدل الإنجاز، المعرضون للخطر، الروتيشنات النشطة)
        do {
            let timeline: APIDataResponse<ClusterTimelineDashboard> = try await APIClient.shared.request(
                endpoint: "/timeline/dashboard?scope=cluster"
            )
            self.clusterTimeline = timeline.data
        } catch {
            if self.clusterStatsError == nil { self.clusterStatsError = error.localizedDescription }
            print("❌ [AppStore] Cluster timeline failed: \(error.localizedDescription)")
        }

        clusterStatsLoading = false
        if clusterStatsError == nil { clusterStatsLoaded = true }
    }

    /// عدد الطلبات التي تحتاج إجراءً من التجمع (لعداد لوحة القيادة).
    var pendingTrainingRequestsCount: Int {
        trainingRequests.filter { $0.requestStatus.isProcessing }.count
    }

    // MARK: - وصول سريع

    var currentTrainee: Trainee? {
        guard let currentTraineeID else { return nil }
        return trainees.first { $0.id == currentTraineeID }
    }

    var currentTrainer: Trainer? {
        guard let currentTrainerID else { return nil }
        return trainers.first { $0.id == currentTrainerID }
    }

    func trainee(_ id: UUID) -> Trainee? {
        trainees.first { $0.id == id }
    }

    func trainer(_ id: UUID?) -> Trainer? {
        guard let id else { return nil }
        return trainers.first { $0.id == id }
    }

    func department(_ id: UUID?) -> Department? {
        guard let id else { return nil }
        return departments.first { $0.id == id }
    }

    func traineeRotations(for traineeID: UUID) -> [Rotation] {
        rotations.filter { $0.traineeID == traineeID }.sorted { $0.startDate < $1.startDate }
    }

    func currentRotation(for traineeID: UUID) -> Rotation? {
        traineeRotations(for: traineeID).first { $0.isCurrent }
    }

    func nextRotation(for traineeID: UUID) -> Rotation? {
        traineeRotations(for: traineeID).first { $0.startDate > Date() }
    }

    func traineeShifts(for traineeID: UUID) -> [Shift] {
        shifts.filter { $0.traineeID == traineeID }.sorted { $0.date < $1.date }
    }

    func todayShift(for traineeID: UUID) -> Shift? {
        traineeShifts(for: traineeID).first { Calendar.current.isDateInToday($0.date) }
    }

    func traineesOf(trainer trainerID: UUID) -> [Trainee] {
        trainees.filter { $0.trainerID == trainerID && $0.applicationStatus == .approved }
    }

    // MARK: - التسجيل والاعتماد

    /// اعتماد ملف المتدرب وإصدار الصلاحية والبطاقة
    func approveApplication(_ traineeID: UUID, months: Int = 12) {
        guard let idx = trainees.firstIndex(where: { $0.id == traineeID }) else { return }
        trainees[idx].applicationStatus = .approved
        trainees[idx].cardStatus = .active
        trainees[idx].accessExpiry = Calendar.current.date(byAdding: .month, value: months, to: Date()) ?? Date()
        for i in trainees[idx].documents.indices where trainees[idx].documents[i].status == .pending {
            trainees[idx].documents[i].status = .approved
        }
    }

    func requestCompletion(_ traineeID: UUID, note: String) {
        guard let idx = trainees.firstIndex(where: { $0.id == traineeID }) else { return }
        trainees[idx].applicationStatus = .incomplete
        if let d = trainees[idx].documents.firstIndex(where: { $0.status == .pending }) {
            trainees[idx].documents[d].reviewerNote = note
        }
    }

    func rejectApplication(_ traineeID: UUID, note: String) {
        guard let idx = trainees.firstIndex(where: { $0.id == traineeID }) else { return }
        trainees[idx].applicationStatus = .rejected
        trainees[idx].cardStatus = .notIssued
        _ = note
    }

    func suspendCard(_ traineeID: UUID) {
        guard let idx = trainees.firstIndex(where: { $0.id == traineeID }) else { return }
        trainees[idx].cardStatus = .suspended
    }

    func revokeCard(_ traineeID: UUID) {
        guard let idx = trainees.firstIndex(where: { $0.id == traineeID }) else { return }
        trainees[idx].cardStatus = .revoked
    }

    func reactivateCard(_ traineeID: UUID) {
        guard let idx = trainees.firstIndex(where: { $0.id == traineeID }) else { return }
        trainees[idx].cardStatus = .active
    }

    func updatePhoto(_ traineeID: UUID, data: Data?) {
        guard let idx = trainees.firstIndex(where: { $0.id == traineeID }) else { return }
        trainees[idx].photoData = data
    }

    func updateTrainee(_ trainee: Trainee) {
        guard let idx = trainees.firstIndex(where: { $0.id == trainee.id }) else { return }
        trainees[idx] = trainee
    }

    // MARK: - الإسناد

    func assign(trainee traineeID: UUID, to trainerID: UUID) {
        guard let idx = trainees.firstIndex(where: { $0.id == traineeID }) else { return }
        trainees[idx].trainerID = trainerID
    }

    /// عدد المتدربين لكل مدرب — لكشف اختلال التوزيع
    func load(of trainerID: UUID) -> Int {
        trainees.filter { $0.trainerID == trainerID }.count
    }

    var isLoadImbalanced: Bool {
        let loads = trainers.map { load(of: $0.id) }
        guard let mx = loads.max(), let mn = loads.min() else { return false }
        return mx - mn >= 3
    }

    func markMidpointMeetingDone(_ rotationID: UUID) {
        guard let idx = rotations.firstIndex(where: { $0.id == rotationID }) else { return }
        rotations[idx].midpointMeetingDone = true
    }

    func toggleObjective(_ rotationID: UUID, index: Int) {
        guard let idx = rotations.firstIndex(where: { $0.id == rotationID }) else { return }
        if rotations[idx].completedObjectives.contains(index) {
            rotations[idx].completedObjectives.remove(index)
        } else {
            rotations[idx].completedObjectives.insert(index)
        }
    }

    // MARK: - النداءات

    /// عدد نداءات المتدرب خلال الأسبوع الأخير — للتحقق من السقف
    func callsThisWeek(for traineeID: UUID) -> Int {
        let weekAgo = Date().addingTimeInterval(-7 * 24 * 3600)
        return calls.filter { call in
            call.launchedAt >= weekAgo && call.participants.contains { $0.traineeID == traineeID }
        }.count
    }

    /// هل يمكن إرسال نداء لهذا المتدرب الآن؟
    /// يمنع النظام الإرسال إذا كان في إجازة أو تجاوز السقف الأسبوعي.
    func canNotify(_ traineeID: UUID) -> (allowed: Bool, reason: String?) {
        if let shift = todayShift(for: traineeID), !shift.type.isReachable {
            return (false, "في إجازة اليوم")
        }
        if callsThisWeek(for: traineeID) >= weeklyCallCap {
            return (false, "تجاوز السقف الأسبوعي (\(weeklyCallCap))")
        }
        return (true, nil)
    }

    /// إطلاق نداء جديد
    @discardableResult
    func launchCall(type: CallType,
                    customTitle: String = "",
                    note: String = "",
                    location: String,
                    expectedMinutes: Int,
                    trainerID: UUID,
                    departmentID: UUID,
                    targets: [UUID]) -> TrainerCall {

        let allowed = targets.filter { canNotify($0).allowed }
        let stamp = Date()

        let participants = allowed.map { id in
            CallParticipant(traineeID: id, notifiedAt: stamp)
        }

        let call = TrainerCall(type: type,
                               customTitle: customTitle,
                               note: note,
                               location: location,
                               expectedMinutes: expectedMinutes,
                               trainerID: trainerID,
                               departmentID: departmentID,
                               launchedAt: stamp,
                               endedAt: nil,
                               participants: participants)
        calls.insert(call, at: 0)
        return call
    }

    /// الخطوة ٣ — المتدرب يضغط «قادم»
    func acknowledge(callID: UUID, traineeID: UUID) {
        mutate(callID: callID, traineeID: traineeID) { p in
            guard p.ackAt == nil else { return }
            p.ackAt = Date()
            p.state = .acknowledged
        }
    }

    /// المتدرب يضغط «لا أستطيع» — لا يُحتسب غياباً
    func decline(callID: UUID, traineeID: UUID, reason: String) {
        mutate(callID: callID, traineeID: traineeID) { p in
            p.state = .declined
            p.declineReason = reason
        }
    }

    /// الخطوة ٥ — المتدرب يضغط «وصلت»
    func markSelfArrived(callID: UUID, traineeID: UUID) {
        mutate(callID: callID, traineeID: traineeID) { p in
            guard p.selfArrivedAt == nil else { return }
            p.selfArrivedAt = Date()
            if p.ackAt == nil { p.ackAt = Date() }
            if p.state != .confirmed { p.state = .selfArrived }
        }
    }

    /// الخطوة ٦ — المدرب يضغط على الاسم لتأكيد الحضور فعلياً
    func confirmArrival(callID: UUID, traineeID: UUID) {
        mutate(callID: callID, traineeID: traineeID) { p in
            guard p.confirmedAt == nil else { return }
            p.confirmedAt = Date()
            if p.ackAt == nil { p.ackAt = Date() }
            p.state = .confirmed
        }
    }

    func endCall(_ callID: UUID) {
        guard let idx = calls.firstIndex(where: { $0.id == callID }) else { return }
        calls[idx].endedAt = Date()
    }

    private func mutate(callID: UUID, traineeID: UUID, _ change: (inout CallParticipant) -> Void) {
        guard let ci = calls.firstIndex(where: { $0.id == callID }),
              let pi = calls[ci].participants.firstIndex(where: { $0.traineeID == traineeID })
        else { return }
        change(&calls[ci].participants[pi])
    }

    /// النداءات النشطة التي يشارك فيها هذا المتدرب ولم يحسم موقفه أو لم يصل بعد
    func activeCalls(for traineeID: UUID) -> [TrainerCall] {
        calls.filter { call in
            guard call.isActive else { return false }
            guard let p = call.participants.first(where: { $0.traineeID == traineeID }) else { return false }
            return p.state != .declined && p.state != .confirmed
        }
    }

    func trainerCalls(by trainerID: UUID) -> [TrainerCall] {
        calls.filter { $0.trainerID == trainerID }
    }

    func traineeCalls(involving traineeID: UUID) -> [TrainerCall] {
        calls.filter { call in call.participants.contains { $0.traineeID == traineeID } }
    }

    // MARK: - مؤشر الحرص

    func diligence(for traineeID: UUID) -> DiligenceScore {
        let mine = traineeCalls(involving: traineeID)
        let parts = mine.compactMap { c in c.participants.first { $0.traineeID == traineeID } }
        guard !parts.isEmpty else {
            return DiligenceScore(responseRate: 0, averageAckSeconds: nil,
                                  averageArrivalSeconds: nil, attendanceRate: 0, totalCalls: 0)
        }

        // الاعتذار المبرر لا يُحتسب ضمن مقام النسبة
        let counted = parts.filter { $0.state != .declined }
        let denominator = max(1, counted.count)

        let acked = counted.filter { $0.ackAt != nil }.count
        let arrived = counted.filter { $0.hasArrived }.count

        let ackValues = counted.compactMap(\.ackSeconds)
        let arrivalValues = counted.compactMap { $0.confirmedArrivalSeconds ?? $0.selfArrivalSeconds }

        return DiligenceScore(
            responseRate: Double(acked) / Double(denominator),
            averageAckSeconds: ackValues.isEmpty ? nil : ackValues.reduce(0, +) / ackValues.count,
            averageArrivalSeconds: arrivalValues.isEmpty ? nil : arrivalValues.reduce(0, +) / arrivalValues.count,
            attendanceRate: Double(arrived) / Double(denominator),
            totalCalls: parts.count
        )
    }

    // MARK: - التقييم

    func traineeEvaluations(for traineeID: UUID) -> [Evaluation] {
        evaluations.filter { $0.traineeID == traineeID }.sorted { $0.submittedAt > $1.submittedAt }
    }

    func submitEvaluation(_ evaluation: Evaluation) {
        evaluations.append(evaluation)
    }

    func submitFeedback(_ feedback: DepartmentFeedback) {
        departmentFeedback.append(feedback)
    }

    /// هل أغلق المتدرب تقييمه للقسم؟ — القفل المتبادل
    func hasFeedback(rotationID: UUID) -> Bool {
        departmentFeedback.contains { $0.rotationID == rotationID }
    }

    /// متوسط تقييم القسم من المتدربين — تصنيف الأقسام التدريبية
    func departmentRating(_ departmentID: UUID) -> Double? {
        let items = departmentFeedback.filter { $0.departmentID == departmentID }
        guard !items.isEmpty else { return nil }
        return items.map(\.average).reduce(0, +) / Double(items.count)
    }

    /// عدد التقييمات المشبوهة لكل مُقيِّم — كاشف التقييم الآلي
    func suspiciousEvaluationCount(evaluatorID: UUID) -> Int {
        evaluations.filter { $0.evaluatorID == evaluatorID && $0.isSuspicious }.count
    }

    // MARK: - الإنذار المبكر للتعثّر

    struct RiskFlag: Identifiable {
        let id = UUID()
        var traineeID: UUID
        var reasons: [String]
    }

    /// يجمع: تقييمات منخفضة + مؤشر حرص ضعيف + أهداف غير مكتملة
    var riskFlags: [RiskFlag] {
        var result: [RiskFlag] = []
        for t in trainees where t.applicationStatus == .approved {
            var reasons: [String] = []

            let evals = traineeEvaluations(for: t.id)
            if let last = evals.first, last.average < 3.0 {
                reasons.append("آخر تقييم أقل من ٣ من ٥")
            }

            let d = diligence(for: t.id)
            if d.totalCalls >= 2 && d.value < 55 {
                reasons.append("مؤشر حرص منخفض (\(d.value))")
            }

            if let rot = currentRotation(for: t.id),
               let dept = department(rot.departmentID),
               rot.progress > 0.5,
               rot.completedObjectives.count < dept.objectives.count / 2 {
                reasons.append("أقل من نصف الأهداف مكتملة بعد منتصف الدورة")
            }

            if let rot = currentRotation(for: t.id), rot.progress > 0.6, !rot.midpointMeetingDone {
                reasons.append("لم يُنفَّذ اجتماع منتصف الدورة")
            }

            if !reasons.isEmpty {
                result.append(RiskFlag(traineeID: t.id, reasons: reasons))
            }
        }
        return result
    }

    /// خطة تحسين مقترحة تلقائياً بناءً على أسباب الإنذار
    func suggestedPlan(for flag: RiskFlag) -> ImprovementPlan {
        var goals: [String] = []
        for r in flag.reasons {
            if r.contains("تقييم") {
                goals.append("جلسة مراجعة أسبوعية مع المدرب الأساس لمدة ٤ أسابيع")
                goals.append("إعادة تقييم مصغّر بعد أسبوعين")
            }
            if r.contains("حرص") {
                goals.append("الالتزام بالرد على النداءات خلال ٦٠ ثانية")
                goals.append("رفع نسبة الحضور المؤكَّد إلى ٨٠٪ خلال شهر")
            }
            if r.contains("الأهداف") {
                goals.append("إنجاز الأهداف المتبقية بجدول أسبوعي معتمد")
            }
            if r.contains("منتصف الدورة") {
                goals.append("عقد اجتماع منتصف الدورة خلال ٧ أيام")
            }
        }
        if goals.isEmpty { goals = ["متابعة عامة لمدة شهر"] }

        return ImprovementPlan(
            traineeID: flag.traineeID,
            reason: flag.reasons.joined(separator: " • "),
            goals: Array(Set(goals)).sorted(),
            startDate: Date(),
            endDate: Calendar.current.date(byAdding: .day, value: 30, to: Date()) ?? Date(),
            progress: 0
        )
    }

    func adopt(_ plan: ImprovementPlan) {
        improvementPlans.append(plan)
    }

    // MARK: - الحضور

    func checkIn(_ traineeID: UUID, method: String) {
        let today = Date()
        if let idx = attendance.firstIndex(where: {
            $0.traineeID == traineeID && Calendar.current.isDateInToday($0.date)
        }) {
            if attendance[idx].checkIn == nil { attendance[idx].checkIn = today }
        } else {
            let hour = Calendar.current.component(.hour, from: today)
            attendance.append(AttendanceRecord(traineeID: traineeID,
                                               date: today,
                                               checkIn: today,
                                               checkOut: nil,
                                               method: method,
                                               isLate: hour >= 8))
        }
    }

    func checkOut(_ traineeID: UUID) {
        guard let idx = attendance.firstIndex(where: {
            $0.traineeID == traineeID && Calendar.current.isDateInToday($0.date)
        }) else { return }
        attendance[idx].checkOut = Date()
    }

    func attendanceLog(for traineeID: UUID) -> [AttendanceRecord] {
        attendance.filter { $0.traineeID == traineeID }.sorted { $0.date > $1.date }
    }

    func todayAttendance(for traineeID: UUID) -> AttendanceRecord? {
        attendance.first { $0.traineeID == traineeID && Calendar.current.isDateInToday($0.date) }
    }

    func attendanceRate(for traineeID: UUID) -> Double {
        let records = attendanceLog(for: traineeID)
        guard !records.isEmpty else { return 0 }
        let present = records.filter { $0.checkIn != nil }.count
        return Double(present) / Double(records.count)
    }
}
