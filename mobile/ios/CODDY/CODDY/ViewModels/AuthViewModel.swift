import Foundation
import Combine
import LocalAuthentication

class AuthViewModel: ObservableObject {
    static let shared = AuthViewModel()

    @Published var isAuthenticated = false
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var showOTP = false
    @Published var otpOpId: String?
    @Published var dashboard: DashboardResponse?

    private let api = APIService.shared
    let keychain = KeychainHelper.shared
    private var autoLogoutTimer: Timer?
    private var lastInteraction = Date()

    private init() {
        checkAuthOnLaunch()
    }

    func checkAuthOnLaunch() {
        Task {
            do {
                let dash = try await api.refreshDashboard()
                await MainActor.run {
                    self.dashboard = dash
                    self.isAuthenticated = true
                    self.startAutoLogoutTimer()
                }
            } catch {
                await MainActor.run { self.isAuthenticated = false }
            }
        }
    }

    func login(email: String, password: String) {
        isLoading = true
        errorMessage = nil

        Task {
            do {
                let dash = try await api.login(email: email, password: password)
                await MainActor.run {
                    self.dashboard = dash
                    self.isAuthenticated = true
                    self.isLoading = false
                    self.keychain.savedEmail = email
                    self.keychain.savedPassword = password
                    self.startAutoLogoutTimer()
                }
            } catch {
                await MainActor.run {
                    self.isLoading = false
                    self.errorMessage = error.localizedDescription
                }
            }
        }
    }

    func register(fullName: String, email: String, password: String, phone: String) {
        isLoading = true
        errorMessage = nil

        Task {
            do {
                let dash = try await api.register(fullName: fullName, email: email, password: password, phone: phone)
                if dash.success == false {
                    // OTP required
                    await MainActor.run {
                        self.isLoading = false
                        self.showOTP = true
                        self.otpOpId = dash.user?.id.description ?? ""
                    }
                } else {
                    await MainActor.run {
                        self.dashboard = dash
                        self.isAuthenticated = true
                        self.isLoading = false
                        self.keychain.savedEmail = email
                        self.keychain.savedPassword = password
                        self.startAutoLogoutTimer()
                    }
                }
            } catch {
                await MainActor.run {
                    self.isLoading = false
                    self.errorMessage = error.localizedDescription
                }
            }
        }
    }

    func confirmOTP(code: String) {
        guard let opId = otpOpId else { return }
        isLoading = true
        errorMessage = nil

        Task {
            do {
                let dash = try await api.confirmOTP(opId: opId, code: code)
                await MainActor.run {
                    self.dashboard = dash
                    self.isAuthenticated = true
                    self.isLoading = false
                    self.showOTP = false
                    self.otpOpId = nil
                    self.startAutoLogoutTimer()
                }
            } catch {
                await MainActor.run {
                    self.isLoading = false
                    self.errorMessage = error.localizedDescription
                }
            }
        }
    }

    func resendOTP() {
        guard let opId = otpOpId else { return }

        Task {
            do {
                try await api.resendOTP(opId: opId)
                await MainActor.run { self.errorMessage = "Code resent" }
            } catch {
                await MainActor.run { self.errorMessage = error.localizedDescription }
            }
        }
    }

    func logout() {
        isLoading = true

        Task {
            do {
                try await api.logout()
                await MainActor.run {
                    self.isAuthenticated = false
                    self.dashboard = nil
                    self.isLoading = false
                    self.stopAutoLogoutTimer()
                }
            } catch {
                await MainActor.run {
                    self.isAuthenticated = false
                    self.dashboard = nil
                    self.isLoading = false
                    self.stopAutoLogoutTimer()
                }
            }
        }
    }

    func recordInteraction() {
        lastInteraction = Date()
    }

    private func startAutoLogoutTimer() {
        stopAutoLogoutTimer()
        autoLogoutTimer = Timer.scheduledTimer(withTimeInterval: Config.autoLogoutInterval, repeats: true) { _ in
            if Date().timeIntervalSince(self.lastInteraction) > Config.autoLogoutInterval {
                Task { @MainActor in
                    if self.isAuthenticated {
                        self.logout()
                    }
                }
            }
        }
    }

    private func stopAutoLogoutTimer() {
        autoLogoutTimer?.invalidate()
        autoLogoutTimer = nil
    }

    func authenticateWithBiometrics() async -> Bool {
        let context = LAContext()
        var error: NSError?

        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return false
        }

        do {
            let success = try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: "Unlock CODDY with Face ID / Touch ID"
            )
            if success, let email = keychain.savedEmail, let password = keychain.savedPassword {
                await MainActor.run {
                    self.login(email: email, password: password)
                }
            }
            return success
        } catch {
            return false
        }
    }
}