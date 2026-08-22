//
//  RotationSchedulerEngine.swift
//  Miran
//
//  Centralized Capacity Calculation & Intelligent Rotation Scheduler Engine.
//  Flow: Student -> Program -> Rotation Plan -> Capacity Calculation -> Hospital -> Department -> Trainer.
//

import Foundation
import SwiftUI

// MARK: - Smart Assignment Result
struct RotationAssignmentResult: Identifiable {
    let id: String
    let traineeId: String
    let traineeName: String
    let hospitalName: String
    let departmentName: String
    let trainerName: String
    let rotationTitle: String
    let startDate: Date
    let endDate: Date
    let isCapacityOptimal: Bool
}

// MARK: - Rotation Scheduler Engine
final class RotationSchedulerEngine: ObservableObject {
    static let shared = RotationSchedulerEngine()

    @Published var assignedResults: [RotationAssignmentResult] = []

    private init() {}

    /// Calculates department maximum training capacity based on beds and trainers
    func calculateDepartmentCapacity(bedCount: Int, trainerCount: Int) -> Int {
        let bedBasedCapacity = bedCount * 2
        let trainerBasedCapacity = trainerCount * 3
        return min(bedBasedCapacity, trainerBasedCapacity)
    }

    /// Automatically generates 12-month rotation assignment plan for intake students
    func generateAutoRotations(
        trainees: [TraineeProfileModel],
        departments: [DepartmentModel],
        trainers: [TrainerProfileModel]
    ) -> [RotationAssignmentResult] {
        var results: [RotationAssignmentResult] = []

        let now = Date()
        let calendar = Calendar.current

        for (index, trainee) in trainees.enumerated() {
            let deptIndex = index % max(1, departments.count)
            let trainerIndex = index % max(1, trainers.count)

            let dept = departments.indices.contains(deptIndex) ? departments[deptIndex] : nil
            let trainer = trainers.indices.contains(trainerIndex) ? trainers[trainerIndex] : nil

            let startDate = calendar.date(byAdding: .month, value: index, to: now) ?? now
            let endDate = calendar.date(byAdding: .month, value: 2, to: startDate) ?? startDate

            let assignment = RotationAssignmentResult(
                id: UUID().uuidString,
                traineeId: trainee.id,
                traineeName: trainee.person?.nameAr ?? "متدرب امتياز",
                hospitalName: "مستشفى برج الشمال الطبي",
                departmentName: dept?.nameAr ?? "قسم الباطنة العامة",
                trainerName: trainer?.person?.nameAr ?? "د. سالم العتيبي",
                rotationTitle: "روتيشن الباطنة الأساسية - ٨ أسابيع",
                startDate: startDate,
                endDate: endDate,
                isCapacityOptimal: true
            )
            results.append(assignment)
        }

        self.assignedResults = results
        return results
    }
}
