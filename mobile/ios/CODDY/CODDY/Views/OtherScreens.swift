import SwiftUI

struct ProfileScreen: View {
    @EnvironmentObject var authVM: AuthViewModel
    @Environment(\.dismiss) var dismiss
    @State private var showSettings = false
    @State private var showSecurity = false
    @State private var animateItems = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "0E0F12").ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
                        // Profile header
                        VStack(spacing: 16) {
                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: [Color(hex: "16B97C"), Color(hex: "16B97C").opacity(0.6)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 100, height: 100)
                                .overlay(
                                    Text(authVM.dashboard?.user?.fullName.prefix(1).uppercased() ?? "U")
                                        .font(.system(size: 40, weight: .bold))
                                        .foregroundColor(.white)
                                )
                                .shadow(color: Color(hex: "16B97C").opacity(0.4), radius: 20, x: 0, y: 10)

                            VStack(spacing: 4) {
                                Text(authVM.dashboard?.user?.fullName ?? "User")
                                    .font(.title2)
                                    .fontWeight(.bold)
                                    .foregroundColor(.white)

                                Text(authVM.dashboard?.user?.email ?? "")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)

                                if authVM.dashboard?.plus == true {
                                    HStack(spacing: 6) {
                                        Image(systemName: "star.fill")
                                            .font(.system(size: 12))
                                        Text("bcc Plus Member")
                                            .font(.caption)
                                            .fontWeight(.medium)
                                    }
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 4)
                                    .background(
                                        Capsule()
                                            .fill(Color.yellow.opacity(0.2))
                                    )
                                    .foregroundColor(.yellow)
                                }
                            }
                        }
                        .opacity(animateItems ? 1 : 0)
                        .offset(y: animateItems ? 0 : 20)
                        .padding(.top, 20)

                        // Menu items
                        VStack(spacing: 0) {
                            ProfileMenuItem(icon: "person.fill", title: "Personal Information", subtitle: "Name, email, phone", color: Color(hex: "16B97C")) {}
                            Divider().background(Color.white.opacity(0.1)).padding(.horizontal, 20)
                            ProfileMenuItem(icon: "lock.fill", title: "Security", subtitle: "Password, Face ID, sessions", color: Color(hex: "F59E0B")) { showSecurity = true }
                            Divider().background(Color.white.opacity(0.1)).padding(.horizontal, 20)
                            ProfileMenuItem(icon: "bell.fill", title: "Notifications", subtitle: "Push, email, SMS preferences", color: Color(hex: "3B82F6")) {}
                            Divider().background(Color.white.opacity(0.1)).padding(.horizontal, 20)
                            ProfileMenuItem(icon: "creditcard.fill", title: "Cards & Accounts", subtitle: "Manage your cards and accounts", color: Color(hex: "8B5CF6")) {}
                            Divider().background(Color.white.opacity(0.1)).padding(.horizontal, 20)
                            ProfileMenuItem(icon: "gear", title: "Settings", subtitle: "App preferences, language", color: Color(hex: "6366F1")) { showSettings = true }
                            Divider().background(Color.white.opacity(0.1)).padding(.horizontal, 20)
                            ProfileMenuItem(icon: "questionmark.circle.fill", title: "Help & Support", subtitle: "FAQ, contact us", color: Color(hex: "EC4899")) {}
                            Divider().background(Color.white.opacity(0.1)).padding(.horizontal, 20)

                            // Logout
                            Button(action: { authVM.logout(); dismiss() }) {
                                HStack(spacing: 16) {
                                    ZStack {
                                        Circle()
                                            .fill(Color.red.opacity(0.15))
                                            .frame(width: 44, height: 44)

                                        Image(systemName: "rectangle.portrait.and.arrow.right.fill")
                                            .font(.system(size: 20, weight: .medium))
                                            .foregroundColor(.red)
                                    }

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("Log Out")
                                            .font(.subheadline)
                                            .fontWeight(.semibold)
                                            .foregroundColor(.red)
                                        Text("Sign out of your account")
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }

                                    Spacer()
                                }
                                .padding(.horizontal, 20)
                                .padding(.vertical, 16)
                            }
                        }
                        .background(
                            RoundedRectangle(cornerRadius: 20)
                                .fill(Color(hex: "17191E"))
                        )
                        .padding(.horizontal, 16)
                        .opacity(animateItems ? 1 : 0)
                        .offset(y: animateItems ? 0 : 30)

                        Spacer(minLength: 40)
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") { dismiss() }
                        .foregroundColor(Color(hex: "16B97C"))
                }
            }
            .onAppear {
                withAnimation(.spring(response: 0.6, dampingFraction: 0.8).delay(0.1)) {
                    animateItems = true
                }
            }
        }
    }
}

