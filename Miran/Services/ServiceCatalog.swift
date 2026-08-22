//
//  ServiceCatalog.swift
//  Miran
//
//  كتالوج ومحرك الخدمات الديناميكية وحل التبويبات حسب أدوار وصلاحيات الـ RBAC في منصة مِران.
//

import Foundation
import SwiftUI

// MARK: - وجهات الخدمات
enum ServiceDestination: String, Hashable, Identifiable {
    case dashboard
    case schedule
    case logbook
    case competencies
    case trainees
    case evaluations
    case signoffs
    case requests
    case trainers
    case incidents
    case reports
    case hospitals
    case programs
    case capacity
    case notifications
    case digitalCard
    case servicesGrid
    case profile

    var id: String { rawValue }
}

// MARK: - تعريف الخدمة
struct ServiceDefinition: Identifiable, Hashable, Equatable {
    let id: String
    let titleAr: String
    let titleEn: String
    let icon: String
    let destination: ServiceDestination
    let requiredCapabilities: [String]
    let allowedRoles: [String]
    let isMainTab: Bool

    static func == (lhs: ServiceDefinition, rhs: ServiceDefinition) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - كتالوج الخدمات الرئيسي
struct ServiceCatalog {
    static let allServices: [ServiceDefinition] = [
        // 1. الرئيسية / اللوحة العامة
        ServiceDefinition(
            id: "dashboard",
            titleAr: "الرئيسية",
            titleEn: "Dashboard",
            icon: "house.fill",
            destination: .dashboard,
            requiredCapabilities: [],
            allowedRoles: ["trainee", "trainer", "hospital_training_admin", "hospital_administrator", "training_director", "cluster_administrator", "university_administrator", "platform_owner"],
            isMainTab: true
        ),

        // 2. جدولي / التواجد التدريبي
        ServiceDefinition(
            id: "schedule",
            titleAr: "جدولي",
            titleEn: "My Schedule",
            icon: "calendar",
            destination: .schedule,
            requiredCapabilities: ["schedule.view"],
            allowedRoles: ["trainee", "trainer", "hospital_training_admin", "hospital_administrator", "training_supervisor"],
            isMainTab: true
        ),

        // 3. السجل التدريبي / Logbook
        ServiceDefinition(
            id: "logbook",
            titleAr: "السجل التدريبي",
            titleEn: "Logbook",
            icon: "book.closed.fill",
            destination: .logbook,
            requiredCapabilities: ["logbook.view"],
            allowedRoles: ["trainee", "trainer", "hospital_training_admin", "academic_supervisor"],
            isMainTab: true
        ),

        // 4. الكفاءات والحقيبة
        ServiceDefinition(
            id: "competencies",
            titleAr: "الكفاءات",
            titleEn: "Competencies",
            icon: "checkmark.seal.fill",
            destination: .competencies,
            requiredCapabilities: [],
            allowedRoles: ["trainee", "trainer", "hospital_training_admin"],
            isMainTab: true
        ),

        // 5. المتدربون (للمدرب ومشرف المستشفى)
        ServiceDefinition(
            id: "trainees",
            titleAr: "المتدربون",
            titleEn: "Trainees",
            icon: "person.3.fill",
            destination: .trainees,
            requiredCapabilities: ["trainee.view_hospital", "trainee.view_scope"],
            allowedRoles: ["trainer", "hospital_training_admin", "hospital_administrator", "training_supervisor", "training_director"],
            isMainTab: true
        ),

        // 6. التقييمات
        ServiceDefinition(
            id: "evaluations",
            titleAr: "التقييمات",
            titleEn: "Evaluations",
            icon: "star.square.fill",
            destination: .evaluations,
            requiredCapabilities: ["evaluation.submit", "evaluation.view"],
            allowedRoles: ["trainer", "trainee", "hospital_training_admin", "academic_supervisor"],
            isMainTab: true
        ),

        // 7. اعتماد الإجراءات (Sign-offs)
        ServiceDefinition(
            id: "signoffs",
            titleAr: "اعتماد الإجراءات",
            titleEn: "Sign-offs",
            icon: "signature",
            destination: .signoffs,
            requiredCapabilities: ["logbook.signoff"],
            allowedRoles: ["trainer", "training_supervisor"],
            isMainTab: true
        ),

        // 8. طلبات التدريب
        ServiceDefinition(
            id: "requests",
            titleAr: "طلبات التدريب",
            titleEn: "Training Requests",
            icon: "doc.text.fill",
            destination: .requests,
            requiredCapabilities: ["training_request.view_scope"],
            allowedRoles: ["hospital_training_admin", "hospital_administrator", "training_director", "cluster_administrator", "university_administrator"],
            isMainTab: true
        ),

        // 9. المدربون
        ServiceDefinition(
            id: "trainers",
            titleAr: "المدربون",
            titleEn: "Trainers",
            icon: "stethoscope",
            destination: .trainers,
            requiredCapabilities: ["trainer.view_hospital"],
            allowedRoles: ["hospital_training_admin", "hospital_administrator", "training_supervisor", "training_director"],
            isMainTab: true
        ),

        // 10. البلاغات والتصعيد
        ServiceDefinition(
            id: "incidents",
            titleAr: "البلاغات والتصعيد",
            titleEn: "Incidents",
            icon: "exclamationmark.triangle.fill",
            destination: .incidents,
            requiredCapabilities: ["incident.create", "incident.view"],
            allowedRoles: ["trainee", "trainer", "hospital_training_admin", "hospital_administrator", "training_director", "cluster_administrator"],
            isMainTab: false
        ),

        // 11. التقارير
        ServiceDefinition(
            id: "reports",
            titleAr: "التقارير",
            titleEn: "Reports",
            icon: "chart.bar.doc.horizontal.fill",
            destination: .reports,
            requiredCapabilities: ["report.generate"],
            allowedRoles: ["hospital_training_admin", "hospital_administrator", "training_director", "cluster_administrator", "university_administrator"],
            isMainTab: true
        ),

        // 12. المستشفيات (للتجمع)
        ServiceDefinition(
            id: "hospitals",
            titleAr: "المستشفيات",
            titleEn: "Hospitals",
            icon: "building.2.fill",
            destination: .hospitals,
            requiredCapabilities: ["hospital.view_cluster"],
            allowedRoles: ["training_director", "cluster_administrator", "cluster_manager"],
            isMainTab: true
        ),

        // 13. البرامج التدريبية
        ServiceDefinition(
            id: "programs",
            titleAr: "البرامج",
            titleEn: "Programs",
            icon: "graduationcap.fill",
            destination: .programs,
            requiredCapabilities: ["program.view"],
            allowedRoles: ["training_director", "cluster_administrator", "university_administrator"],
            isMainTab: true
        ),

        // 14. الطاقة الاستيعابية
        ServiceDefinition(
            id: "capacity",
            titleAr: "الطاقة الاستيعابية",
            titleEn: "Capacity",
            icon: "chart.pie.fill",
            destination: .capacity,
            requiredCapabilities: ["capacity.manage"],
            allowedRoles: ["training_director", "cluster_administrator", "hospital_training_admin"],
            isMainTab: true
        ),

        // 15. الإشعارات
        ServiceDefinition(
            id: "notifications",
            titleAr: "الإشعارات",
            titleEn: "Notifications",
            icon: "bell.fill",
            destination: .notifications,
            requiredCapabilities: [],
            allowedRoles: ["trainee", "trainer", "hospital_training_admin", "training_director", "university_administrator"],
            isMainTab: false
        ),

        // 16. البطاقة الرقمية
        ServiceDefinition(
            id: "digitalCard",
            titleAr: "البطاقة الرقمية",
            titleEn: "Digital Card",
            icon: "vcard.fill",
            destination: .digitalCard,
            requiredCapabilities: [],
            allowedRoles: ["trainee"],
            isMainTab: false
        ),

        // 17. شبكة الخدمات الإضافية
        ServiceDefinition(
            id: "servicesGrid",
            titleAr: "الخدمات",
            titleEn: "Services",
            icon: "grid.hifi",
            destination: .servicesGrid,
            requiredCapabilities: [],
            allowedRoles: ["trainee", "trainer", "hospital_training_admin", "training_director"],
            isMainTab: true
        ),

        // 18. الملف الشخصي — متاح لجميع الأدوار
        ServiceDefinition(
            id: "profile",
            titleAr: "حسابي",
            titleEn: "Profile",
            icon: "person.crop.circle.fill",
            destination: .profile,
            requiredCapabilities: [],
            allowedRoles: [],
            isMainTab: true
        )
    ]
}

// MARK: - الشخصيات والخبرات الرئيسية المحلولة (Resolved Personas)
enum MiranPersona: String, Identifiable {
    case trainee = "TRAINEE_PERSONA"
    case trainingOperations = "TRAINING_OPERATIONS_PERSONA"
    case trainer = "TRAINER_PERSONA"
    case clusterOperations = "CLUSTER_OPERATIONS_PERSONA"
    case university = "UNIVERSITY_PERSONA"
    case platform = "PLATFORM_PERSONA"
    case academicSupervisor = "ACADEMIC_SUPERVISOR_PERSONA"

