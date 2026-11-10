import Foundation

struct Biller: Codable, Identifiable {
    let id: String
    let name: String
    let category: String
    let description: String?
    let logoUrl: String?
    let hasCashback: Bool
    let cashbackPercent: Double?

    enum CodingKeys: String, CodingKey {
        case id, name, category, description
        case logoUrl = "logo_url"
        case hasCashback = "has_cashback"
        case cashbackPercent = "cashback_percent"
    }
}

struct BillersResponse: Codable {
    let success: Bool
    let billers: [Biller]?
}

struct Deposit: Codable, Identifiable {
    let id: Int
    let name: String
    let currency: String
    let amount: Double
    let interestRate: Double
    let startDate: String
    let endDate: String
    let status: String
    let canWithdraw: Bool

    enum CodingKeys: String, CodingKey {
        case id, name, currency, amount
        case interestRate = "interest_rate"
        case startDate = "start_date"
        case endDate = "end_date"
        case status
        case canWithdraw = "can_withdraw"
    }
}

struct DepositsResponse: Codable {
    let success: Bool
    let deposits: [Deposit]?
}

struct Loan: Codable, Identifiable {
    let id: Int
    let type: String
    let amount: Double
    let currency: String
    let interestRate: Double
    let termMonths: Int
    let monthlyPayment: Double
    let remainingBalance: Double
    let status: String
    let nextPaymentDate: String?

    enum CodingKeys: String, CodingKey {
        case id, type, amount, currency
        case interestRate = "interest_rate"
        case termMonths = "term_months"
        case monthlyPayment = "monthly_payment"
        case remainingBalance = "remaining_balance"
        case status
        case nextPaymentDate = "next_payment_date"
    }
}

struct LoansResponse: Codable {
    let success: Bool
    let loans: [Loan]?
}

struct Investment: Codable, Identifiable {
    let id: Int
    let symbol: String
    let name: String
    let quantity: Double
    let avgPrice: Double
    let currentPrice: Double
    let currency: String
    let profitLoss: Double
    let profitLossPercent: Double

    enum CodingKeys: String, CodingKey {
        case id, symbol, name, quantity
        case avgPrice = "avg_price"
        case currentPrice = "current_price"
        case currency
        case profitLoss = "profit_loss"
        case profitLossPercent = "profit_loss_percent"
    }
}

struct InvestResponse: Codable {
    let success: Bool
    let portfolio: [Investment]?
}

struct CryptoWallet: Codable, Identifiable {
    let id: Int
    let asset: String
    let address: String
    let network: String
    let balance: Double
    let usdValue: Double

    enum CodingKeys: String, CodingKey {
        case id, asset, address, network, balance
        case usdValue = "usd_value"
    }
}

struct CryptoResponse: Codable {
    let success: Bool
    let wallets: [CryptoWallet]?
}