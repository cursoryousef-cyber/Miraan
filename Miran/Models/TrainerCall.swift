//
//  TrainerCall.swift
//  مِران
//
//  الوحدة ٦ — نداء المدرب وقياس الاستجابة.
//  زر واحد في يد المدرب، يقيس من يستجيب ومن يحضر فعلاً وفي كم دقيقة.
//

import Foundation
import SwiftUI

// MARK: - أنواع النداء

enum CallType: String, CaseIterable, Identifiable, Codable {
    case urgent
    case interesting
    case skill
    case lecture
    case custom

    var id: String { rawValue }

    var title: String {
        switch self {
        case .urgent:      return "حالة عاجلة"
        case .interesting: return "حالة مثيرة للاهتمام"
        case .skill:       return "تدريب على مهارة"
        case .lecture:     return "محاضرة أو جلسة"
        case .custom:      return "نداء مخصص"
        }
    }

    var usage: String {
        switch self {
        case .urgent:      return "حالة سريرية تستدعي حضوراً فورياً"
        case .interesting: return "حالة تعليمية نادرة تستحق الحضور"
        case .skill:       return "تدريب عملي على إجراء أو مهارة محددة"
        case .lecture:     return "جلسة تعليمية أو محاضرة مهمة"
        case .custom:      return "يكتب المدرب عنوانه ووصفه بنفسه"
        }
    }

    var icon: String {
        switch self {
        case .urgent:      return "bolt.fill"
        case .interesting: return "sparkles"
        case .skill:       return "hand.raised.fill"
        case .lecture:     return "person.3.fill"
        case .custom:      return "square.and.pencil"
        }
    }

    var color: Color {
        switch self {
        case .urgent:      return MiranTheme.urgent
        case .interesting: return .purple
        case .skill:       return MiranTheme.accent
        case .lecture:     return .teal
        case .custom:      return .gray
        }
    }

    var urgencyLabel: String {
        switch self {
        case .urgent:      return "عالية"
        case .interesting: return "متوسطة"
        case .skill:       return "متوسطة"
        case .lecture:     return "منخفضة"
        case .custom:      return "يحددها المدرب"
        }
    }

    var measurementLabel: String {
        switch self {
        case .urgent:      return "تأكيد من الطرفين"
        case .interesting: return "تأكيد المتدرب فقط"
        case .skill:       return "تأكيد المتدرب فقط"
        case .lecture:     return "تسجيل حضور فقط"
        case .custom:      return "حسب الاختيار"
        }
    }

    /// مبدأ التأكيد المزدوج — الحالة العاجلة وحدها تُقاس من الطرفين
    var requiresDualConfirmation: Bool { self == .urgent }

    /// المدة الافتراضية المتوقعة بالدقائق
    var defaultMinutes: Int {
        switch self {
        case .urgent:      return 15
        case .interesting: return 20
        case .skill:       return 45
        case .lecture:     return 60
        case .custom:      return 30
        }
    }
}

// MARK: - حالة المشارك

enum ParticipantState: String, Codable {
    case notified
    case acknowledged
    case declined
    case selfArrived
    case confirmed

    var title: String {
        switch self {
        case .notified:     return "لم يستجب"
        case .acknowledged: return "في الطريق"
        case .declined:     return "اعتذر"
        case .selfArrived:  return "أعلن وصوله"
        case .confirmed:    return "حضور مؤكَّد"
        }
    }

    var color: Color {
        switch self {
        case .notified:     return .gray
        case .acknowledged: return .orange
        case .declined:     return .red
        case .selfArrived:  return .blue
        case .confirmed:    return MiranTheme.green
        }
    }

    var icon: String {
        switch self {
        case .notified:     return "circle"
        case .acknowledged: return "figure.walk"
        case .declined:     return "xmark.circle"
        case .selfArrived:  return "mappin.circle.fill"
        case .confirmed:    return "checkmark.seal.fill"
        }
    }
}

// MARK: - المشارك في النداء

struct CallParticipant: Identifiable {
    let id = UUID()
    var traineeID: UUID
    var state: ParticipantState = .notified
    var notifiedAt: Date
    var ackAt: Date?
    var selfArrivedAt: Date?
    var confirmedAt: Date?
    var declineReason: String?

    /// زمن الإقرار بالثواني
    var ackSeconds: Int? {
        guard let ackAt else { return nil }
        return Int(ackAt.timeIntervalSince(notifiedAt))
    }