struct ProfileMenuItem: View {
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
                        .frame(width: 44, height: 44)

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
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
        }
        .buttonStyle(PlainButtonStyle())
        .scaleEffect(isPressed ? 0.98 : 1)
        .animation(.spring(response: 0.2), value: isPressed)
        .onLongPressGesture(minimumDuration: 0, maximumDistance: .infinity, pressing: { isPressed = $0 }, perform: {})
    }
}

struct SettingsScreen: View {
    @Environment(\.dismiss) var dismiss
    @AppStorage("biometric_enabled") var biometricEnabled = false
    @AppStorage("dark_mode") var darkMode = true
    @AppStorage("notifications_enabled") var notificationsEnabled = true
    @State private var animateItems = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "0E0F12").ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
                        // Appearance
                        SettingsSection(title: "Appearance") {
                            VStack(spacing: 0) {
                                SettingsToggleRow(
                                    icon: "moon.fill",
                                    title: "Dark Mode",
                                    subtitle: "Use dark appearance",
                                    color: Color(hex: "F59E0B"),
                                    isOn: $darkMode
                                )
                            }
                        }

                        // Security
                        SettingsSection(title: "Security") {
                            VStack(spacing: 0) {
                                SettingsToggleRow(
                                    icon: "faceid",
                                    title: "Face ID / Touch ID",
                                    subtitle: "Unlock with biometrics",
                                    color: Color(hex: "16B97C"),
                                    isOn: $biometricEnabled
                                )
                            }
                        }

                        // Notifications
                        SettingsSection(title: "Notifications") {
                            VStack(spacing: 0) {
                                SettingsToggleRow(
                                    icon: "bell.fill",
                                    title: "Push Notifications",
                                    subtitle: "Receive transaction alerts",
                                    color: Color(hex: "3B82F6"),
                                    isOn: $notificationsEnabled
                                )
                            }
                        }

                        // About
                        SettingsSection(title: "About") {
                            VStack(spacing: 0) {
                                SettingsInfoRow(
                                    icon: "info.circle.fill",
                                    title: "Version",
                                    value: "2.2.0",
                                    color: Color(hex: "6366F1")
                                )
                                Divider().background(Color.white.opacity(0.1)).padding(.horizontal, 20)
                                SettingsInfoRow(
                                    icon: "building.columns.fill",
                                    title: "Bank",
                                    value: "bcc.kz",
                                    color: Color(hex: "16B97C")
                                )
                                Divider().background(Color.white.opacity(0.1)).padding(.horizontal, 20)
                                SettingsButtonRow(
                                    icon: "doc.text.fill",
                                    title: "Terms of Service",
                                    color: Color(hex: "8B5CF6")
                                ) {}
                                Divider().background(Color.white.opacity(0.1)).padding(.horizontal, 20)
                                SettingsButtonRow(
                                    icon: "lock.doc.fill",
                                    title: "Privacy Policy",
                                    color: Color(hex: "EC4899")
                                ) {}
                            }
                        }

                        Spacer(minLength: 40)
                    }
                    .padding(.top, 8)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") { dismiss() }
                        .foregroundColor(Color(hex: "16B97C"))
                }
            }
            .onAppear {
                withAnimation(.spring(response: 0.6, dampingFraction: 0.8).delay(0.1)) {
                    animateItems = true
                }
            }
        }
    }
}

struct SettingsSection<Content: View>: View {
    let title: String
    let content: Content

    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.secondary)
                .textCase(.uppercase)
                .padding(.horizontal, 20)

            content
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color(hex: "17191E"))
                )
                .padding(.horizontal, 16)
        }
    }
}

