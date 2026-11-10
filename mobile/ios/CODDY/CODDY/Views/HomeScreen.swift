import SwiftUI

struct HomeScreen: View {
    @EnvironmentObject var authVM: AuthViewModel
    @EnvironmentObject var dashVM: DashboardViewModel
    @State private var selectedAccountIndex = 0
    @State private var hideBalance = false
    @State private var animateCards = false
    @State private var showProfile = false
    @State private var showNotifications = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "0E0F12").ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 0) {
                        // Top bar
                        topBar

                        // Greeting
                        greetingSection

                        // Card carousel
                        cardCarousel

                        // Quick actions
                        quickActions

                        // Financial strip
                        financialStrip

                        // Stories
                        storiesRow

                        // Duo tiles
                        duoTiles

                        // Quick chips
                        quickChips

                        // Interest panels
                        interestPanels

                        Spacer(minLength: 100)
                    }
                }
                .refreshable {
                    dashVM.refreshAll()
                }
                .onTapGesture {
                    authVM.recordInteraction()
                }
            }
            .navigationBarHidden(true)
            .sheet(isPresented: $showProfile) {
                ProfileScreen()
            }
            .sheet(isPresented: $showNotifications) {
                NotificationsScreen()
            }
        }
    }

    var topBar: some View {
        HStack {
            Text("CODDY")
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(.white)

            Spacer()

            Button(action: { showNotifications = true }) {
                ZStack {
                    Circle()
                        .fill(Color(hex: "17191E"))
                        .frame(width: 44, height: 44)

                    Image(systemName: "bell.fill")
                        .font(.system(size: 20))
                        .foregroundColor(.white)

                    if let dash = dashVM.dashboard,
                       let unread = dash.user?.isVerified ? 1 : 0,
                       unread > 0 {
                        Circle()
                            .fill(Color.red)
                            .frame(width: 16, height: 16)
                            .overlay(
                                Text("\(min(unread, 9))")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.white)
                            )
                            .offset(x: 12, y: -12)
                    }
                }
            }

            Button(action: { showProfile = true }) {
                Circle()
                    .fill(Color(hex: "16B97C"))
                    .frame(width: 44, height: 44)
                    .overlay(
                        Text(authVM.dashboard?.user?.fullName.prefix(1).uppercased() ?? "U")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(.white)
                    )
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 16)
    }

    var greetingSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Hello, \(authVM.dashboard?.user?.fullName.split(separator: " ").first ?? "User")")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(.white)

            if authVM.dashboard?.plus == true {
                HStack(spacing: 6) {
                    Image(systemName: "star.fill")
                        .font(.system(size: 12))
                    Text("bcc Plus Active")
                        .font(.caption)
                        .fontWeight(.medium)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(
                    Capsule()
                        .fill(Color.yellow.opacity(0.2))
                )
                .foregroundColor(.yellow)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
    }

    var cardCarousel: some View {
        TabView(selection: $selectedAccountIndex) {
            ForEach(Array((dashVM.dashboard?.accounts ?? []).enumerated()), id: \.element.id) { index, account in
                AccountCardView(account: account, hideBalance: hideBalance)
                    .padding(.horizontal, 20)
                    .tag(index)
            }

            // Add card placeholder
            AddCardPlaceholder()
                .padding(.horizontal, 20)
                .tag(dashVM.dashboard?.accounts.count ?? 0)
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .frame(height: 220)
        .animation(.spring(response: 0.4), value: selectedAccountIndex)

        // Page indicator
        HStack(spacing: 8) {
            ForEach(0..<(dashVM.dashboard?.accounts.count ?? 0) + 1, id: \.self) { index in
                Circle()
                    .fill(selectedAccountIndex == index ? Color(hex: "16B97C") : Color.white.opacity(0.3))
                    .frame(width: index == selectedAccountIndex ? 24 : 8, height: 8)
                    .animation(.spring(response: 0.3), value: selectedAccountIndex)
            }
        }
        .padding(.top, 8)
    }

    var quickActions: some View {
        let actions = [
            QuickAction(title: "Transfer", icon: "arrow.up.right", color: Color(hex: "16B97C"), route: "own"),
            QuickAction(title: "Top Up", icon: "plus", color: Color(hex: "16B97C"), route: "topup"),
            QuickAction(title: "To bcc Client", icon: "person.fill", color: Color(hex: "6366F1"), route: "client"),
            QuickAction(title: "Other Bank", icon: "building.columns.fill", color: Color(hex: "22C55E"), route: "domestic"),
            QuickAction(title: "International", icon: "globe", color: Color(hex: "F59E0B"), route: "intl"),
            QuickAction(title: "Crypto", icon: "bitcoinsign.circle.fill", color: Color(hex: "8B5CF6"), route: "crypto")
        ]

        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(actions) { action in
                    QuickActionButton(action: action) {
                        // Handle navigation
                        handleQuickAction(action.route)
                    }
                }
            }
            .padding(.horizontal, 20)
        }
        .padding(.vertical, 16)
    }

    var financialStrip: some View {
        guard let totals = dashVM.dashboard?.totals else { return AnyView(EmptyView()) }

        return AnyView(
            HStack(spacing: 16) {
                FinanceStatItem(
                    title: "Income",
                    kzt: hideBalance ? "***" : String(format: "%.0f ₸", totals.incomeKZT),
                    usd: hideBalance ? "***" : String(format: "$%.0f", totals.incomeUSD),
                    color: Color(hex: "16B97C"),
                    icon: "arrow.down.circle.fill"
                )

                FinanceStatItem(
                    title: "Expenses",
                    kzt: hideBalance ? "***" : String(format: "%.0f ₸", totals.expenseKZT),
                    usd: hideBalance ? "***" : String(format: "$%.0f", totals.expenseUSD),
                    color: Color.red,
                    icon: "arrow.up.circle.fill"
                )

                Button(action: { hideBalance.toggle() }) {
                    Image(systemName: hideBalance ? "eye.slash.fill" : "eye.fill")
                        .font(.system(size: 20))
                        .foregroundColor(.secondary)
                        .frame(width: 48, height: 48)
                        .background(
                            Circle()
                                .fill(Color(hex: "17191E"))
                        )
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
        )
    }

    var storiesRow: some View {
        let stories = [
            StoryItem(title: "New USD Cards", icon: "creditcard.fill", color: Color(hex: "16B97C")),
            StoryItem(title: "bcc Shield", icon: "shield.fill", color: Color(hex: "F59E0B")),
            StoryItem(title: "Send Abroad", icon: "globe", color: Color(hex: "3B82F6")),
            StoryItem(title: "Crypto Wallets", icon: "bitcoinsign.circle.fill", color: Color(hex: "8B5CF6"))
        ]

        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(stories) { story in
                    StoryCircle(story: story)
                }
            }
            .padding(.horizontal, 20)
        }
        .padding(.vertical, 8)
    }

    var duoTiles: some View {
        HStack(spacing: 12) {
            DuoTile(title: "My Analytics", subtitle: "Income and expenses", icon: "chart.bar.fill", color: Color(hex: "16B97C")) {
                // Navigate to analytics
            }

            DuoTile(title: "Cashback", subtitle: "Choose monthly categories", icon: "star.fill", color: Color(hex: "F59E0B")) {
                // Navigate to cashback
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
    }

    var quickChips: some View {
        let chips = [
            QuickChip(title: "QR", icon: "qrcode", color: Color(hex: "16B97C")),
            QuickChip(title: "Chat", icon: "message.fill", color: Color(hex: "6366F1")),
            QuickChip(title: "Public Services", icon: "building.columns.fill", color: Color(hex: "3B82F6")),
            QuickChip(title: "Shield", icon: "shield.fill", color: Color(hex: "F59E0B")),
            QuickChip(title: "Offers", icon: "tag.fill", color: Color(hex: "EC4899")),
            QuickChip(title: "Documents", icon: "doc.fill", color: Color(hex: "8B5CF6"))
        ]

        return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3), spacing: 12) {
            ForEach(chips) { chip in
                QuickChipView(chip: chip) {
                    // Handle chip tap
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
    }

    var interestPanels: some View {
        let panels = [
            InterestPanel(title: "Get a Loan", subtitle: "Get a decision in a few minutes", icon: "building.columns.fill", color: Color(hex: "3B82F6")),
            InterestPanel(title: "Open a Deposit", subtitle: "Grow your savings", icon: "banknote.fill", color: Color(hex: "16B97C")),
            InterestPanel(title: "Brokerage Account", subtitle: "Earn from your investments", icon: "chart.line.uptrend.xyaxis", color: Color(hex: "8B5CF6")),
            InterestPanel(title: "bcc Shield", subtitle: "Scam protection with a trusted guardian", icon: "shield.fill", color: Color(hex: "F59E0B"))
        ]

        return VStack(spacing: 12) {
            ForEach(panels) { panel in
                InterestPanelView(panel: panel) {
                    // Handle panel tap
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 20)
    }

    func handleQuickAction(_ route: String) {
        authVM.recordInteraction()
        // Navigation would be handled via a router in a real app
        print("Navigate to: \(route)")
    }
}

// MARK: - Supporting Views

struct AccountCardView: View {
    let account: Account
    let hideBalance: Bool
    @State private var isPressed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(account.accountType == "card" ? "CODDY Card" : "Main Account")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    Text(account.maskedNumber)
                        .font(.system(size: 20, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white)
                }

                Spacer()

                Image(systemName: account.accountType == "card" ? "creditcard.fill" : "building.columns.fill")
                    .font(.system(size: 28))
                    .foregroundColor(Color(hex: "16B97C"))
            }

            Spacer()

            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Balance")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    if hideBalance {
                        Text("***")
                            .font(.system(size: 32, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                    } else {
                        Text(account.formattedBalance)
                            .font(.system(size: 32, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                    }
                }

                Spacer()

                Button(action: {}) {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundColor(.secondary)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(Color(hex: "17191E")))
                }
            }
        }
        .padding(24)
        .background(
            RoundedRectangle(cornerRadius: 24)
                .fill(
                    LinearGradient(
                        colors: [Color(hex: "17191E"), Color(hex: "0E0F12")],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 24)
                        .stroke(Color.white.opacity(0.05), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.3), radius: 20, x: 0, y: 10)
        )
        .scaleEffect(isPressed ? 0.98 : 1)
        .animation(.spring(response: 0.3), value: isPressed)
        .onLongPressGesture(minimumDuration: 0, maximumDistance: .infinity, pressing: { pressing in
            isPressed = pressing
        }, perform: {})
    }
}

struct AddCardPlaceholder: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "plus.circle.dashed")
                .font(.system(size: 48))
                .foregroundColor(.secondary)

            Text("Add New Card")
                .font(.headline)
                .foregroundColor(.white)

            Text("Get a virtual or physical card in minutes")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(
            RoundedRectangle(cornerRadius: 24)
                .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [10, 10]))
                .foregroundColor(Color.white.opacity(0.15))
        )
    }
}