    var id: String { rawValue }

    var titleAr: String {
        switch self {
        case .trainee: return "رحلتي التدريبية"
        case .trainingOperations: return "ما يحتاج إجراء"
        case .trainer: return "المتدربون والإجراءات"
        case .clusterOperations: return "الطلبات والطاقة الاستيعابية"
        case .university: return "طلبات التدريب"
        case .platform: return "مركز التحكم"
        case .academicSupervisor: return "الإشراف الأكاديمي"
        }
    }
}

// MARK: - محرك حل الخدمات الديناميكية والشخصيات (Service Resolver)
struct ServiceResolver {
    /// حل الشخصية وتجربة المستخدم الرئيسية بناءً على الصلاحيات والتطاق أولاً، ودور المستخدم كعامل مساعد فقط
    static func resolvePersona(for user: UserProfileResponse) -> MiranPersona {
        let caps = Set(user.capabilities + user.permissions)
        let roles = Set(user.roles + [user.primaryRole])

        // 1. PLATFORM PERSONA (مركز التحكم)
        if caps.contains("platform.manage") || caps.contains("org.manage_all") || roles.contains("platform_owner") || roles.contains("system_admin") {
            return .platform
        }

        // 2. UNIVERSITY PERSONA (طلبات التدريب الجامعية)
        if caps.contains("university.view_scope") || caps.contains("training_request.create") || roles.contains("university_administrator") || roles.contains("university_admin") {
            return .university
        }

        // 3. CLUSTER OPERATIONS PERSONA (الطلبات والطاقة الاستيعابية على مستوى التجمع)
        if caps.contains("hospital.view_cluster") || caps.contains("cluster.view_scope") || (caps.contains("capacity.manage") && user.activeOrganization.code?.contains("cluster") == true) || roles.contains("cluster_administrator") || roles.contains("cluster_manager") {
            return .clusterOperations
        }

        // 4. TRAINING OPERATIONS PERSONA (ما يحتاج إجراء — إدارة عمليات التدريب بالمستشفى)
        if caps.contains("trainee.view_hospital") || caps.contains("training.operate") || caps.contains("department.manage") || caps.contains("allocation.hospital_assign") || roles.contains("hospital_training_admin") || roles.contains("hospital_administrator") || roles.contains("training_supervisor") {
            return .trainingOperations
        }

        // 5. ACADEMIC SUPERVISOR PERSONA (الإشراف الأكاديمي — مشرف الجامعة على أطباء الامتياز)
        if roles.contains("academic_supervisor") || caps.contains("academic.supervise") || caps.contains("academic.view_scope") {
            return .academicSupervisor
        }

        // 6. TRAINER PERSONA (المتدربون والإجراءات — المدرب المباشر)
        if caps.contains("trainee.view_assigned") || caps.contains("logbook.approve") || caps.contains("evaluation.submit") || roles.contains("trainer") {
            return .trainer
        }

        // 7. TRAINEE PERSONA (رحلتي التدريبية)
        return .trainee
    }

