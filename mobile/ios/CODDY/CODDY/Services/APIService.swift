import Foundation
import Combine

enum APIError: Error {
    case invalidURL
    case noServerFound
    case requestFailed(Error)
    case decodingFailed(Error)
    case httpError(Int)
    case unauthorized
}

protocol APIServiceProtocol {
    func login(email: String, password: String) async throws -> DashboardResponse
    func register(fullName: String, email: String, password: String, phone: String) async throws -> DashboardResponse
    func confirmOTP(opId: String, code: String) async throws -> DashboardResponse
    func resendOTP(opId: String) async throws -> Void
    func refreshDashboard() async throws -> DashboardResponse
    func getTransactions() async throws -> [Transaction]
    func getBillers() async throws -> [Biller]
    func getDeposits() async throws -> [Deposit]
    func getLoans() async throws -> [Loan]
    func getInvestments() async throws -> [Investment]
    func getCryptoWallets() async throws -> [CryptoWallet]
    func logout() async throws -> Void
}

class APIService: APIServiceProtocol, ObservableObject {
    static let shared = APIService()

    private var baseURL: String?
    private let session: URLSession
    private var cancellables = Set<AnyCancellable>()
    private let cookieStorage = HTTPCookieStorage.shared

    private init() {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = cookieStorage
        config.httpCookieAcceptPolicy = .always
        config.timeoutIntervalForRequest = Config.connectTimeout
        config.timeoutIntervalForResource = Config.readTimeout
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.session = URLSession(configuration: config)
    }

    // MARK: - Server Discovery

    private func findWorkingURL() async -> String? {
        for urlString in Config.allURLs {
            guard var components = URLComponents(string: urlString) else { continue }
            components.path = "/api/config"
            guard let url = components.url else { continue }

            var request = URLRequest(url: url)
            request.httpMethod = "HEAD"
            request.timeoutInterval = 3

            do {
                let (_, response) = try await session.data(for: request)
                if let httpResponse = response as? HTTPURLResponse,
                   httpResponse.statusCode == 200 {
                    print("✅ Found working server: \(urlString)")
                    let base = urlString.hasSuffix("/") ? urlString : urlString + "/"
                    await MainActor.run { self.baseURL = base }
                    return base
                }
            } catch {
                print("❌ Server \(urlString) failed: \(error)")
            }
        }

        print("⚠️ No server responded, using first public URL as fallback")
        let fallback = Config.publicURLs[0]
        let base = fallback.hasSuffix("/") ? fallback : fallback + "/"
        await MainActor.run { self.baseURL = base }
        return base
    }

    private func ensureBaseURL() async throws -> String {
        if let url = baseURL { return url }
        if let discovered = await findWorkingURL() { return discovered }
        throw APIError.noServerFound
    }

    // MARK: - Request Helper

    private func request<T: Codable>(_ endpoint: String, method: String = "GET", body: Data? = nil) async throws -> T {
        let base = try await ensureBaseURL()
        guard let url = URL(string: base + endpoint) else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("CODDY-iOS/2.2", forHTTPHeaderField: "User-Agent")
        request.httpBody = body

        // Add cookies
        if let cookies = cookieStorage.cookies(for: url) {
            let headers = HTTPCookie.requestHeaderFields(with: cookies)
            for (key, value) in headers {
                request.setValue(value, forHTTPHeaderField: key)
            }
        }

        do {
            let (data, response) = try await session.data(for: request)

            // Store cookies
            if let httpResponse = response as? HTTPURLResponse,
               let fields = httpResponse.allHeaderFields as? [String: String],
               let url = response.url {
                let cookies = HTTPCookie.cookies(withResponseHeaderFields: fields, for: url)
                cookies.forEach { cookieStorage.setCookie($0) }
            }

            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.requestFailed(URLError(.badServerResponse))
            }

            guard (200...299).contains(httpResponse.statusCode) else {
                if httpResponse.statusCode == 401 {
                    throw APIError.unauthorized
                }
                throw APIError.httpError(httpResponse.statusCode)
            }

            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            return try decoder.decode(T.self, from: data)

        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.requestFailed(error)
        }
    }

    // MARK: - API Endpoints

    func login(email: String, password: String) async throws -> DashboardResponse {
        let body = try JSONEncoder().encode(["email": email, "password": password])
        return try await request("api/login", method: "POST", body: body)
    }

    func register(fullName: String, email: String, password: String, phone: String) async throws -> DashboardResponse {
        let body = try JSONEncoder().encode([
            "full_name": fullName,
            "email": email,
            "password": password,
            "phone": phone
        ])
        return try await request("api/register", method: "POST", body: body)
    }

    func confirmOTP(opId: String, code: String) async throws -> DashboardResponse {
        let body = try JSONEncoder().encode(["op_id": opId, "code": code])
        return try await request("api/otp/confirm", method: "POST", body: body)
    }

    func resendOTP(opId: String) async throws {
        let body = try JSONEncoder().encode(["op_id": opId])
        let _: EmptyResponse = try await request("api/otp/resend", method: "POST", body: body)
    }

    func refreshDashboard() async throws -> DashboardResponse {
        return try await request("api/dashboard")
    }

    func getTransactions() async throws -> [Transaction] {
        let response: TransactionsResponse = try await request("api/transactions")
        return response.transactions ?? []
    }

    func getBillers() async throws -> [Biller] {
        let response: BillersResponse = try await request("api/billers")
        return response.billers ?? []
    }

    func getDeposits() async throws -> [Deposit] {
        let response: DepositsResponse = try await request("api/deposits")
        return response.deposits ?? []
    }

    func getLoans() async throws -> [Loan] {
        let response: LoansResponse = try await request("api/loans")
        return response.loans ?? []
    }

    func getInvestments() async throws -> [Investment] {
        let response: InvestResponse = try await request("api/invest")
        return response.portfolio ?? []
    }

    func getCryptoWallets() async throws -> [CryptoWallet] {
        let response: CryptoResponse = try await request("api/crypto/wallets")
        return response.wallets ?? []
    }

    func logout() async throws {
        let _: EmptyResponse = try await request("api/logout", method: "POST")
        // Clear cookies
        if let cookies = cookieStorage.cookies {
            cookies.forEach { cookieStorage.deleteCookie($0) }
        }
        baseURL = nil
    }
}

private struct EmptyResponse: Codable {}