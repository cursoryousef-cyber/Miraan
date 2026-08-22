//
//  SeedData.swift
//  مِران
//
//  ⚠️ تم تعطيل البيانات التجريبية المحلية.
//  جميع البيانات تُجلب الآن من Backend API (Production).
//  يمكن حذف هذا الملف بالكامل في الإصدارات القادمة.
//

import Foundation

extension AppStore {

    /// كانت تُستخدم لزرع بيانات تجريبية — تم تعطيلها لصالح Production API.
    func seed() {
        // Production: لا شيء — البيانات تأتي من Backend API عبر fetchAllProductionData()
        print("ℹ️ [SeedData] Skipped — Production mode active. Data fetched from Backend API.")
    }
}
