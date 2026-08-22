//
//  TraineeViewModel.swift
//  Miran
//
//  ViewModel for Trainee domain data: Profile, Active Rotations, Attendance, Calls.
//

import Foundation

@MainActor
final class TraineeViewModel: ObservableObject {
    @Published var traineeProfile: TraineeProfileModel?
    @Published var rotations: [RotationModel] = []
    @Published var activeCall: TrainerCallModel?
    @Published var colleagues: [TrainingColleagueModel] = []
    @Published var cardQrToken: String?
    @Published var attendance: [AttendanceModel] = []
    @Published var tasks: [TaskModel] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    /// Same endpoint the web trainee dashboard uses — scoped server-side to
    /// the caller's own TraineeProfile when no traineeId is supplied.
    func fetchAttendance() async {
        do {
            let res: APIListResponse<AttendanceModel> = try await APIClient.shared.request(endpoint: "/operations/attendance")
            self.attendance = res.data
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    func fetchTasks() async {
        do {
            let res: APIListResponse<TaskModel> = try await APIClient.shared.request(endpoint: "/operations/tasks")
            self.tasks = res.data
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    func checkIn() async {
        do {
            try await APIClient.shared.requestVoid(endpoint: "/operations/attendance/qr", method: "POST", body: ["qrCode": traineeProfile?.cardUuid ?? "manual"])
            await fetchAttendance()
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    func checkOut(attendanceId: String) async {
        do {
            try await APIClient.shared.requestVoid(endpoint: "/operations/attendance/\(attendanceId)/check-out", method: "PATCH")
            await fetchAttendance()
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    /// Colleagues sharing the trainee's own active rotation (same trainer,
    /// department and organisation). Scope is derived server-side from the
    /// JWT — nothing here can widen it.
    func fetchColleagues() async {
        do {
            let res: APIListResponse<TrainingColleagueModel> = try await APIClient.shared.request(endpoint: "/trainees/my-colleagues")
            self.colleagues = res.data
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    /// Signed, opaque QR token for the digital ID card — never the raw
    /// national ID. Verification happens server-side at /trainees/card/verify.
    func fetchCardQrToken() async {
        do {
            let res: APIDataResponse<CardQrTokenModel> = try await APIClient.shared.request(endpoint: "/trainees/card/qr-token")
            self.cardQrToken = res.data.token
        } catch {
            self.cardQrToken = nil
        }
    }

    func fetchDashboardData() async {
        isLoading = true
        errorMessage = nil

        do {
            // Fetch Trainee Profile
            let profile: TraineeProfileModel = try await APIClient.shared.request(endpoint: "/trainees/me")
            self.traineeProfile = profile

            // Fetch Rotations
            let rotList: APIListResponse<RotationModel> = try await APIClient.shared.request(endpoint: "/rotations/my")
            self.rotations = rotList.data

            // Fetch Incoming Calls for Trainee (RBAC: /calls/my-incoming)
            let participants: APIListResponse<CallParticipantResponse> = try await APIClient.shared.request(endpoint: "/calls/my-incoming")
            // عرض أول نداء غير مؤكد الوصول
            if let first = participants.data.first(where: { $0.state != "confirmed_arrived" }) {
                self.activeCall = first.call
            } else {
                self.activeCall = nil
            }

            await fetchColleagues()
            await fetchCardQrToken()
            await fetchAttendance()
            await fetchTasks()
        } catch {
            self.errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func acknowledgeCall(callId: String) async {
        do {
            let _: CallParticipantModel = try await APIClient.shared.request(
                endpoint: "/calls/\(callId)/ack",
                method: "POST"
            )
            await fetchDashboardData()
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    func onWay(callId: String) async {
        do {
            let _: CallParticipantModel = try await APIClient.shared.request(
                endpoint: "/calls/\(callId)/on-way",
                method: "POST"
            )
            await fetchDashboardData()
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    func confirmArrival(callId: String) async {
        do {
            let _: CallParticipantModel = try await APIClient.shared.request(
                endpoint: "/calls/\(callId)/arrived",
                method: "POST"
            )
            await fetchDashboardData()
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }
}

// MARK: - CallParticipant Response with nested call
struct CallParticipantResponse: Codable, Identifiable {
    let id: String
    let callId: String
    let traineeProfileId: String
    let state: String
    let notifiedAt: String
    let ackAt: String?
    let selfArrivedAt: String?
    let confirmedAt: String?
    let call: TrainerCallModel?
}
