import SwiftUI

struct PaymentsScreen: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @EnvironmentObject var authVM: AuthViewModel
    @State private var animateItems = false
    @State private var selectedAccount = ""
    @State private var amount = ""

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "0E0F12").ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
                        // Top bar
                        HStack {
                            Text("Payments")
                                .font(.system(size: 28, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                            Spacer()
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 8)

                        // Shield banner
                        ShieldBanner()
                            .opacity(animateItems ? 1 : 0)
                            .offset(y: animateItems ? 0 : 20)

                        // Pay for services
                        VStack(alignment: .leading, spacing: 16) {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Pay for Services")
                                        .font(.headline)
                                        .fontWeight(.bold)
                                        .foregroundColor(.white)
                                    Text("Earn cashback on every payment.")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                Spacer()
                            }
                            .padding(.horizontal, 20)

                            // Biller grid
                            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                                ForEach(dashVM.billers) { biller in
                                    BillerCard(biller: biller)
                                }

                                // Extra services
                                ExtraServiceCard(icon: "building.columns.fill", title: "Taxes & Fines", color: Color(hex: "3B82F6"))
                                ExtraServiceCard(icon: "shield.fill", title: "Insurance", color: Color(hex: "F59E0B"))
                                ExtraServiceCard(icon: "tag.fill", title: "Cashback", color: Color(hex: "EC4899"))
                            }
                            .padding(.horizontal, 16)
                        }
                        .opacity(animateItems ? 1 : 0)
                        .offset(y: animateItems ? 0 : 30)

                        // Top up section
                        TopUpSection()
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
}

// ShieldBanner is defined in ServicesScreen.swift

struct BillerCard: View {
    let biller: Biller
    @State private var isPressed = false

    var iconName: String {
        switch biller.id {
        case "mobile": return "iphone.gen3"
        case "utilities": return "doc.text.fill"
        case "internet": return "wifi"
        case "transport": return "bus.fill"
        case "entertainment": return "tv.fill"
        default: return "doc.text.fill"
        }
    }

    var color: Color {
        switch biller.id {
        case "mobile": return Color(hex: "16B97C")
        case "utilities": return Color(hex: "3B82F6")
        case "internet": return Color(hex: "8B5CF6")
        case "transport": return Color(hex: "F59E0B")
        case "entertainment": return Color(hex: "EC4899")
        default: return Color(hex: "6366F1")
        }
    }

    var body: some View {
        Button(action: {}) {
            VStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(color.opacity(0.15))
                        .frame(width: 48, height: 48)

                    Image(systemName: iconName)
                        .font(.system(size: 22, weight: .medium))
                        .foregroundColor(color)
                }

                Text(biller.name)
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

struct ExtraServiceCard: View {
    let icon: String
    let title: String
    let color: Color
    @State private var isPressed = false

    var body: some View {
        Button(action: {}) {
            VStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(color.opacity(0.15))
                        .frame(width: 40, height: 40)

                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(color)
                }

                Text(title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 80)
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

struct TopUpSection: View {
    @State private var selectedAccount = ""
    @State private var amount = ""
    @State private var isPressed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Top Up")
                    .font(.headline)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                Spacer()
            }
            .padding(.horizontal, 20)

            VStack(spacing: 12) {
                Text("Demo: top-ups are simulated, no real money moves.")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20)

                VStack(spacing: 12) {
                    // Account selector
                    HStack {
                        Image(systemName: "creditcard.fill")
                            .foregroundColor(.secondary)
                            .frame(width: 24)

                        Text("Account")
                            .foregroundColor(.secondary)
                            .frame(width: 80, alignment: .leading)

                        Text(selectedAccount.isEmpty ? "Select account" : selectedAccount)
                            .foregroundColor(selectedAccount.isEmpty ? .secondary : .white)

                        Spacer()

                        Image(systemName: "chevron.down")
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color(hex: "17191E"))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
                            )
                    )

                    // Amount field
                    HStack {
                        Image(systemName: "tengesign.circle.fill")
                            .foregroundColor(Color(hex: "16B97C"))
                            .frame(width: 24)

                        Text("Amount")
                            .foregroundColor(.secondary)
                            .frame(width: 80, alignment: .leading)

                        TextField("0.00", text: $amount)
                            .keyboardType(.decimalPad)
                            .foregroundColor(.white)
                            .multilineTextAlignment(.trailing)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color(hex: "17191E"))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
                            )
                    )

                    // Top up button
                    Button(action: {}) {
                        if amount.isEmpty {
                            Text("Top Up")
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Top Up \(amount) ₸")
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .padding(.vertical, 16)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(amount.isEmpty ? Color(hex: "16B97C").opacity(0.5) : Color(hex: "16B97C"))
                    )
                    .foregroundColor(.white)
                    .disabled(amount.isEmpty)
                }
                .padding(.horizontal, 20)
            }
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(hex: "17191E"))
            )
            .padding(.horizontal, 16)
        }
    }
}