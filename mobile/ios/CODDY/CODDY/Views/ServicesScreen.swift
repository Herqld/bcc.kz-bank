import SwiftUI

struct ServicesScreen: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var selectedTab = 0
    @State private var animateItems = false

    let tabs = ["New", "Finance", "Government Services", "Insurance", "Lifestyle", "Other Services"]

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "0E0F12").ignoresSafeArea()

                VStack(spacing: 0) {
                    // Top bar with city
                    HStack {
                        Text("Services")
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundColor(.white)

                        Spacer()

                        Button(action: {}) {
                            HStack(spacing: 6) {
                                Image(systemName: "location.fill")
                                    .font(.system(size: 12))
                                Text("Almaty")
                                    .font(.system(size: 14, weight: .medium))
                            }
                            .foregroundColor(Color(hex: "16B97C"))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(
                                Capsule()
                                    .fill(Color(hex: "16B97C").opacity(0.15))
                            )
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 12)

                    // Shield banner
                    ShieldBanner()
                        .padding(.horizontal, 16)
                        .opacity(animateItems ? 1 : 0)

                    // Tab chips
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(Array(tabs.enumerated()), id: \.offset) { index, tab in
                                TabChip(
                                    title: tab,
                                    isSelected: selectedTab == index,
                                    action: { withAnimation(.spring(response: 0.3)) { selectedTab = index } }
                                )
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                    .padding(.vertical, 12)

                    // Content
                    TabView(selection: $selectedTab) {
                        NewServicesSection()
                            .tag(0)
                        FinanceSection()
                            .tag(1)
                        GovServicesSection()
                            .tag(2)
                        InsuranceSection()
                            .tag(3)
                        LifestyleSection()
                            .tag(4)
                        OtherServicesSection()
                            .tag(5)
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))

                    Spacer(minLength: 100)
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

struct TabChip: View {
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

struct ShieldBanner: View {
    var body: some View {
        Button(action: {}) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("bcc Shield: stop scammers before they get your money")
                        .font(.subheadline)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                    Text("Smart checks, a trusted guardian and a panic button")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.8))
                }

                Spacer()

                ZStack {
                    Circle()
                        .fill(Color(hex: "16B97C").opacity(0.2))
                        .frame(width: 48, height: 48)

                    Image(systemName: "shield.fill")
                        .font(.system(size: 22, weight: .medium))
                        .foregroundColor(Color(hex: "16B97C"))
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(hex: "16B97C").opacity(0.15))
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Service Sections

struct ServiceTile: View {
    let icon: String
    let title: String
    let color: Color
    let isNew: Bool
    let action: () -> Void
    @State private var isPressed = false

    var body: some View {
        Button(action: action) {
            VStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(color.opacity(0.15))
                        .frame(width: 48, height: 48)

                    Image(systemName: icon)
                        .font(.system(size: 22, weight: .medium))
                        .foregroundColor(color)

                    if isNew {
                        VStack {
                            HStack {
                                Spacer()
                                Text("new")
                                    .font(.system(size: 8, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(
                                        Capsule()
                                            .fill(Color.red)
                                    )
                            }
                            Spacer()
                        }
                        .frame(width: 48, height: 48)
                    }
                }

                Text(title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 100)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(hex: "17191E"))
            )
        }
        .buttonStyle(PlainButtonStyle())
        .scaleEffect(isPressed ? 0.95 : 1)
        .animation(.spring(response: 0.2), value: isPressed)
        .onLongPressGesture(minimumDuration: 0, maximumDistance: .infinity, pressing: { isPressed = $0 }, perform: {})
    }
}

struct ServiceTileData {
    let title: String
    let icon: String
    let color: Color
    let isNew: Bool
}

struct SectionContainer<Content: View>: View {
    let title: String
    let content: Content

    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)
                .fontWeight(.bold)
                .foregroundColor(.white)
                .padding(.horizontal, 20)

            content
        }
    }
}

// MARK: - Section Content

struct NewServicesSection: View {
    let tiles = [
        ServiceTileData(title: "bcc Shield", icon: "shield.fill", color: Color(hex: "F59E0B"), isNew: true),
        ServiceTileData(title: "My QR", icon: "qrcode", color: Color(hex: "16B97C"), isNew: true),
        ServiceTileData(title: "Crypto Wallets", icon: "bitcoinsign.circle.fill", color: Color(hex: "8B5CF6"), isNew: true),
        ServiceTileData(title: "Chat Assistant", icon: "message.fill", color: Color(hex: "6366F1"), isNew: true),
        ServiceTileData(title: "Finance & AI", icon: "chart.line.uptrend.xyaxis", color: Color(hex: "3B82F6"), isNew: true),
        ServiceTileData(title: "Subscriptions", icon: "arrow.clockwise", color: Color(hex: "EC4899"), isNew: true),
        ServiceTileData(title: "Savings Goals", icon: "target", color: Color(hex: "16B97C"), isNew: true)
    ]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(tiles, id: \.title) { tile in
                    ServiceTile(
                        icon: tile.icon,
                        title: tile.title,
                        color: tile.color,
                        isNew: tile.isNew
                    ) {
                        // Handle tap
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 20)
        }
    }
}

