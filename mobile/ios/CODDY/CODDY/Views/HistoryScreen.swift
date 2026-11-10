import SwiftUI

struct HistoryScreen: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @EnvironmentObject var authVM: AuthViewModel
    @State private var selectedFilter = "All"
    @State private var animateItems = false

    let filters = ["All", "Transfers", "Top-ups", "Payments", "Card Purchases", "Deposits", "Loans", "Investments", "Other"]

    var filteredTransactions: [Transaction] {
        switch selectedFilter {
        case "All":
            return dashVM.transactions
        case "Transfers":
            return dashVM.transactions.filter { ["transfer_in", "transfer_out", "domestic_out", "international_out"].contains($0.type) }
        case "Top-ups":
            return dashVM.transactions.filter { $0.type == "top_up" }
        case "Payments":
            return dashVM.transactions.filter { ["bill_payment", "tax_payment", "subscription_payment"].contains($0.type) }
        case "Card Purchases":
            return dashVM.transactions.filter { $0.type == "purchase" }
        case "Deposits":
            return dashVM.transactions.filter { ["deposit_withdraw", "goal_deposit", "goal_withdraw"].contains($0.type) }
        case "Loans":
            return dashVM.transactions.filter { ["loan_disbursement", "loan_payment"].contains($0.type) }
        case "Investments":
            return dashVM.transactions.filter { ["invest_buy", "invest_sell"].contains($0.type) }
        default:
            let excluded = ["transfer_in", "transfer_out", "domestic_out", "international_out", "top_up", "bill_payment", "tax_payment", "subscription_payment", "purchase", "deposit_withdraw", "goal_deposit", "goal_withdraw", "loan_disbursement", "loan_payment", "invest_buy", "invest_sell"]
            return dashVM.transactions.filter { !excluded.contains($0.type) }
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "0E0F12").ignoresSafeArea()

                VStack(spacing: 0) {
                    // Top bar
                    HStack {
                        Text("History")
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        Spacer()
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 8)

                    // Filter chips
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(filters, id: \.self) { filter in
                                FilterChip(
                                    title: filter,
                                    isSelected: selectedFilter == filter,
                                    action: { selectedFilter = filter }
                                )
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                    .padding(.bottom, 16)

                    // Transaction list
                    if filteredTransactions.isEmpty {
                        VStack(spacing: 16) {
                            Spacer()
                            Image(systemName: "doc.text.magnifyingglass")
                                .font(.system(size: 48))
                                .foregroundColor(.secondary.opacity(0.5))
                            Text("No transactions")
                                .font(.headline)
                                .foregroundColor(.secondary)
                            Spacer()
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 8) {
                                ForEach(Array(filteredTransactions.enumerated()), id: \.element.id) { index, tx in
                                    TransactionRow(transaction: tx)
                                        .opacity(animateItems ? 1 : 0)
                                        .offset(y: animateItems ? 0 : 20)
                                        .animation(.spring(response: 0.4, dampingFraction: 0.8).delay(Double(index) * 0.03), value: animateItems)
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.bottom, 100)
                        }
                    }
                }
            }
            .navigationBarHidden(true)
            .onAppear {
                withAnimation(.spring(response: 0.6, dampingFraction: 0.8).delay(0.1)) {
                    animateItems = true
                }
            }
            .onTapGesture {
                authVM.recordInteraction()
            }
        }
    }
}

struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: isSelected ? .bold : .medium))
                .foregroundColor(isSelected ? .black : .white)
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(isSelected ? Color(hex: "16B97C") : Color(hex: "17191E"))
                )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct TransactionRow: View {
    let transaction: Transaction
    @State private var isPressed = false

    var incomeColor: Color { transaction.isIncome ? Color(hex: "16B97C") : Color.red }
    var backgroundColor: Color { transaction.isIncome ? Color(hex: "16B97C").opacity(0.15) : Color.red.opacity(0.15) }

    var body: some View {
        Button(action: {}) {
            HStack(spacing: 16) {
                ZStack {
                    Circle()
                        .fill(backgroundColor)
                        .frame(width: 44, height: 44)

                    Image(systemName: transaction.iconName)
                        .font(.system(size: 20, weight: .medium))
                        .foregroundColor(incomeColor)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(transaction.displayTitle)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)
                    Text(transaction.formattedDate)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text(transaction.formattedAmount)
                        .font(.subheadline)
                        .fontWeight(.bold)
                        .foregroundColor(incomeColor)
                    Text(transaction.status)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(hex: "17191E"))
            )
        }
        .buttonStyle(PlainButtonStyle())
        .scaleEffect(isPressed ? 0.98 : 1)
        .animation(.spring(response: 0.2), value: isPressed)
        .onLongPressGesture(minimumDuration: 0, maximumDistance: .infinity, pressing: { isPressed = $0 }, perform: {})
    }
}