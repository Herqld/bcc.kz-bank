import Foundation

struct Transaction: Codable, Identifiable {
    let id: Int
    let userId: Int
    let type: String
    let amount: Double
    let currency: String
    let sender: String
    let recipient: String
    let description: String?
    let status: String
    let date: String
    let details: [String: String]?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case type = "transaction_type"
        case amount
        case currency
        case sender
        case recipient
        case description
        case status
        case date = "transaction_date"
        case details
    }

    var isIncome: Bool {
        let incomeTypes = ["transfer_in", "top_up", "deposit_withdraw", "loan_disbursement",
                          "invest_sell", "cashback_withdraw", "refund", "goal_withdraw"]
        return incomeTypes.contains(type)
    }

    var formattedAmount: String {
        let sign = isIncome ? "+" : "-"
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 2
        formatter.minimumFractionDigits = 2
        formatter.groupingSeparator = " "
        formatter.decimalSeparator = ","
        let formatted = formatter.string(from: NSNumber(value: amount)) ?? "\(amount)"
        return "\(sign)\(formatted) \(currency)"
    }

    var formattedDate: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        if let date = formatter.date(from: date) {
            formatter.dateStyle = .medium
            formatter.timeStyle = .short
            return formatter.string(from: date)
        }
        return date
    }

    var iconName: String {
        switch type {
        case "transfer_in", "transfer_out", "domestic_out", "international_out":
            return "arrow.left.arrow.right"
        case "top_up":
            return "plus.circle.fill"
        case "bill_payment", "tax_payment", "subscription_payment":
            return "doc.text.fill"
        case "purchase":
            return "creditcard.fill"
        case "crypto_out", "crypto_in":
            return "bitcoinsign.circle.fill"
        case "deposit_withdraw", "goal_deposit", "goal_withdraw":
            return "banknote.fill"
        case "loan_disbursement", "loan_payment":
            return "building.columns.fill"
        case "invest_buy", "invest_sell":
            return "chart.line.uptrend.xyaxis"
        case "cashback_withdraw":
            return "star.fill"
        case "refund":
            return "arrow.uturn.backward.circle.fill"
        default:
            return "dollarsign.circle.fill"
        }
    }

    var displayTitle: String {
        switch type {
        case "transfer_in":
            return details?["counterparty"] ?? "Incoming transfer"
        case "transfer_out":
            let method = details?["method"] ?? "phone"
            if method == "own" { return "To own account" }
            return details?["counterparty"] ?? recipient
        case "domestic_out":
            return details?["bank"] ?? "Other bank"
        case "international_out":
            return details?["beneficiary"] ?? "International transfer"
        case "top_up":
            return "Top-up"
        case "bill_payment":
            return details?["provider"] ?? "Payment"
        case "tax_payment":
            return details?["service"] ?? "State payment"
        case "crypto_out":
            let asset = details?["asset"] ?? ""
            let address = details?["address"] ?? ""
            return "Crypto: \(asset) \(address)".trimmingCharacters(in: .whitespaces)
        case "purchase":
            return details?["merchant"] ?? "Card purchase"
        case "subscription_payment":
            return details?["provider"] ?? "Subscription"
        case "goal_deposit":
            let goal = details?["goal"] ?? ""
            let roundUp = details?["roundUp"] == "true"
            return roundUp ? "Round-up → \(goal)" : "To goal: \(goal)"
        case "goal_withdraw":
            return "From goal: \(details?["goal"] ?? "")"
        case "deposit_withdraw":
            return "Deposit withdrawal"
        case "loan_disbursement":
            return "Loan received"
        case "loan_payment":
            return "Loan payment"
        case "invest_buy":
            return "Invest: buy \(details?["symbol"] ?? "")"
        case "invest_sell":
            return "Invest: sell \(details?["symbol"] ?? "")"
        case "cashback_withdraw":
            return "Cashback paid out"
        case "refund":
            return "Refund"
        default:
            return description ?? type
        }
    }
}

struct TransactionsResponse: Codable {
    let success: Bool
    let transactions: [Transaction]?
}