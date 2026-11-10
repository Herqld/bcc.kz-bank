import Foundation
import Combine

class DashboardViewModel: ObservableObject {
    static let shared = DashboardViewModel()

    @Published var dashboard: DashboardResponse?
    @Published var transactions: [Transaction] = []
    @Published var billers: [Biller] = []
    @Published var deposits: [Deposit] = []
    @Published var loans: [Loan] = []
    @Published var investments: [Investment] = []
    @Published var cryptoWallets: [CryptoWallet] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let api = APIService.shared
    private var cancellables = Set<AnyCancellable>()

    private init() {}

    func refreshAll() {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil

        Task {
            async let dash = api.refreshDashboard()
            async let tx = api.getTransactions()
            async let bills = api.getBillers()
            async let deps = api.getDeposits()
            async let lns = api.getLoans()
            async let inv = api.getInvestments()
            async let crypto = api.getCryptoWallets()

            do {
                let results = try await (dash, tx, bills, deps, lns, inv, crypto)
                await MainActor.run {
                    self.dashboard = results.0
                    self.transactions = results.1
                    self.billers = results.2
                    self.deposits = results.3
                    self.loans = results.4
                    self.investments = results.5
                    self.cryptoWallets = results.6
                    self.isLoading = false
                }
            } catch {
                await MainActor.run {
                    self.errorMessage = error.localizedDescription
                    self.isLoading = false
                }
            }
        }
    }

    func refreshTransactions() {
        Task {
            do {
                let tx = try await api.getTransactions()
                await MainActor.run { self.transactions = tx }
            } catch {
                await MainActor.run { self.errorMessage = error.localizedDescription }
            }
        }
    }
}