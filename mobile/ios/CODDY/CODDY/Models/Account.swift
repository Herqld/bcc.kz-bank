import Foundation

struct Account: Codable, Identifiable {
    let id: Int
    let accountNumber: String
    let cardNumber: String?
    let accountType: String
    let balanceKZT: Double
    let balanceUSD: Double
    let currency: String
    let isMain: Bool
    let cardExpiry: String?
    let cardHolderName: String?

    enum CodingKeys: String, CodingKey {
        case id
        case accountNumber = "account_number"
        case cardNumber = "card_number"
        case accountType = "account_type"
        case balanceKZT = "balance_kzt"
        case balanceUSD = "balance_usd"
        case currency
        case isMain = "is_main"
        case cardExpiry = "card_expiry"
        case cardHolderName = "card_holder_name"
    }

    var maskedNumber: String {
        if let card = cardNumber, card.count >= 4 {
            return "•••• \(card.suffix(4))"
        }
        return accountNumber.suffix(4).description
    }

    var formattedBalance: String {
        if currency == "USD" {
            return String(format: "$%.2f", balanceUSD)
        }
        return String(format: "%.2f ₸", balanceKZT)
    }
}

struct DashboardResponse: Codable {
    let success: Bool
    let user: User?
    let accounts: [Account]
    let totals: Totals
    let plus: Bool?

    struct User: Codable {
        let id: Int
        let fullName: String
        let email: String
        let phone: String?
        let isVerified: Bool

        enum CodingKeys: String, CodingKey {
            case id
            case fullName = "full_name"
            case email
            case phone
            case isVerified = "is_verified"
        }
    }

    struct Totals: Codable {
        let incomeKZT: Double
        let expenseKZT: Double
        let incomeUSD: Double
        let expenseUSD: Double

        enum CodingKeys: String, CodingKey {
            case incomeKZT = "income_kzt"
            case expenseKZT = "expense_kzt"
            case incomeUSD = "income_usd"
            case expenseUSD = "expense_usd"
        }
    }
}