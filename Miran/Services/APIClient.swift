//
//  APIClient.swift
//  Miran
//
//  Production-ready REST API Networking Client with Async/Await,
//  JWT token injection, Multi-Org header switching, and 401 refresh token rotation.
//

import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse(statusCode: Int)
    case decodingError(Error)
    case serverError(message: String)
    case unauthorized

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "الرابط غير صالح"
        case .invalidResponse(let code):
            return "استجابة غير صالحة من الخادم (رمز: \(code))"
        case .decodingError(let err):
            return "خطأ في قراءة البيانات: \(err.localizedDescription)"
        case .serverError(let msg):
            return msg
        case .unauthorized:
            return "غير مصرح بالدخول — انتهت صلاحية الجلسة"
        }
    }
}

final class APIClient {
    static let shared = APIClient()
    private init() {}

    var baseURL = "https://fawaz-backend-abx3.onrender.com/api/v1"

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20.0
        config.timeoutIntervalForResource = 30.0
        config.waitsForConnectivity = true
        return URLSession(configuration: config)
    }()

    // MARK: - Generic Request Method
    func request<T: Decodable>(
        endpoint: String,
        method: String = "GET",
        body: (any Encodable)? = nil,
        requiresAuth: Bool = true
    ) async throws -> T {
        let cleanEndpoint = endpoint.hasPrefix("/") ? endpoint : "/\(endpoint)"
        guard let url = URL(string: "\(baseURL)\(cleanEndpoint)") else {
            print("❌ [API ERROR] Endpoint: \(cleanEndpoint) | Invalid URL: \(baseURL)\(cleanEndpoint)")
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Inject Auth & Org Context Headers
        if requiresAuth {
            if let token = KeychainService.shared.get(forKey: "access_token") {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }
            if let orgId = KeychainService.shared.get(forKey: "active_org_id") {
                request.setValue(orgId, forHTTPHeaderField: "X-Organization-Id")
            }
        }

        // Encode HTTP Body
        if let body = body {
            request.httpBody = try JSONEncoder().encode(body)
        }

        do {
            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                print("❌ [API ERROR] Endpoint: \(cleanEndpoint) | Invalid Response (Non-HTTP)")
                throw APIError.invalidResponse(statusCode: 0)
            }

            // Handle 401 Unauthorized (Attempt Refresh)
            if httpResponse.statusCode == 401 && requiresAuth {
                print("⚠️ [API REFRESH] Endpoint: \(cleanEndpoint) | 401 Unauthorized -> Attempting Token Refresh")
                let refreshed = await attemptTokenRefresh()
                if refreshed {
                    return try await self.request(endpoint: endpoint, method: method, body: body, requiresAuth: requiresAuth)
                } else {
                    print("❌ [API ERROR] Endpoint: \(cleanEndpoint) | Status Code: 401 | Refresh Token Expired/Failed")
                    throw APIError.unauthorized
                }
            }

            // Handle Success
            if (200...299).contains(httpResponse.statusCode) {
                let decoder = JSONDecoder()
                decoder.keyDecodingStrategy = .useDefaultKeys
                do {
                    return try decoder.decode(T.self, from: data)
                } catch let decErr as DecodingError {
                    let detail: String
                    switch decErr {
                    case .typeMismatch(let type, let ctx):
                        detail = "Type mismatch for '\(type)' at path: \(ctx.codingPath.map(\.stringValue).joined(separator: ".")) — \(ctx.debugDescription)"
                    case .valueNotFound(let type, let ctx):
                        detail = "Value of type '\(type)' not found at path: \(ctx.codingPath.map(\.stringValue).joined(separator: ".")) — \(ctx.debugDescription)"
                    case .keyNotFound(let key, let ctx):
                        detail = "Key '\(key.stringValue)' not found at path: \(ctx.codingPath.map(\.stringValue).joined(separator: ".")) — \(ctx.debugDescription)"
                    case .dataCorrupted(let ctx):
                        detail = "Data corrupted at path: \(ctx.codingPath.map(\.stringValue).joined(separator: ".")) — \(ctx.debugDescription)"
                    @unknown default:
                        detail = decErr.localizedDescription
                    }
                    print("❌ [API DECODING ERROR] Endpoint: \(cleanEndpoint) | Details: \(detail)")
                    throw APIError.decodingError(decErr)
                } catch {
                    print("❌ [API ERROR] Endpoint: \(cleanEndpoint) | Decoding Failed: \(error)")
                    throw APIError.decodingError(error)
                }
            }

            // Handle Error JSON Response
            var serverMessage = "حدث خطأ غير متوقع"
            if let errorObj = try? JSONDecoder().decode(ServerErrorResponse.self, from: data),
               let msg = errorObj.message {
                serverMessage = msg
            }

            print("❌ [API ERROR] Endpoint: \(cleanEndpoint) | Status Code: \(httpResponse.statusCode) | Server Message: \(serverMessage)")
            throw APIError.serverError(message: serverMessage)

        } catch {
            if !(error is APIError) {
                print("❌ [API ERROR] Endpoint: \(cleanEndpoint) | Network Failure: \(error.localizedDescription)")
            }
            throw error
        }
    }

    // MARK: - Void Request Method (for DELETE / PUT without JSON response)
    func requestVoid(
        endpoint: String,
        method: String = "DELETE",
        body: (any Encodable)? = nil,
        requiresAuth: Bool = true
    ) async throws {
        let cleanEndpoint = endpoint.hasPrefix("/") ? endpoint : "/\(endpoint)"
        guard let url = URL(string: "\(baseURL)\(cleanEndpoint)") else {
            throw APIError.invalidURL
        }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if requiresAuth, let token = KeychainService.shared.get(forKey: "access_token") {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = body {
            req.httpBody = try? JSONEncoder().encode(body)
        }

        let (_, response) = try await session.data(for: req)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse(statusCode: 500)
        }

        if httpResponse.statusCode == 401 && requiresAuth {
            let refreshed = await attemptTokenRefresh()
            if refreshed {
                return try await requestVoid(endpoint: endpoint, method: method, body: body, requiresAuth: requiresAuth)
            } else {
                throw APIError.unauthorized
            }
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.invalidResponse(statusCode: httpResponse.statusCode)
        }
    }

    // MARK: - Token Refresh
    private func attemptTokenRefresh() async -> Bool {
        guard let refreshToken = KeychainService.shared.get(forKey: "refresh_token") else {
            return false
        }

        guard let url = URL(string: "\(baseURL)/auth/refresh-token") else { return false }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = ["refreshToken": refreshToken]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (data, resp) = try await session.data(for: req)
            guard let httpResp = resp as? HTTPURLResponse, httpResp.statusCode == 200 else {
                return false
            }

            let pair = try JSONDecoder().decode(TokenPair.self, from: data)
            KeychainService.shared.save(pair.accessToken, forKey: "access_token")
            KeychainService.shared.save(pair.refreshToken, forKey: "refresh_token")
            return true
        } catch {
            return false
        }
    }

    // MARK: - Hospital Candidate Review & Onboarding APIs
    func fetchHospitalReviewTrainees() async throws -> [TrainingRequestTraineeRow] {
        let res: APIListResponse<TrainingRequestTraineeRow> = try await request(endpoint: "/training-requests/hospital-review")
        return res.data
    }

    func approveCandidateRow(rowId: String) async throws {
        try await requestVoid(endpoint: "/training-requests/trainees/\(rowId)/approve", method: "POST")
    }

    func rejectCandidateRow(rowId: String, reason: String) async throws {
        let body = ["reason": reason]
        try await requestVoid(endpoint: "/training-requests/trainees/\(rowId)/reject", method: "POST", body: body)
    }

    func returnCandidateRowToUniversity(rowId: String, notes: String) async throws {
        let body = ["notes": notes]
        try await requestVoid(endpoint: "/training-requests/trainees/\(rowId)/return", method: "POST", body: body)
    }

    func reviewCandidateDocument(docId: String, action: String, notes: String? = nil) async throws {
        var body: [String: String] = ["action": action]
        if let notes = notes { body["notes"] = notes }
        try await requestVoid(endpoint: "/trainee-documents/\(docId)/review", method: "POST", body: body)
    }

    // MARK: - Trainee Documents Multipart Upload API
    struct TraineeDocumentResponse: Decodable {
        let id: String
        let documentType: String
        let titleAr: String?
        let storageKey: String
    }

    private struct TraineeDocumentEnvelope: Decodable {
        let data: TraineeDocumentResponse
        let success: Bool?
    }

    func uploadTraineeDocument(
        fileData: Data,
        fileName: String,
        documentType: String,
        trainingRequestTraineeId: String,
        titleAr: String = "خطاب الامتياز الرسمي",
        isMandatory: Bool = true,
        mimeType: String = "application/pdf"
    ) async throws -> TraineeDocumentResponse {
        let cleanEndpoint = "/trainee-documents/upload"
        guard let url = URL(string: "\(baseURL)\(cleanEndpoint)") else {
            throw APIError.invalidURL
        }

        let boundary = "Boundary-\(UUID().uuidString)"
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        if let token = KeychainService.shared.get(forKey: "access_token") {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let orgId = KeychainService.shared.get(forKey: "active_org_id") {
            req.setValue(orgId, forHTTPHeaderField: "X-Organization-Id")
        }

        var body = Data()

        func appendFormField(name: String, value: String) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }

        appendFormField(name: "documentType", value: documentType)
        appendFormField(name: "trainingRequestTraineeId", value: trainingRequestTraineeId)
        appendFormField(name: "titleAr", value: titleAr)
        appendFormField(name: "isMandatory", value: isMandatory ? "true" : "false")

        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        req.httpBody = body

        let (data, response) = try await session.data(for: req)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse(statusCode: 0)
        }

        if !(200...299).contains(httpResponse.statusCode) {
            let errorMsg = try? JSONDecoder().decode(ServerErrorResponse.self, from: data).message
            throw APIError.serverError(message: errorMsg ?? "فشل رفع مستند المتدرب إلى السيرفر (\(httpResponse.statusCode))")
        }

        let envelope = try JSONDecoder().decode(TraineeDocumentEnvelope.self, from: data)
        return envelope.data
    }
}

private struct ServerErrorResponse: Decodable {
    let message: String?
}

struct AnyEncodable: Encodable {
    private let encodeClosure: (Encoder) throws -> Void

    init<T>(_ value: T) {
        if let enc = value as? Encodable {
            self.encodeClosure = { encoder in
                var container = encoder.singleValueContainer()
                try container.encode(enc)
            }
        } else {
            self.encodeClosure = { encoder in
                var container = encoder.singleValueContainer()
                try container.encodeNil()
            }
        }
    }

    func encode(to encoder: Encoder) throws {
        try encodeClosure(encoder)
    }
}
