import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @EnvironmentObject var dashVM: DashboardViewModel
    @State private var selectedTab = 0

    var body: some View {
        Group {
            if authVM.isAuthenticated {
                MainTabView(selectedTab: $selectedTab)
                    .onAppear {
                        dashVM.refreshAll()
                    }
            } else if authVM.showOTP {
                OTPScreen()
            } else {
                LoginScreen()
            }
        }
        .alert("Error", isPresented: .constant(authVM.errorMessage != nil || dashVM.errorMessage != nil)) {
            Button("OK") {
                authVM.errorMessage = nil
                dashVM.errorMessage = nil
            }
        } message: {
            Text(authVM.errorMessage ?? dashVM.errorMessage ?? "")
        }
    }
}

struct MainTabView: View {
    @Binding var selectedTab: Int
    @EnvironmentObject var authVM: AuthViewModel

    let tabs = [
        TabItem(index: 0, title: "Home", icon: "house.fill", selectedIcon: "house.fill"),
        TabItem(index: 1, title: "Transfers", icon: "arrow.left.arrow.right", selectedIcon: "arrow.left.arrow.right"),
        TabItem(index: 2, title: "Payments", icon: "creditcard.fill", selectedIcon: "creditcard.fill"),
        TabItem(index: 3, title: "History", icon: "clock.fill", selectedIcon: "clock.fill"),
        TabItem(index: 4, title: "Services", icon: "square.grid.2x2.fill", selectedIcon: "square.grid.2x2.fill")
    ]

    var body: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $selectedTab) {
                HomeScreen()
                    .tag(0)
                TransfersScreen()
                    .tag(1)
                PaymentsScreen()
                    .tag(2)
                HistoryScreen()
                    .tag(3)
                ServicesScreen()
                    .tag(4)
            }

            // Custom Tab Bar
            HStack(spacing: 0) {
                ForEach(tabs) { tab in
                    TabBarButton(
                        tab: tab,
                        isSelected: selectedTab == tab.index,
                        action: { selectedTab = tab.index }
                    )
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(Color(.systemBackground))
                    .shadow(color: .black.opacity(0.15), radius: 10, x: 0, y: -5)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
            )
            .padding(.bottom, 8)
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }
}

struct TabItem: Identifiable {
    let id = UUID()
    let index: Int
    let title: String
    let icon: String
    let selectedIcon: String
}

struct TabBarButton: View {
    let tab: TabItem
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: isSelected ? tab.selectedIcon : tab.icon)
                    .font(.system(size: 22, weight: isSelected ? .semibold : .regular))
                    .foregroundColor(isSelected ? Color(hex: "16B97C") : .secondary)
                    .symbolEffect(.bounce, value: isSelected)

                Text(tab.title)
                    .font(.caption2)
                    .fontWeight(isSelected ? .semibold : .regular)
                    .foregroundColor(isSelected ? Color(hex: "16B97C") : .secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}