//
//  APIModels.swift
//  Miran
//
//  Codable models matching the Miran Enterprise Backend API schema (v3.0).
//

import Foundation

// MARK: - Auth & User Requests & Responses
struct LoginRequest: Encodable {
    let email: String
    let password: String
    let mfaCode: String?
}

struct SwitchOrgRequest: Encodable {
    let organizationId: String
}

struct LaunchCallRequest: Encodable {
    let callType: String
    let customTitle: String?
    let note: String?
    let location: String?
    let expectedMinutes: Int
}

struct LoginResponse: Codable {
    let user: UserProfileResponse
    let tokens: TokenPair
}

struct TokenPair: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: String
}

struct UserProfileResponse: Codable, Identifiable {
    let id: String
    let personId: String
    let nameAr: String
    let nameEn: String?
    let email: String
    // ─── RBAC — الأدوار والصلاحيات القادمة من Backend ───────────
    let roles: [String]
    let permissions: [String]
    /// الصلاحيات الدقيقة (Fine-Grained Capabilities) كما يرسلها Backend في /auth/me و /auth/login.
    /// المصدر الموثوق هو Backend — تُستخدم هنا فقط كبوابة عرض للإجراءات المسموحة للشاشة.
    let capabilities: [String]
    // ─────────────────────────────────────────────────────────────
    let activeOrganization: UserOrgResponse
    let availableOrganizations: [UserOrgResponse]

    // ── وصول سريع للأدوار ──────────────────────────────────────
    var isPlatformOwner:            Bool { roles.contains("platform_owner") || roles.contains("system_admin") || roles.contains("holding_administrator") }
    var isUniversityAdmin:          Bool { roles.contains("university_administrator") || roles.contains("university_admin") || roles.contains("academic_affairs") }
    var isTrainingDirector:         Bool { roles.contains("training_director") || roles.contains("cluster_administrator") || roles.contains("cluster_manager") || roles.contains("org_manager") }
    var isHospitalTrainingAdmin:    Bool { roles.contains("hospital_training_admin") || roles.contains("hospital_administrator") || roles.contains("hospital_supervisor") || roles.contains("training_supervisor") || roles.contains("department_head") }
    var isAcademicSupervisor:       Bool { roles.contains("academic_supervisor") }
    var isTrainer:                  Bool { roles.contains("trainer") }
    var isTrainee:                  Bool { roles.contains("trainee") }

    var canLaunchCalls:      Bool { isTrainer || isTrainingDirector || isHospitalTrainingAdmin }
    var canManageAccounts:   Bool { isPlatformOwner || isTrainingDirector || isHospitalTrainingAdmin || isUniversityAdmin }
    var canViewActiveCalls:  Bool { isTrainer || isTrainingDirector || isHospitalTrainingAdmin }
    var canRespondToCalls:   Bool { isTrainee }

    /// أعلى دور للمستخدم (لتحديد التبويبة الرئيسية)
    var primaryRole: String {
        if isPlatformOwner           { return "platform_owner" }
        if isUniversityAdmin         { return "university_administrator" }
        if isTrainingDirector        { return "training_director" }
        if isHospitalTrainingAdmin   { return "hospital_training_admin" }
        if isAcademicSupervisor      { return "academic_supervisor" }
        if isTrainer                 { return "trainer" }
        if isTrainee                 { return "trainee" }
        return roles.first ?? "unknown"
    }
}

struct UserOrgResponse: Codable, Identifiable, Hashable {
    let id: String
    let code: String?
    let nameAr: String?
    let nameEn: String?
    let isPrimary: Bool?

    var displayName: String { nameAr ?? nameEn ?? code ?? id }
    var displayCode: String { code ?? "—" }
}

// MARK: - Person
struct PersonModel: Codable, Identifiable {
    let id: String
    let nationalId: String?
    let nameAr: String?
    let nameEn: String?
    let email: String?
    let phone: String?
    let bloodType: String?
    let emergencyContactName: String?
    let emergencyContactPhone: String?

    var displayName: String { nameAr ?? nameEn ?? email ?? id }
}

// MARK: - Organization
struct OrganizationModel: Codable, Identifiable {
    let id: String
    let code: String?
    let nameAr: String?
    let nameEn: String?
    let status: String?
    let cityAr: String?
    let regionAr: String?
    let contactEmail: String?
    let contactPhone: String?