    /// يعيد جميع الخدمات المصرح بها للمستخدم بناءً على الصلاحيات الأساسية والتطاق
    static func authorizedServices(for user: UserProfileResponse) -> [ServiceDefinition] {
        let userCaps = Set(user.capabilities + user.permissions)
        return ServiceCatalog.allServices.filter { service in
            if service.requiredCapabilities.isEmpty {
                return service.allowedRoles.isEmpty || service.allowedRoles.contains { user.roles.contains($0) || user.primaryRole == $0 }
            }
            // Capabilities are primary
            let hasCapability = service.requiredCapabilities.contains { userCaps.contains($0) }
            return hasCapability
        }
    }

    /// التبويبات الرئيسية المخصصة لـ Resolved Persona المعتمدة على Capabilities
    static func mainTabs(for user: UserProfileResponse) -> [ServiceDefinition] {
        let authorized = authorizedServices(for: user)
        let persona = resolvePersona(for: user)

        let profileDef = ServiceCatalog.allServices.first { $0.id == "profile" }!

        switch persona {
        case .trainee:
            let ids = ["dashboard", "schedule", "logbook", "competencies", "servicesGrid"]
            var tabs = ids.compactMap { id in authorized.first { $0.id == id } }
            tabs.append(profileDef)
            return tabs

        case .trainer:
            let ids = ["trainees", "evaluations", "signoffs", "schedule", "logbook", "servicesGrid"]
            var tabs = ids.compactMap { id in authorized.first { $0.id == id } }
            tabs.append(profileDef)
            return tabs

        case .trainingOperations:
            let ids = ["requests", "trainees", "trainers", "schedule", "reports"]
            var tabs = ids.compactMap { id in authorized.first { $0.id == id } }
            tabs.append(profileDef)
            return tabs

        case .clusterOperations:
            let ids = ["hospitals", "programs", "capacity", "reports"]
            var tabs = ids.compactMap { id in authorized.first { $0.id == id } }
            tabs.append(profileDef)
            return tabs

        case .university:
            let ids = ["requests", "programs", "reports"]
            var tabs = ids.compactMap { id in authorized.first { $0.id == id } }
            tabs.append(profileDef)
            return tabs

        case .platform:
            let ids = ["hospitals", "programs", "capacity", "reports"]
            var tabs = ids.compactMap { id in authorized.first { $0.id == id } }
            tabs.append(profileDef)
            return tabs

        case .academicSupervisor:
            let ids = ["dashboard", "logbook", "reports"]
            var tabs = ids.compactMap { id in authorized.first { $0.id == id } }
            tabs.append(profileDef)
            return tabs
        }
    }

    /// الخدمات الإضافية المعروضة داخل شبكة "الخدمات"
    static func extraServices(for user: UserProfileResponse) -> [ServiceDefinition] {
        let authorized = authorizedServices(for: user)
        let mainTabIds = Set(mainTabs(for: user).map { $0.id })
        
        var extras = authorized.filter { !mainTabIds.contains($0.id) && $0.id != "servicesGrid" && $0.id != "dashboard" }
        let persona = resolvePersona(for: user)
        
        if persona == .trainee {
            let traineeExtras = ["notifications", "incidents", "digitalCard", "evaluations"]
            let map = Set(extras.map { $0.id })
            for id in traineeExtras {
                if !map.contains(id), let def = authorized.first(where: { $0.id == id }) {
                    extras.append(def)
                }
            }
        } else if persona == .trainer {
            let trainerExtras = ["notifications", "incidents"]
            let map = Set(extras.map { $0.id })
            for id in trainerExtras {
                if !map.contains(id), let def = authorized.first(where: { $0.id == id }) {
                    extras.append(def)
                }
            }
        }
        
        return extras
    }
}