struct QuickAction: Identifiable {
    let id = UUID()
    let title: String
    let icon: String
    let color: Color
    let route: String
}

struct QuickActionButton: View {
    let action: QuickAction
    let onTap: () -> Void
    @State private var isPressed = false

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(action.color.opacity(0.15))
                        .frame(width: 56, height: 56)

                    Image(systemName: action.icon)
                        .font(.system(size: 24, weight: .medium))
                        .foregroundColor(action.color)
                }

                Text(action.title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(width: 80)
        }
        .buttonStyle(PlainButtonStyle())
        .scaleEffect(isPressed ? 0.92 : 1)
        .animation(.spring(response: 0.2), value: isPressed)
        .onLongPressGesture(minimumDuration: 0, maximumDistance: .infinity, pressing: { isPressed = $0 }, perform: {})
    }
}

struct FinanceStatItem: View {
    let title: String
    let kzt: String
    let usd: String
    let color: Color
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundColor(color)
                Spacer()
            }

            Text(title)
                .font(.caption)
                .foregroundColor(.secondary)

            Text(kzt)
                .font(.system(size: 20, weight: .bold, design: .monospaced))
                .foregroundColor(.white)

            Text(usd)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(hex: "17191E"))
        )
    }
}

struct StoryItem: Identifiable {
    let id = UUID()
    let title: String
    let icon: String
    let color: Color
}