    var displayName: String { nameAr ?? nameEn ?? code ?? id }
    var displayCode: String { code ?? "—" }
    var displayStatus: String { status ?? "ACTIVE" }
}

// MARK: - Trainee Profile
struct TraineeProfileModel: Codable, Identifiable {
    let id: String
    let personId: String
    let organizationId: String
    let traineeNumber: String
    let level: String
    let specialtyAr: String?
    let specialtyEn: String?
    let applicationStatus: String
    let cardStatus: String
    let cardUuid: String?
    let cardSignature: String?
    let accessStartDate: String?
    let accessEndDate: String?
    let photoApproved: Bool
    let person: PersonModel?
    let organization: OrganizationModel?
    let rotations: [RotationModel]?

    /// Active rotation (first with status == "active")
    var activeRotation: RotationModel? {
        rotations?.first(where: { $0.status == "active" }) ?? rotations?.first
    }
}

// MARK: - Trainer Profile
struct TrainerProfileModel: Codable, Identifiable {
    let id: String
    let personId: String
    let organizationId: String
    let departmentId: String?
    let titleAr: String?
    let extensionNumber: String?
    let maxTrainees: Int
    let specialization: String?
    let person: PersonModel?
}

// MARK: - Rotation
struct RotationModel: Codable, Identifiable {
    let id: String
    let organizationId: String
    let traineeProfileId: String
    let departmentId: String
    let trainerProfileId: String
    let startDate: String
    let endDate: String
    let status: String
    let midpointMeetingDone: Bool
    let department: DepartmentModel?
    let trainerProfile: TrainerProfileModel?
    let traineeProfile: TraineeProfileModel?
}

// MARK: - Department
struct DepartmentModel: Codable, Identifiable {
    let id: String
    let nameAr: String
    let nameEn: String?
    let code: String?
    let capacity: Int
    let roundLocation: String?
    let roundTime: String?
    let meetingRoom: String?
}

// MARK: - Attendance
struct AttendanceModel: Codable, Identifiable {
    let id: String
    let date: String
    let checkIn: String?
    let checkOut: String?
    let isLate: Bool
    let lateMinutes: Int?
    let status: String
    let excuseReason: String?
}

// MARK: - Call System
struct TrainerCallModel: Codable, Identifiable {
    let id: String
    let callType: String
    let customTitle: String?
    let note: String?
    let location: String?
    let expectedMinutes: Int?
    let launchedAt: String
    let endedAt: String?
    let status: String
    let participants: [CallParticipantModel]?
}

struct CallParticipantModel: Codable, Identifiable {
    let id: String
    let callId: String
    let traineeProfileId: String
    let state: String
    let notifiedAt: String
    let ackAt: String?
    let selfArrivedAt: String?
    let confirmedAt: String?
}

// MARK: - Evaluation
struct EvaluationModel: Codable, Identifiable {
    let id: String
    let evaluationType: String
    let totalScore: Double?
    let comments: String?
    let isSuspicious: Bool
    let submittedAt: String
}

// MARK: - Document
struct DocumentModel: Codable, Identifiable {
    let id: String
    let documentType: String
    let titleAr: String
    let storageKey: String
    let isMandatory: Bool
    let status: String
    let expiryDate: String?
}

// MARK: - Notification
struct NotificationModel: Codable, Identifiable {
    let id: String
    let titleAr: String
    let bodyAr: String?
    let type: String
    let isRead: Bool
    let createdAt: String
}

// MARK: - Clinical Logbook & Procedures & Competencies
struct ProcedureCatalogModel: Codable, Identifiable {
    let id: String
    let code: String
    let titleAr: String
    let titleEn: String
    let category: String
    let minRequired: Int
}

struct ClinicalCaseLogModel: Codable, Identifiable {
    let id: String
    let diagnosis: String
    let patientAge: Int?
    let patientGender: String?
    let specialtyAr: String?
    let complexity: String
    let participationLevel: String
    let status: String
    let notes: String?
    let performedAt: String
    let procedure: ProcedureCatalogModel?
    let department: DepartmentModel?
}

