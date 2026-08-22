//
//  Models.swift
//  مِران — نظام إدارة رحلة المتدرب وقياس الاستجابة
//
//  نماذج البيانات الأساسية للنظام.
//

import Foundation
import SwiftUI

// MARK: - الأدوار

enum UserRole: String, CaseIterable, Identifiable {
    case trainee
    case trainer
    case academic

    var id: String { rawValue }

    var title: String {
        switch self {
        case .trainee:  return "متدرب"
        case .trainer:  return "مدرب / مسؤول قسم"
        case .academic: return "الشؤون الأكاديمية"
        }
    }

    var subtitle: String {
        switch self {
        case .trainee:  return "جدولي، بطاقتي، نداءاتي، تقييماتي"
        case .trainer:  return "متدربوني، النداءات، التقييم"
        case .academic: return "مراجعة الملفات، الجدولة، التقارير"
        }
    }

    var icon: String {
        switch self {
        case .trainee:  return "person.fill"
        case .trainer:  return "stethoscope"
        case .academic: return "building.columns.fill"
        }
    }
}

// MARK: - المستوى التدريبي

enum TraineeLevel: String, CaseIterable, Identifiable, Codable {
    case intern
    case resident
    case student
    case nursing
    case allied

    var id: String { rawValue }

    var title: String {
        switch self {
        case .intern:   return "امتياز"
        case .resident: return "مقيم"
        case .student:  return "طالب"
        case .nursing:  return "تمريض"
        case .allied:   return "تخصصات مساندة"
        }
    }

    /// الشريط اللوني على البطاقة التعريفية
    var stripeColor: Color {
        switch self {
        case .intern:   return MiranTheme.stripeIntern
        case .resident: return MiranTheme.stripeResident
        case .student:  return MiranTheme.stripeStudent
        case .nursing:  return MiranTheme.stripeNursing
        case .allied:   return MiranTheme.stripeAllied
        }
    }
}

// MARK: - المستندات

enum DocumentStatus: String, Codable {
    case pending
    case approved
    case rejected
    case expired

    var title: String {
        switch self {
        case .pending:  return "قيد المراجعة"
        case .approved: return "معتمد"
        case .rejected: return "مرفوض"
        case .expired:  return "منتهٍ"
        }
    }

    var color: Color {
        switch self {
        case .pending:  return .orange
        case .approved: return MiranTheme.green
        case .rejected: return .red
        case .expired:  return .red
        }
    }

    var icon: String {
        switch self {
        case .pending:  return "clock.fill"
        case .approved: return "checkmark.seal.fill"
        case .rejected: return "xmark.circle.fill"
        case .expired:  return "exclamationmark.triangle.fill"
        }
    }
}

struct TrainingDocument: Identifiable, Hashable {
    let id: UUID
    var title: String
    var isMandatory: Bool
    var hasExpiry: Bool
    var expiryDate: Date?
    var status: DocumentStatus
    var reviewerNote: String?

    init(id: UUID = UUID(),
         title: String,
         isMandatory: Bool,
         hasExpiry: Bool,
         expiryDate: Date? = nil,
         status: DocumentStatus = .pending,
         reviewerNote: String? = nil) {
        self.id = id
        self.title = title
        self.isMandatory = isMandatory
        self.hasExpiry = hasExpiry
        self.expiryDate = expiryDate
        self.status = status
        self.reviewerNote = reviewerNote
    }

    /// عدد الأيام المتبقية على انتهاء المستند
    var daysToExpiry: Int? {
        guard let expiryDate else { return nil }
        return Calendar.current.dateComponents([.day], from: Date(), to: expiryDate).day
    }

    var isExpiringSoon: Bool {
        guard let d = daysToExpiry else { return false }
        return d <= 60 && d >= 0
    }
}

// MARK: - حالة الملف والبطاقة

enum ApplicationStatus: String, Codable {
    case draft
    case submitted
    case incomplete
    case approved
    case rejected

    var title: String {
        switch self {
        case .draft:      return "مسودة"
        case .submitted:  return "قيد المراجعة"
        case .incomplete: return "ناقص"
        case .approved:   return "معتمد"
        case .rejected:   return "مرفوض"
        }
    }

    var color: Color {
        switch self {
        case .draft:      return .gray
        case .submitted:  return .orange
        case .incomplete: return .yellow
        case .approved:   return MiranTheme.green
        case .rejected:   return .red
        }
    }
}

enum CardStatus: String, Codable {
    case notIssued
    case active
    case suspended
    case revoked

    var title: String {
        switch self {
        case .notIssued: return "لم تُصدر"
        case .active:    return "سارية"
        case .suspended: return "معلّقة"
        case .revoked:   return "ملغاة"
        }
    }