struct FinanceSection: View {
    let tiles = [
        ServiceTileData(title: "Deposits", icon: "banknote.fill", color: Color(hex: "16B97C"), isNew: false),
        ServiceTileData(title: "Investments", icon: "chart.line.uptrend.xyaxis", color: Color(hex: "8B5CF6"), isNew: false),
        ServiceTileData(title: "Loans", icon: "building.columns.fill", color: Color(hex: "3B82F6"), isNew: false),
        ServiceTileData(title: "Exchange KZT ⇄ USD", icon: "arrow.left.arrow.right", color: Color(hex: "F59E0B"), isNew: false),
        ServiceTileData(title: "bcc Plus", icon: "star.fill", color: Color.yellow, isNew: false),
        ServiceTileData(title: "Safe Deposit Boxes", icon: "lock.fill", color: Color(hex: "6366F1"), isNew: false),
        ServiceTileData(title: "Money Requests", icon: "person.badge.plus.fill", color: Color(hex: "EC4899"), isNew: false),
        ServiceTileData(title: "Autotransfers", icon: "arrow.clockwise", color: Color(hex: "16B97C"), isNew: false)
    ]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(tiles, id: \.title) { tile in
                    ServiceTile(
                        icon: tile.icon,
                        title: tile.title,
                        color: tile.color,
                        isNew: tile.isNew
                    ) {
                        // Handle tap
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 20)
        }
    }
}

struct GovServicesSection: View {
    let tiles = [
        ServiceTileData(title: "Taxes & Fines", icon: "building.columns.fill", color: Color(hex: "3B82F6"), isNew: false),
        ServiceTileData(title: "Pension Info", icon: "doc.text.fill", color: Color(hex: "8B5CF6"), isNew: false),
        ServiceTileData(title: "Vehicle Check", icon: "car.fill", color: Color(hex: "F59E0B"), isNew: false),
        ServiceTileData(title: "Health Insurance", icon: "cross.case.fill", color: Color(hex: "EC4899"), isNew: false)
    ]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(tiles, id: \.title) { tile in
                    ServiceTile(
                        icon: tile.icon,
                        title: tile.title,
                        color: tile.color,
                        isNew: tile.isNew
                    ) {
                        // Handle tap
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 20)
        }
    }
}

struct InsuranceSection: View {
    let tiles = [
        ServiceTileData(title: "Travel", icon: "airplane", color: Color(hex: "3B82F6"), isNew: false),
        ServiceTileData(title: "Car (OSAGO)", icon: "car.fill", color: Color(hex: "16B97C"), isNew: false),
        ServiceTileData(title: "Property", icon: "house.fill", color: Color(hex: "8B5CF6"), isNew: false)
    ]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(tiles, id: \.title) { tile in
                    ServiceTile(
                        icon: tile.icon,
                        title: tile.title,
                        color: tile.color,
                        isNew: tile.isNew
                    ) {
                        // Handle tap
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 20)
        }
    }
}

struct LifestyleSection: View {
    let tiles = [
        ServiceTileData(title: "Offers", icon: "tag.fill", color: Color(hex: "EC4899"), isNew: false),
        ServiceTileData(title: "Cashback", icon: "star.fill", color: Color.yellow, isNew: false),
        ServiceTileData(title: "Mobile Top-up", icon: "iphone.gen3", color: Color(hex: "16B97C"), isNew: false),
        ServiceTileData(title: "Analytics", icon: "chart.bar.fill", color: Color(hex: "3B82F6"), isNew: false)
    ]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(tiles, id: \.title) { tile in
                    ServiceTile(
                        icon: tile.icon,
                        title: tile.title,
                        color: tile.color,
                        isNew: tile.isNew
                    ) {
                        // Handle tap
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 20)
        }
    }
}

struct OtherServicesSection: View {
    let tiles = [
        ServiceTileData(title: "Bank Contact", icon: "headphones", color: Color(hex: "3B82F6"), isNew: false),
        ServiceTileData(title: "Refund Requests", icon: "arrow.uturn.backward.circle.fill", color: Color(hex: "EF4444"), isNew: false),
        ServiceTileData(title: "My Documents", icon: "doc.fill", color: Color(hex: "8B5CF6"), isNew: false)
    ]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(tiles, id: \.title) { tile in
                    ServiceTile(
                        icon: tile.icon,
                        title: tile.title,
                        color: tile.color,
                        isNew: tile.isNew
                    ) {
                        // Handle tap
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 20)
        }
    }
}