struct SettingsToggleRow: View {
    let icon: String
    let title: String
    let subtitle: String
    let color: Color
    @Binding var isOn: Bool

    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.15))
                    .frame(width: 40, height: 40)

                Image(systemName: icon)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(color)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(.white)
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Toggle("", isOn: $isOn)
                .labelsHidden()
                .tint(Color(hex: "16B97C"))
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }
}

struct SettingsInfoRow: View {
    let icon: String
    let title: String
    let value: String
    let color: Color

    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.15))
                    .frame(width: 40, height: 40)

                Image(systemName: icon)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(color)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(.white)
                Text(value)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }
}

struct SettingsButtonRow: View {
    let icon: String
    let title: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                ZStack {
                    Circle()
                        .fill(color.opacity(0.15))
                        .frame(width: 40, height: 40)

                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(color)
                }

                Text(title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(.white)

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct NotificationsScreen: View {
    @Environment(\.dismiss) var dismiss
    @State private var animateItems = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "0E0F12").ignoresSafeArea()

                VStack(spacing: 0) {
                    // Empty state
                    VStack(spacing: 16) {
                        Spacer()

                        Image(systemName: "bell.slash")
                            .font(.system(size: 56))
                            .foregroundColor(.secondary.opacity(0.5))

                        Text("No Notifications")
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundColor(.white)

                        Text("Transaction alerts and updates will appear here")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)

                        Spacer()
                    }
                    .opacity(animateItems ? 1 : 0)
                    .offset(y: animateItems ? 0 : 20)
                }
            }
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") { dismiss() }
                        .foregroundColor(Color(hex: "16B97C"))
                }
            }
            .onAppear {
                withAnimation(.spring(response: 0.6, dampingFraction: 0.8).delay(0.1)) {
                    animateItems = true
                }
            }
        }
    }
}

struct SecurityScreen: View {
    @Environment(\.dismiss) var dismiss
    @AppStorage("biometric_enabled") var biometricEnabled = false
    @State private var animateItems = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "0E0F12").ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
                        // Biometric
                        SettingsSection(title: "Authentication") {
                            VStack(spacing: 0) {
                                SettingsToggleRow(
                                    icon: "faceid",
                                    title: "Face ID / Touch ID",
                                    subtitle: "Unlock app with biometrics",
                                    color: Color(hex: "16B97C"),
                                    isOn: $biometricEnabled
                                )
                            }
                        }

                        // Session
                        SettingsSection(title: "Session") {
                            VStack(spacing: 0) {
                                SettingsInfoRow(
                                    icon: "timer",
                                    title: "Auto Logout",
                                    value: "60 seconds of inactivity",
                                    color: Color(hex: "F59E0B")
                                )
                                Divider().background(Color.white.opacity(0.1)).padding(.horizontal, 20)
                                SettingsButtonRow(
                                    icon: "iphone.gen3.radiowaves.left.and.right",
                                    title: "Active Sessions",
                                    color: Color(hex: "3B82F6")
                                ) {}
                            }
                        }

                        // Security features
                        SettingsSection(title: "Protection") {
                            VStack(spacing: 0) {
                                SettingsButtonRow(
                                    icon: "shield.fill",
                                    title: "bcc Shield",
                                    color: Color(hex: "F59E0B")
                                ) {}
                                Divider().background(Color.white.opacity(0.1)).padding(.horizontal, 20)
                                SettingsButtonRow(
                                    icon: "exclamationmark.triangle.fill",
                                    title: "Report Fraud",
                                    color: Color(hex: "EF4444")
                                ) {}
                            }
                        }

                        Spacer(minLength: 40)
                    }
                    .padding(.top, 8)
                }
            }
            .navigationTitle("Security")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") { dismiss() }
                        .foregroundColor(Color(hex: "16B97C"))
                }
            }
            .onAppear {
                withAnimation(.spring(response: 0.6, dampingFraction: 0.8).delay(0.1)) {
                    animateItems = true
                }
            }
        }
    }
}