struct StoryCircle: View {
    let story: StoryItem
    @State private var isPressed = false

    var body: some View {
        Button(action: {}) {
            VStack(spacing: 8) {
                ZStack {
                    Circle()
                        .fill(story.color.opacity(0.15))
                        .frame(width: 68, height: 68)

                    Image(systemName: story.icon)
                        .font(.system(size: 26, weight: .medium))
                        .foregroundColor(story.color)
                }
                .overlay(
                    Circle()
                        .stroke(story.color.opacity(0.4), lineWidth: 2)
                        .frame(width: 72, height: 72)
                )

                Text(story.title)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .frame(width: 72)
            }
        }
        .buttonStyle(PlainButtonStyle())
        .scaleEffect(isPressed ? 0.9 : 1)
        .animation(.spring(response: 0.2), value: isPressed)
        .onLongPressGesture(minimumDuration: 0, maximumDistance: .infinity, pressing: { isPressed = $0 }, perform: {})
    }
}

struct DuoTile: View {
    let title: String
    let subtitle: String
    let icon: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16)
                        .fill(color.opacity(0.15))
                        .frame(width: 56, height: 56)

                    Image(systemName: icon)
                        .font(.system(size: 24, weight: .medium))
                        .foregroundColor(color)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.headline)
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
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Color.white.opacity(0.05), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct QuickChip: Identifiable {
    let id = UUID()
    let title: String
    let icon: String
    let color: Color
}

struct QuickChipView: View {
    let chip: QuickChip
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                ZStack {
                    Circle()
                        .fill(chip.color.opacity(0.15))
                        .frame(width: 48, height: 48)

                    Image(systemName: chip.icon)
                        .font(.system(size: 22, weight: .medium))
                        .foregroundColor(chip.color)
                }

                Text(chip.title)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct InterestPanel: Identifiable {
    let id = UUID()
    let title: String
    let subtitle: String
    let icon: String
    let color: Color
}

struct InterestPanelView: View {
    let panel: InterestPanel
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(panel.color.opacity(0.15))
                        .frame(width: 52, height: 52)

                    Image(systemName: panel.icon)
                        .font(.system(size: 22, weight: .medium))
                        .foregroundColor(panel.color)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(panel.title)
                        .font(.headline)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)
                    Text(panel.subtitle)
                        .font(.subheadline)
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
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Color.white.opacity(0.05), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}