struct CompetencyProgressModel: Codable, Identifiable {
    let id: String
    let requiredCount: Int
    let completedCount: Int
    let status: String
    let procedure: ProcedureCatalogModel?
}

struct CompetencyPortfolioResponse: Codable {
    let overallPercentage: Int
    let totalRequired: Int
    let totalCompleted: Int
    let data: [CompetencyProgressModel]
}

// MARK: - Audit Log
struct AuditLogModel: Codable, Identifiable {
    let id: String
    let action: String
    let entityType: String
    let entityId: String?
    let userEmail: String?
    let userRole: String?
    let ipAddress: String?
    let timestamp: String
}

// MARK: - Organization Create & Update DTOs
struct CreateOrganizationRequest: Encodable {
    let code: String
    let nameAr: String
    let nameEn: String?
    let type: String
    let cityAr: String?
    let regionAr: String?
    let contactEmail: String?
    let contactPhone: String?
}

struct UpdateOrganizationRequest: Encodable {
    let nameAr: String?
    let nameEn: String?
    let status: String?
    let cityAr: String?
    let regionAr: String?
    let contactEmail: String?
    let contactPhone: String?
}

// MARK: - Department Create DTO
struct CreateDepartmentRequest: Encodable {
    let nameAr: String
    let nameEn: String?
    let code: String?
    let capacity: Int
    let roundLocation: String?
    let roundTime: String?
    let meetingRoom: String?
}

// MARK: - User Account Create DTO
struct CreateUserAccountRequest: Encodable {
    let nationalId: String
    let nameAr: String
    let email: String
    let phone: String
    let roleCode: String
    let organizationId: String
}

// MARK: - Clinical Case Create DTO
struct CreateClinicalCaseRequest: Encodable {
    let diagnosis: String
    let specialtyAr: String?
    let complexity: String
    let participationLevel: String
    let procedureId: String?
    let departmentId: String?
    let notes: String?
}

// MARK: - Clinical & Academic Task
struct TaskModel: Codable, Identifiable {
    let id: String
    let titleAr: String
    let descriptionAr: String?
    let dueDate: String
    let departmentName: String?
    let competencyName: String?
    let status: String // pending, submitted, approved, rejected
    let assignedTraineeId: String?
}

// MARK: - Auto Rotation Plan
struct AutoRotationPlanModel: Codable, Identifiable {
    let id: String
    let programName: String
    let totalMonths: Int
    let rotationsList: [RotationSlot]
}

struct RotationSlot: Codable, Identifiable {
    var id: String { departmentCode }
    let departmentName: String
    let departmentCode: String
    let durationMonths: Int
}

// MARK: - Comprehensive System Dashboard Metrics
struct DashboardMetricsModel: Codable {
    let totalOrganizations: Int
    let totalUniversities: Int
    let totalHospitals: Int
    let totalDepartments: Int
    let totalPrograms: Int
    let totalIntakes: Int
    let totalTrainees: Int
    let totalTrainers: Int
    let totalSupervisors: Int
    let totalUsers: Int
    let totalCalls: Int
    let totalClinicalCases: Int
    let totalApprovedLogbooks: Int
}

// MARK: - API Response Wrapper
struct APIListResponse<T: Codable>: Codable {
    let data: [T]
}



// MARK: - Training Colleague (GET /trainees/my-colleagues)
struct TrainingColleagueModel: Codable, Identifiable {
    var id: String { traineeProfileId }
    let traineeProfileId: String
    let nameAr: String
    let nameEn: String?
    let specialty: String?
    let departmentNameAr: String
    let trainingStatus: String
    let academicNumber: String?
}

// MARK: - Card QR token (GET /trainees/card/qr-token)
struct CardQrTokenModel: Codable {
    let token: String
}

// MARK: - Single-object API response wrapper (mirrors APIListResponse for non-array payloads)
struct APIDataResponse<T: Codable>: Codable {
    let data: T
}

// MARK: - Trainer assignment request (GET /operations/trainer/assignment-requests)
struct AssignmentRequestModel: Codable, Identifiable {
    let id: String
    let traineeProfileId: String
    let startDate: String
    let endDate: String
    let status: String
    let traineeProfile: TraineeProfileModel?
    let department: DepartmentModel?
    let organization: OrganizationModel?
}