    var color: Color {
        switch self {
        case .notIssued: return .gray
        case .active:    return MiranTheme.green
        case .suspended: return .orange
        case .revoked:   return .red
        }
    }
}

// MARK: - الصلاحيات السريرية

enum PrivilegeLevel: String, Codable, CaseIterable {
    case independent
    case supervised
    case prohibited

    var title: String {
        switch self {
        case .independent: return "مسموح منفرداً"
        case .supervised:  return "تحت إشراف مباشر"
        case .prohibited:  return "ممنوع"
        }
    }

    var color: Color {
        switch self {
        case .independent: return MiranTheme.green
        case .supervised:  return .orange
        case .prohibited:  return .red
        }
    }

    var icon: String {
        switch self {
        case .independent: return "checkmark.circle.fill"
        case .supervised:  return "exclamationmark.triangle.fill"
        case .prohibited:  return "xmark.octagon.fill"
        }
    }
}

struct ClinicalPrivilege: Identifiable, Hashable {
    let id = UUID()
    var title: String
    var level: PrivilegeLevel
}

// MARK: - المتدرب

struct Trainee: Identifiable {
    let id: UUID
    var traineeNumber: String
    var nameAr: String
    var nameEn: String
    var nationalID: String
    var level: TraineeLevel
    var specialty: String
    var sponsor: String
    var phone: String
    var email: String
    var emergencyContact: String
    var photoData: Data?
    var applicationStatus: ApplicationStatus
    var cardStatus: CardStatus
    var cardUUID: String
    var accessExpiry: Date
    var trainerID: UUID?
    var currentDepartmentID: UUID?
    var documents: [TrainingDocument]

    init(id: UUID = UUID(),
         traineeNumber: String,
         nameAr: String,
         nameEn: String,
         nationalID: String,
         level: TraineeLevel,
         specialty: String,
         sponsor: String,
         phone: String,
         email: String,
         emergencyContact: String = "",
         photoData: Data? = nil,
         applicationStatus: ApplicationStatus = .submitted,
         cardStatus: CardStatus = .notIssued,
         cardUUID: String = UUID().uuidString,
         accessExpiry: Date = Date().addingTimeInterval(60 * 60 * 24 * 365),
         trainerID: UUID? = nil,
         currentDepartmentID: UUID? = nil,
         documents: [TrainingDocument] = []) {
        self.id = id
        self.traineeNumber = traineeNumber
        self.nameAr = nameAr
        self.nameEn = nameEn
        self.nationalID = nationalID
        self.level = level
        self.specialty = specialty
        self.sponsor = sponsor
        self.phone = phone
        self.email = email
        self.emergencyContact = emergencyContact
        self.photoData = photoData
        self.applicationStatus = applicationStatus
        self.cardStatus = cardStatus
        self.cardUUID = cardUUID
        self.accessExpiry = accessExpiry
        self.trainerID = trainerID
        self.currentDepartmentID = currentDepartmentID
        self.documents = documents
    }

    var initials: String {
        let parts = nameAr.split(separator: " ")
        return parts.prefix(2).compactMap { $0.first }.map(String.init).joined()
    }

    /// رابط التحقق المضمَّن في الباركود — لا يحتوي أي بيانات شخصية
    var verificationURL: String {
        "https://miran.health/v/\(cardUUID)?s=\(signatureStub)"
    }

    /// توقيع تجريبي فقط. في الإنتاج يُستبدل بـ HMAC-SHA256 مُصدَر من الخادم.
    private var signatureStub: String {
        let raw = String(UInt(bitPattern: cardUUID.hashValue), radix: 16)
        return String(raw.prefix(16))
    }
}

// MARK: - المدرب

struct Trainer: Identifiable {
    let id: UUID
    var nameAr: String
    var title: String
    var departmentID: UUID
    var extensionNumber: String

    init(id: UUID = UUID(), nameAr: String, title: String, departmentID: UUID, extensionNumber: String) {
        self.id = id
        self.nameAr = nameAr
        self.title = title
        self.departmentID = departmentID
        self.extensionNumber = extensionNumber
    }
}

// MARK: - القسم

struct Department: Identifiable {
    let id: UUID
    var name: String
    var capacity: Int
    var roundLocation: String
    var roundTime: String
    var meetingRoom: String
    var objectives: [String]
    var commonMistakes: [String]
    var firstDayExpectations: String
    var privileges: [ClinicalPrivilege]

