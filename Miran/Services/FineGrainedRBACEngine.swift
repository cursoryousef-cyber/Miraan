//
//  FineGrainedRBACEngine.swift
//  Miran
//
//  Fine-Grained RBAC & Policy Claims Evaluation Engine.
//  Evaluates User Roles, Explicit Granted Permissions, Organization Policies, and Security Claims.
//

import Foundation

// MARK: - Fine Grained Permissions Enum
enum FinePermission: String, CaseIterable, Codable {
    // Platform & Cluster Management
    case createOrganization = "org:create"
    case editOrganization = "org:edit"
    case deleteOrganization = "org:delete"

    // User & Security Management
    case createUser = "user:create"
    case editUser = "user:edit"
    case deleteUser = "user:delete"
    case assignRoles = "user:assign_roles"

    // Agreements & Approvals
    case createAgreement = "agreement:create"
    case approveAgreement = "agreement:approve"
    case signAgreement = "agreement:sign"

    // Clinical Logbook & Sign-off
    case submitLogbook = "logbook:submit"
    case approveLogbook = "logbook:approve"
    case rejectLogbook = "logbook:reject"

    // Rotation & Dispatch
    case scheduleRotation = "rotation:schedule"
    case transferTrainee = "trainee:transfer"
    case launchCall = "call:launch"

    var titleAr: String {
        switch self {
        case .createOrganization: return "إنشاء جهة وتجمع صحي"
        case .editOrganization: return "تعديل بيانات الجهة"
        case .deleteOrganization: return "حذف جهة صحية"
        case .createUser: return "إضافة مستخدم جديد"
        case .editUser: return "تعديل بيانات مستخدم"
        case .deleteUser: return "حذف مستخدم"
        case .assignRoles: return "تعديل وإسناد الصلاحيات (RBAC)"
        case .createAgreement: return "إنشاء اتفاقية عقدية"
        case .approveAgreement: return "اعتماد اتفاقية الشراكة"
        case .signAgreement: return "توقيع واعتماد العقد"
        case .submitLogbook: return "تسجيل حالة وحفظ بالسجل"
        case .approveLogbook: return "اعتماد مهارات Logbook (Sign-off)"
        case .rejectLogbook: return "إعادة السجل السريري للتعديل"
        case .scheduleRotation: return "جدولة الروتيشنات والتوزيع"
        case .transferTrainee: return "نقل المتدرب بين الأقسام"
        case .launchCall: return "إطلاق نداء طوارئ ميداني"
        }
    }
}

// MARK: - Fine-Grained RBAC Engine
final class FineGrainedRBACEngine {
    static let shared = FineGrainedRBACEngine()

    private init() {}

    /// Evaluates if user possesses explicit permission via Role, Granted Permissions, or Policy Claims
    func hasPermission(_ permission: FinePermission, userRole: String, explicitPermissions: [String]) -> Bool {
        // Platform Owner and System Admin have unrestricted master claims
        if userRole == "platform_owner" || userRole == "system_admin" {
            return true
        }

        // Check if explicit granted permission list contains requested permission
        if explicitPermissions.contains(permission.rawValue) {
            return true
        }

        // Role-based baseline claims
        switch (userRole, permission) {
        case ("org_manager", .createAgreement), ("org_manager", .approveAgreement), ("org_manager", .editOrganization):
            return true
        case ("academic_supervisor", .approveLogbook), ("academic_supervisor", .rejectLogbook), ("academic_supervisor", .createAgreement):
            return true
        case ("training_supervisor", .scheduleRotation), ("training_supervisor", .transferTrainee), ("training_supervisor", .launchCall):
            return true
        case ("trainer", .approveLogbook), ("trainer", .rejectLogbook), ("trainer", .launchCall):
            return true
        case ("trainee", .submitLogbook):
            return true
        default:
            return false
        }
    }
}

// MARK: - RBAC Permission Engine for UI Conditional Render
enum RBACAction {
    case create
    case read
    case update
    case delete
    case details
    case approve
    case export
}

enum RBACScope {
    case organizations
    case clusters
    case hospitals
    case universities
    case colleges
    case departments
    case programs
    case intakes
    case agreements
    case users
    case roles
    case permissions
    case workflow
    case settings
    case audit
    case students
    case assignments
    case rotations
    case schedules
    case trainers
    case tasks
    case notes
    case evaluations
    case competencies
    case logbook
    case procedures
    case completedPrograms
    case finalResults
}

struct RBACPermissionEngine {
    static func hasPermission(roles: [UserRole], action: RBACAction, scope: RBACScope) -> Bool {
        let roleStrings = roles.map { $0.rawValue }
        if roleStrings.contains("platform_owner") || roleStrings.contains("system_admin") || roleStrings.contains("holding_administrator") {
            if scope == .audit && action == .delete { return false } // Audit is immutable
            return true
        }

        if roleStrings.contains("university_administrator") || roleStrings.contains("academic_affairs") {
            if [.students, .intakes, .programs, .agreements].contains(scope) {
                return [.create, .read, .update, .delete, .details].contains(action)
            }
            return action == .read
        }

        if roleStrings.contains("cluster_administrator") || roleStrings.contains("training_director") {
            if [.assignments, .hospitals, .clusters, .intakes, .agreements].contains(scope) {
                return [.create, .read, .update, .delete, .details].contains(action)
            }
            return action == .read
        }

        if roleStrings.contains("hospital_administrator") || roleStrings.contains("department_head") {
            if [.rotations, .schedules, .assignments, .trainers, .departments].contains(scope) {
                return [.create, .read, .update, .delete, .details].contains(action)
            }
            return action == .read
        }

        if roles.contains(.trainer) || roleStrings.contains("trainer") {
            if [.tasks, .notes, .evaluations, .competencies, .logbook].contains(scope) {
                if action == .delete { return false }
                return [.create, .read, .update, .approve, .details].contains(action)
            }
            return action == .read
        }

        if roles.contains(.trainee) || roleStrings.contains("trainee") {
            if [.logbook, .procedures, .tasks].contains(scope) {
                if action == .delete { return false }
                return [.create, .read, .update, .details].contains(action)
            }
            return action == .read
        }

        if roles.contains(.academic) || roleStrings.contains("academic_supervisor") {
            if [.completedPrograms, .finalResults].contains(scope) {
                return [.read, .update, .approve, .details].contains(action)
            }
            return action == .read
        }

        return false
    }
}