// MARK: - Training Requests (طلبات التدريب الواردة للتجمع الصحي)
// التطابق مع واجهة Backend: GET /training-requests, GET /training-requests/:id,
// GET /training-requests/:id/trainees، وأحداث الموافقة/الرفض/الإعادة/التوزيع.

struct TrainingProgramModel: Codable, Identifiable {
    let id: String
    let code: String?
    let nameAr: String?
    let nameEn: String?
    let programType: String?
    let durationMonths: Int?
    let isActive: Bool?
    let organizationId: String?
}

struct AcademicIntakeModel: Codable, Identifiable {
    let id: String
    let code: String?
    let nameAr: String?
    let nameEn: String?
    let academicYear: String?
    let status: String?
    let capacity: Int?
    let programId: String?

    var displayName: String { nameAr ?? nameEn ?? code ?? id }
    var displayCode: String { code ?? "—" }
}

/// عنصر توزيع داخل حقل `allocations` لطلب التدريب (توزيع المقاعد على المستشفيات).
struct TrainingRequestAllocation: Codable, Identifiable {
    let hospitalId: String?
    let hospitalCode: String?
    let hospitalName: String?
    let allocatedSeats: Int?
    let seats: Int?
    let capacity: Int?
    let occupied: Int?
    let available: Int?
    let allocated: Bool?
    let reason: String?

    var effectiveSeats: Int { allocatedSeats ?? seats ?? capacity ?? 0 }
    var id: String { hospitalId ?? hospitalCode ?? hospitalName ?? UUID().uuidString }
}

/// حقل `notes` في واجهة Backend عبارة عن JSON مُرمَّز كنص — يُفكَّك عند العرض فقط.
struct RequestNotesPayload: Codable {
    let text: String?
    let requestType: String?
    let clusterLetterUrl: String?
    let attachmentUrls: [String]?
}

struct TrainingRequestItem: Codable, Identifiable {
    let id: String
    let requestNumber: String?
    let sourceOrgId: String?
    let targetOrgId: String?
    let programId: String?
    let academicIntakeId: String?
    let studentCount: Int?
    let priority: String?
    let status: String?
    let notes: String?
    let allocations: [TrainingRequestAllocation]?
    let trainingStartDate: String?
    let trainingEndDate: String?
    let expectedGraduationDate: String?
    let specialty: String?
    let sourceOrg: OrganizationModel?
    let targetOrg: OrganizationModel?
    let program: TrainingProgramModel?
    let academicIntake: AcademicIntakeModel?
    let createdAt: String?
    let updatedAt: String?
    let createdById: String?
    let updatedById: String?

    var displayRequestNumber: String { requestNumber ?? "TR-—" }
    var count: Int { studentCount ?? 0 }

    var notesPayload: RequestNotesPayload? {
        guard let notes, let data = notes.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(RequestNotesPayload.self, from: data)
    }

    var requestStatus: TrainingRequestStatus { TrainingRequestStatus(rawValue: status ?? "") ?? .unknown }

    /// هل الطلب «وارد» فعلاً إلى جهة المستخدم الحالية؟ (المصدر = مصدر التحقق من نطاق الصلاحيات)
    var isIncoming: Bool {
        sourceOrg?.id != targetOrg?.id
    }
}

/// حالات طلب التدريب مطابقة تماماً لقيم Backend (state-machine).
enum TrainingRequestStatus: String, CaseIterable, Identifiable {
    case draft
    case submitted
    case underClusterReview = "under_cluster_review"
    case returnedToUniversity = "returned_to_university"
    case resubmitted
    case rejected
    case autoAllocated = "auto_allocated"
    case allocated
    case manuallyReallocated = "manually_reallocated"
    case approved
    case hospitalAccepted = "hospital_accepted"
    case hospitalAdministratorAccepted = "hospital_administrator_accepted"
    case hospitalReturnedToCluster = "hospital_returned_to_cluster"
    case supervisorAccepted = "supervisor_accepted"
    case trainingSupervisorAccepted = "training_supervisor_accepted"
    case trainerAccepted = "trainer_accepted"
    case active
    case graduated
    case unknown

    var id: String { rawValue }