    init(id: UUID = UUID(),
         name: String,
         capacity: Int,
         roundLocation: String,
         roundTime: String,
         meetingRoom: String,
         objectives: [String],
         commonMistakes: [String],
         firstDayExpectations: String,
         privileges: [ClinicalPrivilege]) {
        self.id = id
        self.name = name
        self.capacity = capacity
        self.roundLocation = roundLocation
        self.roundTime = roundTime
        self.meetingRoom = meetingRoom
        self.objectives = objectives
        self.commonMistakes = commonMistakes
        self.firstDayExpectations = firstDayExpectations
        self.privileges = privileges
    }
}

// MARK: - الروتيشن

struct Rotation: Identifiable {
    let id: UUID
    var traineeID: UUID
    var departmentID: UUID
    var trainerID: UUID
    var startDate: Date
    var endDate: Date
    var midpointMeetingDone: Bool
    var completedObjectives: Set<Int>

    init(id: UUID = UUID(),
         traineeID: UUID,
         departmentID: UUID,
         trainerID: UUID,
         startDate: Date,
         endDate: Date,
         midpointMeetingDone: Bool = false,
         completedObjectives: Set<Int> = []) {
        self.id = id
        self.traineeID = traineeID
        self.departmentID = departmentID
        self.trainerID = trainerID
        self.startDate = startDate
        self.endDate = endDate
        self.midpointMeetingDone = midpointMeetingDone
        self.completedObjectives = completedObjectives
    }

    var isCurrent: Bool {
        let now = Date()
        return now >= startDate && now <= endDate
    }

    var daysRemaining: Int {
        max(0, Calendar.current.dateComponents([.day], from: Date(), to: endDate).day ?? 0)
    }

    var progress: Double {
        let total = endDate.timeIntervalSince(startDate)
        guard total > 0 else { return 0 }
        let done = Date().timeIntervalSince(startDate)
        return min(1, max(0, done / total))
    }
}

// MARK: - الورديات

enum ShiftType: String, CaseIterable, Identifiable, Codable {
    case morning
    case evening
    case night
    case onCall
    case leave

    var id: String { rawValue }

    var title: String {
        switch self {
        case .morning: return "صباحي"
        case .evening: return "مسائي"
        case .night:   return "ليلي"
        case .onCall:  return "مناوبة"
        case .leave:   return "إجازة"
        }
    }

    var hours: String {
        switch self {
        case .morning: return "07:00 — 15:00"
        case .evening: return "15:00 — 23:00"
        case .night:   return "23:00 — 07:00"
        case .onCall:  return "24 ساعة"
        case .leave:   return "—"
        }
    }

    var color: Color {
        switch self {
        case .morning: return MiranTheme.accent
        case .evening: return .orange
        case .night:   return .indigo
        case .onCall:  return .purple
        case .leave:   return .gray
        }
    }

    /// المتدرب في إجازة لا يصله نداء — ضابط الاستخدام العادل
    var isReachable: Bool { self != .leave }
}

struct Shift: Identifiable {
    let id = UUID()
    var traineeID: UUID
    var date: Date
    var type: ShiftType
    var departmentID: UUID
}

// MARK: - الحضور

struct AttendanceRecord: Identifiable {
    let id = UUID()
    var traineeID: UUID
    var date: Date
    var checkIn: Date?
    var checkOut: Date?
    var method: String
    var isLate: Bool
}

// MARK: - التقييم

struct EvaluationItem: Identifiable, Hashable {
    let id = UUID()
    var title: String
    var score: Int
}

struct Evaluation: Identifiable {
    let id = UUID()
    var rotationID: UUID
    var traineeID: UUID
    var evaluatorID: UUID
    var isMidpoint: Bool
    var items: [EvaluationItem]
    var comment: String
    var submittedAt: Date
    /// المدة التي استغرقها المُقيِّم — يستخدمها كاشف التقييم الآلي
    var secondsSpent: Int

    var average: Double {
        guard !items.isEmpty else { return 0 }
        return Double(items.map(\.score).reduce(0, +)) / Double(items.count)
    }

    /// كاشف التقييم الآلي: درجة كاملة للجميع في أقل من ٤٠ ثانية
    var isSuspicious: Bool {
        secondsSpent < 40 && items.allSatisfy { $0.score == 5 }
    }
}

struct DepartmentFeedback: Identifiable {
    let id = UUID()
    var rotationID: UUID
    var departmentID: UUID
    var supervisionQuality: Int
    var learningOpportunities: Int
    var workloadFairness: Int
    var environment: Int
    var comment: String

    var average: Double {
        Double(supervisionQuality + learningOpportunities + workloadFairness + environment) / 4.0
    }
}

// MARK: - خطة التحسين

struct ImprovementPlan: Identifiable {
    let id = UUID()
    var traineeID: UUID
    var reason: String
    var goals: [String]
    var startDate: Date
    var endDate: Date
    var progress: Double
}