    /// زمن الوصول المُعلَن من المتدرب
    var selfArrivalSeconds: Int? {
        guard let selfArrivedAt else { return nil }
        return Int(selfArrivedAt.timeIntervalSince(notifiedAt))
    }

    /// زمن الوصول المؤكَّد من المدرب
    var confirmedArrivalSeconds: Int? {
        guard let confirmedAt else { return nil }
        return Int(confirmedAt.timeIntervalSince(notifiedAt))
    }

    /// فارق التحقق — الفرق بين ما أعلنه المتدرب وما أكّده المدرب
    var verificationGapSeconds: Int? {
        guard let s = selfArrivalSeconds, let c = confirmedArrivalSeconds else { return nil }
        return c - s
    }

    var hasArrived: Bool {
        state == .confirmed || state == .selfArrived
    }
}

// MARK: - النداء

struct TrainerCall: Identifiable {
    let id = UUID()
    var type: CallType
    var customTitle: String
    var note: String
    var location: String
    var expectedMinutes: Int
    var trainerID: UUID
    var departmentID: UUID
    var launchedAt: Date
    var endedAt: Date?
    var participants: [CallParticipant]

    var displayTitle: String {
        type == .custom && !customTitle.isEmpty ? customTitle : type.title
    }

    var isActive: Bool { endedAt == nil }

    var acknowledgedCount: Int {
        participants.filter { $0.ackAt != nil }.count
    }

    var arrivedCount: Int {
        participants.filter { $0.hasArrived }.count
    }

    var confirmedCount: Int {
        participants.filter { $0.state == .confirmed }.count
    }

    var declinedCount: Int {
        participants.filter { $0.state == .declined }.count
    }

    /// نسبة الاستجابة الكلية
    var responseRate: Double {
        guard !participants.isEmpty else { return 0 }
        return Double(acknowledgedCount) / Double(participants.count)
    }

    /// نسبة الحضور الفعلي
    var attendanceRate: Double {
        guard !participants.isEmpty else { return 0 }
        let counted = type.requiresDualConfirmation ? confirmedCount : arrivedCount
        return Double(counted) / Double(participants.count)
    }

    /// متوسط زمن الإقرار بالثواني
    var averageAckSeconds: Int? {
        let values = participants.compactMap(\.ackSeconds)
        guard !values.isEmpty else { return nil }
        return values.reduce(0, +) / values.count
    }

    /// متوسط زمن الوصول المؤكَّد بالثواني
    var averageArrivalSeconds: Int? {
        let values = participants.compactMap { p -> Int? in
            type.requiresDualConfirmation ? p.confirmedArrivalSeconds : p.selfArrivalSeconds
        }
        guard !values.isEmpty else { return nil }
        return values.reduce(0, +) / values.count
    }
}

// MARK: - مؤشر الحرص

/// مؤشر مركّب لكل متدرب: نسبة الاستجابة + زمن الإقرار + زمن الوصول المؤكَّد + نسبة الحضور
struct DiligenceScore {
    var responseRate: Double
    var averageAckSeconds: Int?
    var averageArrivalSeconds: Int?
    var attendanceRate: Double
    var totalCalls: Int

    /// الدرجة من 100
    var value: Int {
        guard totalCalls > 0 else { return 0 }

        // الاستجابة: 40 نقطة
        let responsePoints = responseRate * 40

        // الحضور الفعلي: 30 نقطة
        let attendancePoints = attendanceRate * 30

        // سرعة الإقرار: 20 نقطة — 60 ثانية فأقل = درجة كاملة
        let ackPoints: Double
        if let a = averageAckSeconds {
            ackPoints = max(0, min(1, (180.0 - Double(a)) / 120.0)) * 20
        } else {
            ackPoints = 0
        }

        // سرعة الوصول: 10 نقاط — 10 دقائق فأقل = درجة كاملة
        let arrivalPoints: Double
        if let a = averageArrivalSeconds {
            arrivalPoints = max(0, min(1, (1800.0 - Double(a)) / 1200.0)) * 10
        } else {
            arrivalPoints = 0
        }

        return Int((responsePoints + attendancePoints + ackPoints + arrivalPoints).rounded())
    }

    var label: String {
        switch value {
        case 85...:  return "ممتاز"
        case 70..<85: return "جيد جداً"
        case 55..<70: return "جيد"
        case 40..<55: return "يحتاج متابعة"
        default:      return "متعثّر"
        }
    }

    var color: Color {
        switch value {
        case 70...:   return MiranTheme.green
        case 55..<70: return .orange
        default:      return .red
        }
    }
}