    var arabicLabel: String {
        switch self {
        case .draft: return "مسودة"
        case .submitted: return "مُرسل — في انتظار التجمع"
        case .underClusterReview: return "قيد مراجعة التجمع"
        case .returnedToUniversity: return "أُعيد للجامعة"
        case .resubmitted: return "أُعيد إرساله من الجامعة"
        case .rejected: return "مرفوض"
        case .autoAllocated: return "تم التوزيع التلقائي"
        case .allocated: return "تم التوزيع"
        case .manuallyReallocated: return "أُعيد توزيعه يدوياً"
        case .approved: return "معتمد"
        case .hospitalAccepted: return "قَبِل المستشفى"
        case .hospitalAdministratorAccepted: return "قَبِل مدير المستشفى"
        case .hospitalReturnedToCluster: return "أُعيد للتجمع من المستشفى"
        case .supervisorAccepted: return "قَبِل المشرف"
        case .trainingSupervisorAccepted: return "قَبِل مشرف التدريب"
        case .trainerAccepted: return "قَبِل المدرب"
        case .active: return "تدريب فعلي"
        case .graduated: return "متخرج"
        case .unknown: return rawValue
        }
    }

    // انتقالات Backend (TRAINING_REQUEST_TRANSITIONS) — تُستخدم فقط كبوابة عرض.
    var canBeApproved: Bool {
        [.submitted, .underClusterReview, .autoAllocated, .allocated, .manuallyReallocated].contains(self)
    }
    var canBeAutoAllocated: Bool {
        [.submitted, .underClusterReview, .hospitalReturnedToCluster, .manuallyReallocated].contains(self)
    }
    var canBeReturned: Bool {
        [.submitted, .underClusterReview, .autoAllocated, .allocated].contains(self)
    }
    var canBeRejected: Bool {
        [.submitted, .underClusterReview, .autoAllocated, .allocated, .manuallyReallocated, .approved].contains(self)
    }
    /// الطلبات التي تحتاج إجراءً من التجمع الآن (تُعرض في عداد لوحة القيادة).
    var isProcessing: Bool {
        [.submitted, .underClusterReview, .autoAllocated, .allocated, .manuallyReallocated, .hospitalReturnedToCluster].contains(self)
    }
    var isFinal: Bool { [.rejected, .graduated].contains(self) }

    /// الفلترة الأساسية في الشاشة.
    enum Group: String, CaseIterable, Identifiable {
        case all = "الكل"
        case processing = "قيد المعالجة"
        case approved = "معتمد"
        case returned = "أُعيد للجامعة"
        case rejected = "مرفوض"

        var id: String { rawValue }
    }

    var group: Group {
        switch self {
        case .approved: return .approved
        case .returnedToUniversity: return .returned
        case .rejected: return .rejected
        default: return isProcessing ? .processing : .all
        }
    }
}

/// بوابة عرض محلية تطابق سلطة Backend تماماً — ليست تغييراً في RBAC.
/// Backend يبقى المصدر الموثوق للتنفيذ (أي إجراء غير مسموح يرجع 403).
struct ClusterRequestActionPolicy {
    let capabilities: Set<String>
    let roles: Set<String>
    let status: TrainingRequestStatus

    /// الأدوار التي يسمح لها Backend برفض الطلب نهائياً (CLUSTER_ROLES).
    private static let clusterRejectRoles: Set<String> = ["cluster_administrator", "training_director", "platform_owner"]

    var canApprove: Bool { capabilities.contains("training_request.approve") && status.canBeApproved }
    var canAutoAllocate: Bool { capabilities.contains("allocation.cluster.auto") && status.canBeAutoAllocated }
    var canReturnToUniversity: Bool { capabilities.contains("training_request.return") && status.canBeReturned }
    var canReject: Bool { !roles.isDisjoint(with: Self.clusterRejectRoles) && status.canBeRejected }
    var hasAnyAction: Bool { canApprove || canAutoAllocate || canReturnToUniversity || canReject }
}

