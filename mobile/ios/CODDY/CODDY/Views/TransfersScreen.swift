import SwiftUI

struct TransfersScreen: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @EnvironmentObject var authVM: AuthViewModel
    @State private var animateItems = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "0E0F12").ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
                        // Top bar
                        HStack {
                            Text("Transfers")
                                .font(.system(size: 28, weight: .bold, design: .rounded))
                                .foregroundColor(.white)

                            Spacer()

                            Button(action: {}) {
                                Text("All")
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                    .foregroundColor(Color(hex: "16B97C"))
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 8)

                        // Frequent contacts
                        if !frequentContacts.isEmpty || firstCardAccount != nil {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Frequent")
                                    .font(.title3)
                                    .fontWeight(.bold)
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 20)

                                VStack(spacing: 8) {
                                    if let account = firstCardAccount {
                                        FrequentItem(
                                            icon: "arrow.left.arrow.right",
                                            title: "To own accounts",
                                            subtitle: account.maskedNumber,
                                            color: Color(hex: "16B97C")
                                        ) {
                                            // Navigate to own transfer
                                        }
                                    }

                                    ForEach(frequentContacts) { tx in
                                        FrequentItem(
                                            icon: "person.fill",
                                            title: tx.recipient,
                                            subtitle: tx.recipient,
                                            color: Color(hex: "6366F1")
                                        ) {
                                            // Navigate to client transfer
                                        }
                                    }
                                }
                                .padding(.horizontal, 16)
                            }
                            .opacity(animateItems ? 1 : 0)
                            .offset(y: animateItems ? 0 : 20)
                        }

                        // All transfers panel
                        TransferPanelView()
                            .opacity(animateItems ? 1 : 0)
                            .offset(y: animateItems ? 0 : 30)

                        // More section
                        MorePanelView()
                            .opacity(animateItems ? 1 : 0)
                            .offset(y: animateItems ? 0 : 40)

                        Spacer(minLength: 100)
                    }
                }
                .onTapGesture {
                    authVM.recordInteraction()
                }
            }
            .navigationBarHidden(true)
            .onAppear {
                withAnimation(.spring(response: 0.6, dampingFraction: 0.8).delay(0.1)) {
                    animateItems = true
                }
            }
        }
    }

    var frequentContacts: [Transaction] {
        dashVM.transactions
            .filter { $0.type == "transfer_out" && $0.details?["method"] == "phone" }
            .uniqued(on: \.recipient)
            .prefix(5)
            .map { $0 }
    }

    var firstCardAccount: Account? {
        dashVM.dashboard?.accounts.first { $0.accountType == "card" || $0.cardNumber != nil }
    }
}

struct FrequentItem: View {
    let icon: String
    let title: String
    let subtitle: String
    let color: Color
    let action: () -> Void
    @State private var isPressed = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                ZStack {
                    Circle()
                        .fill(color.opacity(0.15))
                        .frame(width: 48, height: 48)

                    Image(systemName: icon)
                        .font(.system(size: 20, weight: .medium))
                        .foregroundColor(color)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.secondary)
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

struct TransferPanelView: View {
    let items = [
        PanelItem(icon: "arrow.left.arrow.right", title: "To Own Accounts", subtitle: "To your card or account (KZT ⇄ USD)", color: Color(hex: "16B97C")),
        PanelItem(icon: "person.fill", title: "To bcc.kz Client", subtitle: "by phone number or card", color: Color(hex: "6366F1")),
        PanelItem(icon: "building.columns.fill", title: "To Other Banks in Kazakhstan", subtitle: "by card number", color: Color(hex: "22C55E")),
        PanelItem(icon: "globe", title: "International Money Transfers", subtitle: "Globally, in USD", color: Color(hex: "F59E0B")),
        PanelItem(icon: "bitcoinsign.circle.fill", title: "To Crypto Wallet", subtitle: "USDT, Bitcoin, Ethereum", color: Color(hex: "8B5CF6")),
        PanelItem(icon: "banknote.fill", title: "From Deposit", subtitle: "To your card or account", color: Color(hex: "16B97C")),
        PanelItem(icon: "person.badge.plus.fill", title: "Money Requests", subtitle: "from one or several people", color: Color(hex: "EC4899")),
        PanelItem(icon: "arrow.clockwise", title: "Autotransfers", subtitle: "Scheduled transfers", color: Color(hex: "3B82F6"))
    ]

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("All Transfers")
                    .font(.headline)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 16)

            VStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    PanelItemView(item: item) {
                        // Handle tap
                    }

                    if index < items.count - 1 {
                        Divider()
                            .background(Color.white.opacity(0.1))
                            .padding(.horizontal, 20)
                    }
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(hex: "17191E"))
            )
            .padding(.horizontal, 16)
        }
    }
}

struct MorePanelView: View {
    let items = [
        PanelItem(icon: "headphones", title: "Bank Contact", subtitle: "Customer Support and Social Media", color: Color(hex: "3B82F6")),
        PanelItem(icon: "arrow.uturn.backward.circle.fill", title: "Refund Requests", subtitle: "Dispute an operation", color: Color(hex: "EF4444"))
    ]

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("More")
                    .font(.headline)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 16)

            VStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    PanelItemView(item: item) {
                        // Handle tap
                    }

                    if index < items.count - 1 {
                        Divider()
                            .background(Color.white.opacity(0.1))
                            .padding(.horizontal, 20)
                    }
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(hex: "17191E"))
            )
            .padding(.horizontal, 16)
        }
    }
}

struct PanelItem: Identifiable {
    let id = UUID()
    let icon: String
    let title: String
    let subtitle: String
    let color: Color
}

struct PanelItemView: View {
    let item: PanelItem
    let action: () -> Void
    @State private var isPressed = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                ZStack {
                    Circle()
                        .fill(item.color.opacity(0.15))
                        .frame(width: 44, height: 44)

                    Image(systemName: item.icon)
                        .font(.system(size: 20, weight: .medium))
                        .foregroundColor(item.color)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)
                    Text(item.subtitle)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
        }
        .buttonStyle(PlainButtonStyle())
        .scaleEffect(isPressed ? 0.98 : 1)
        .animation(.spring(response: 0.2), value: isPressed)
        .onLongPressGesture(minimumDuration: 0, maximumDistance: .infinity, pressing: { isPressed = $0 }, perform: {})
    }
}

extension Sequence {
    func uniqued<Key: Hashable>(on keyPath: KeyPath<Element, Key>) -> [Element] {
        var seen = Set<Key>()
        return filter { seen.insert($0[keyPath: keyPath]).inserted }
    }
}