/// صفوف المتدربين داخل دفعة الطلب (GET /training-requests/:id/trainees).
struct TrainingRequestTraineeRow: Codable, Identifiable {
    let id: String
    let trainingRequestId: String
    let personId: String?
    let traineeProfileId: String?
    let academicNumber: String?
    let nationalId: String?
    let nameAr: String?
    let nameEn: String?
    let gender: String?
    let universityOrgId: String?
    let collegeOrgId: String?
    let internshipProgram: String?
    let specialty: String?
    let gpa: Double?
    let mobile: String?
    let email: String?
    let trainingPeriod: String?
    let startDate: String?
    let endDate: String?
    let priority: String?
    let status: String
    let validationErrors: [TraineeValidationErrorItem]?
    let clusterInternalNotes: String?
    let officialComments: String?
    let returnReason: String?
    let requiredDocuments: [String]?
    let correctionDeadline: String?
    let assignedHospitalId: String?
    let assignedDepartmentId: String?
    let assignedTrainerProfileId: String?
    let assignedSupervisorAccountId: String?
    let mergedIntoId: String?
    let splitFromId: String?
    let documents: [TraineeRowDocument]?
    let university: OrganizationModel?
    let college: OrganizationModel?
    let assignedHospital: OrganizationModel?
}

struct TraineeValidationErrorItem: Codable, Identifiable {
    let code: String?
    let field: String?
    let messageAr: String?

    var id: String { "\(field ?? "f")-\(code ?? "c")-\(messageAr ?? "m")" }
}

/// وثيقة مرتبطة بصف متدرب — النموذج من Backend (Document).
struct TraineeRowDocument: Codable, Identifiable {
    let id: String
    let documentType: String?
    let titleAr: String?
    let titleEn: String?
    let storageKey: String?
    let isMandatory: Bool?
    let hasExpiry: Bool?
    let issueDate: String?
    let expiryDate: String?
    let status: String?
    let reviewerNote: String?
}

// MARK: - Training Request Action Bodies & Response
struct RejectTrainingRequestBody: Encodable {
    let reason: String
}

struct ReturnTrainingRequestToUniversityBody: Encodable {
    let notes: String
}

struct TrainingRequestActionResult: Codable {
    let data: TrainingRequestItem?
    let success: Bool?
    let message: String?
}

// MARK: - Cluster Dashboard (لوحة قيادة التجمع)
// GET /organizations/statistics → { data: {...} }
struct OrganizationStatisticsModel: Codable {
    let totalOrganizations: Int
    let activeOrganizations: Int
    let inactiveOrganizations: Int
    let universities: Int
    let clusters: Int
    let hospitals: Int
    let totalCapacity: Int
    let totalTrainees: Int
    let hospitalTrainees: Int
    let totalTrainers: Int
    let totalDepartments: Int
    let availableSeats: Int
    let occupancyPercentage: Double
    let pressuredHospitals: Int
    let hospitalsWithoutCapacity: Int
}

// GET /organizations/hospitals-cards → bare array (لا يُغلَّف بـ {data})
struct HospitalDepartmentSummary: Codable, Identifiable {
    let id: String
    let nameAr: String
    let capacity: Int
}

struct HospitalCardModel: Codable, Identifiable {
    let id: String
    let code: String
    let nameAr: String
    let nameEn: String?
    let cityAr: String?
    let status: String?
    let capacity: Int
    let occupied: Int
    let available: Int
    let occupancyPercentage: Double?
    let departmentsCount: Int
    let departments: [HospitalDepartmentSummary]?
    let trainerCount: Int
    let supervisorCount: Int
}

// GET /timeline/dashboard?scope=cluster → { data: {...} }
struct ClusterTimelineDashboard: Codable {
    let atRisk: Int
    let averageCompletion: Double
    let averageGraduationProgress: Double?
    let graduated: Int
    let offTrack: Int
    let onTrack: Int
    let readyForGraduation: Int
    let rotationsActive: Int
    let traineeCount: Int
    let scope: String?
    let organizationId: String?
    let trainees: [ClusterTimelineTrainee]?
}

struct ClusterTimelineTrainee: Codable, Identifiable {
    let completionPercentage: Double?
    let current: String?
    let expectedGraduationDate: String?
    let graduationProgress: Double?
    let readiness: String?
    let trainingStartDate: String?
    let trainingEndDate: String?
    let trainee: TraineeProfileModel?
    let program: TrainingProgramModel?

    var id: String { trainee?.id ?? "\(current ?? "c")-\(completionPercentage ?? 0)" }
}

// MARK: - Operational Shift Model (GET /operations/schedule, POST /operations/shifts)
struct ShiftItemModel: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let traineeProfileId: String?
    let departmentId: String?
    let date: String
    let shiftType: String // morning, evening, night, call_24h
    let startTime: String?
    let endTime: String?
    let department: DepartmentModel?
    let traineeProfile: TraineeProfileModel?
}

// MARK: - Attendance Record Model (GET /operations/attendance, POST /operations/attendance/check-in)
struct AttendanceItemModel: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let traineeProfileId: String?
    let shiftId: String?
    let date: String
    let checkIn: String?
    let checkOut: String?
    let method: String?
    let isLate: Bool?
    let lateMinutes: Int?
    let status: String // present, absent, late, correction_requested, rejected
    let excuseReason: String?
    let approvedById: String?
    let traineeProfile: TraineeProfileModel?
    let shift: ShiftItemModel?
}

// MARK: - Clinical Case Log Model (GET /logbook/case-logs, POST /logbook/case-logs)
struct ClinicalCaseLogItemModel: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let traineeProfileId: String?
    let trainerProfileId: String?
    let departmentId: String?
    let diagnosis: String
    let specialtyAr: String?
    let complexity: String? // low, medium, high
    let participationLevel: String? // observer, assistant, primary
    let status: String // submitted, approved, rejected, modification_requested
    let notes: String?
    let submittedAt: String?
    let traineeProfile: TraineeProfileModel?
    let trainerProfile: TrainerProfileModel?
    let department: DepartmentModel?
}

// MARK: - Procedure Catalog Item (GET /logbook/procedures)
struct ProcedureCatalogItemModel: Codable, Identifiable {
    let id: String
    let code: String
    let titleAr: String
    let titleEn: String?
    let category: String
    let minRequired: Int?
    let descriptionAr: String?
}

// MARK: - Evaluation Form & Item Models (GET /operations/evaluations)
struct EvaluationFormItemModel: Codable, Identifiable {
    let id: String
    let titleAr: String
    let titleEn: String?
    let formType: String // midpoint, final, department
    let isActive: Bool?
}

struct EvaluationItemModel: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let formId: String?
    let evaluatorId: String?
    let evaluateeId: String?
    let rotationId: String?
    let totalScore: Double?
    let status: String? // submitted, approved
    let submittedAt: String?
    let form: EvaluationFormItemModel?
    let evaluator: UserProfileResponse?
    let evaluatee: UserProfileResponse?
    let rotation: RotationModel?
}

// MARK: - Qualified Trainer Card Model (GET /trainers/qualified-workspace-cards)
struct TrainerQualifiedCardModel: Codable, Identifiable {
    let id: String
    let trainerProfileId: String
    let nameAr: String
    let nameEn: String?
    let email: String?
    let phone: String?
    let specialty: String?
    let departmentName: String?
    let capacity: Int
    let occupied: Int
    let available: Int
    let occupancyPercentage: Double
    let activeTrainees: [TraineeProfileModel]?
}

// MARK: - Request DTOs
struct CreateRotationRequest: Encodable {
    let traineeProfileId: String
    let departmentId: String
    let trainerProfileId: String
    let startDate: String
    let endDate: String
    let status: String?
}

struct CreateShiftRequest: Encodable {
    let traineeProfileId: String
    let departmentId: String
    let date: String
    let shiftType: String
    let startTime: String?
    let endTime: String?
}

struct CreateTaskRequest: Encodable {
    let assignedToId: String
    let titleAr: String
    let description: String?
    let dueDate: String?
    let priority: String?
}

struct CreateCallRequest: Encodable {
    let callType: String
    let customTitle: String?
    let note: String?
    let location: String?
    let expectedMinutes: Int?
    let departmentId: String?
}

struct CreateClinicalCaseLogRequest: Encodable {
    let diagnosis: String
    let specialtyAr: String?
    let complexity: String
    let participationLevel: String
    let procedureId: String?
    let departmentId: String?
    let notes: String?
}

struct SubmitEvaluationRequest: Encodable {
    let formId: String
    let evaluateeId: String
    let rotationId: String
    let totalScore: Double
    let notes: String?
}

struct ReassignTrainerRequest: Encodable {
    let traineeProfileId: String
    let targetTrainerProfileId: String
    let reason: String?
}
