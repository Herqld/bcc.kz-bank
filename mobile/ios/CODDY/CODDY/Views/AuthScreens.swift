import SwiftUI
import LocalAuthentication

struct LoginScreen: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var email = ""
    @State private var password = ""
    @State private var showPassword = false
    @State private var animateLogo = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "0E0F12").ignoresSafeArea()

                VStack(spacing: 0) {
                    Spacer()

                    // Logo
                    VStack(spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(Color(hex: "16B97C").opacity(0.2))
                                .frame(width: 80, height: 80)
                                .scaleEffect(animateLogo ? 1 : 0.5)

                            Image(systemName: "building.columns.fill")
                                .font(.system(size: 36, weight: .medium))
                                .foregroundColor(Color(hex: "16B97C"))
                                .rotationEffect(.degrees(animateLogo ? 0 : -180))
                        }

                        Text("CODDY")
                            .font(.system(size: 32, weight: .bold, design: .rounded))
                            .foregroundColor(.white)

                        Text("Your Bank in Your Pocket")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .opacity(animateLogo ? 1 : 0)
                    .offset(y: animateLogo ? 0 : 20)

                    Spacer()
                    Spacer()

                    // Form
                    VStack(spacing: 16) {
                        // Email
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Email")
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .textCase(.uppercase)

                            HStack {
                                Image(systemName: "envelope.fill")
                                    .foregroundColor(.secondary)
                                    .frame(width: 20)

                                TextField("demo@bcc.kz", text: $email)
                                    .textContentType(.emailAddress)
                                    .autocapitalization(.none)
                                    .keyboardType(.emailAddress)
                                    .foregroundColor(.white)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                            .background(
                                RoundedRectangle(cornerRadius: 16)
                                    .fill(Color(hex: "17191E"))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 16)
                                            .stroke(Color.white.opacity(0.1), lineWidth: 1)
                                    )
                            )
                        }

                        // Password
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Password")
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .textCase(.uppercase)

                            HStack {
                                Image(systemName: "lock.fill")
                                    .foregroundColor(.secondary)
                                    .frame(width: 20)

                                Group {
                                    if showPassword {
                                        TextField("Password", text: $password)
                                    } else {
                                        SecureField("Password", text: $password)
                                    }
                                }
                                .textContentType(.password)
                                .foregroundColor(.white)

                                Button(action: { showPassword.toggle() }) {
                                    Image(systemName: showPassword ? "eye.slash.fill" : "eye.fill")
                                        .foregroundColor(.secondary)
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                            .background(
                                RoundedRectangle(cornerRadius: 16)
                                    .fill(Color(hex: "17191E"))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 16)
                                            .stroke(Color.white.opacity(0.1), lineWidth: 1)
                                    )
                            )
                        }

                        // Biometric login
                        if authVM.keychain.savedEmail != nil && authVM.keychain.savedPassword != nil {
                            Button(action: {
                                Task { await authVM.authenticateWithBiometrics() }
                            }) {
                                HStack(spacing: 8) {
                                    Image(systemName: "faceid")
                                        .font(.system(size: 18, weight: .medium))
                                    Text("Login with Face ID / Touch ID")
                                        .fontWeight(.medium)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(
                                    RoundedRectangle(cornerRadius: 16)
                                        .fill(Color(hex: "16B97C").opacity(0.15))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 16)
                                                .stroke(Color(hex: "16B97C").opacity(0.3), lineWidth: 1)
                                        )
                                )
                                .foregroundColor(Color(hex: "16B97C"))
                            }
                            .disabled(authVM.isLoading)
                        }

                        // Login button
                        Button(action: {
                            authVM.login(email: email, password: password)
                        }) {
                            if authVM.isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    .frame(maxWidth: .infinity)
                            } else {
                                Text("Log In")
                                    .fontWeight(.semibold)
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        .padding(.vertical, 16)
                        .background(
                            RoundedRectangle(cornerRadius: 16)
                                .fill(Color(hex: "16B97C"))
                        )
                        .foregroundColor(.white)
                        .disabled(authVM.isLoading || email.isEmpty || password.isEmpty)
                        .opacity((authVM.isLoading || email.isEmpty || password.isEmpty) ? 0.6 : 1)

                        // Register link
                        NavigationLink(destination: RegisterScreen()) {
                            HStack(spacing: 4) {
                                Text("Don't have an account?")
                                    .foregroundColor(.secondary)
                                Text("Sign Up")
                                    .fontWeight(.semibold)
                                    .foregroundColor(Color(hex: "16B97C"))
                            }
                        }
                    }
                    .padding(.horizontal, 24)

                    Spacer()

                    // Demo credentials hint
                    VStack(spacing: 4) {
                        Text("Demo Access")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .textCase(.uppercase)

                        Text("demo@bcc.kz  /  demo123")
                            .font(.caption)
                            .foregroundColor(.secondary.opacity(0.7))
                            .fontDesign(.monospaced)
                    }
                    .padding(.bottom, 40)
                }
            }
            .onTapGesture {
                hideKeyboard()
            }
            .onAppear {
                withAnimation(.spring(response: 0.6, dampingFraction: 0.7).delay(0.2)) {
                    animateLogo = true
                }
                // Pre-fill demo credentials
                email = "demo@bcc.kz"
                password = "demo123"
            }
        }
    }
}

struct RegisterScreen: View {
    @EnvironmentObject var authVM: AuthViewModel
    @Environment(\.dismiss) var dismiss
    @State private var fullName = ""
    @State private var email = ""
    @State private var password = ""
    @State private var phone = ""
    @State private var showPassword = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "0E0F12").ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
                        // Header
                        VStack(spacing: 8) {
                            Image(systemName: "person.badge.plus.fill")
                                .font(.system(size: 48))
                                .foregroundColor(Color(hex: "16B97C"))

                            Text("Create Account")
                                .font(.title)
                                .fontWeight(.bold)
                                .foregroundColor(.white)

                            Text("Join CODDY and start banking smarter")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                        }
                        .padding(.top, 40)

                        // Form
                        VStack(spacing: 16) {
                            FormField(icon: "person.fill", placeholder: "Full Name", text: $fullName)
                            FormField(icon: "envelope.fill", placeholder: "Email", text: $email, keyboardType: .emailAddress, autocapitalization: .none)
                            FormField(icon: "lock.fill", placeholder: "Password", text: $password, isSecure: !showPassword, showToggle: true, showPassword: $showPassword)
                            FormField(icon: "phone.fill", placeholder: "Phone Number", text: $phone, keyboardType: .phonePad)
                        }
                        .padding(.horizontal, 24)

                        // Register button
                        Button(action: {
                            authVM.register(fullName: fullName, email: email, password: password, phone: phone)
                        }) {
                            if authVM.isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    .frame(maxWidth: .infinity)
                            } else {
                                Text("Create Account")
                                    .fontWeight(.semibold)
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        .padding(.vertical, 16)
                        .background(
                            RoundedRectangle(cornerRadius: 16)
                                .fill(Color(hex: "16B97C"))
                        )
                        .foregroundColor(.white)
                        .disabled(authVM.isLoading || fullName.isEmpty || email.isEmpty || password.isEmpty)
                        .padding(.horizontal, 24)

                        // Back to login
                        Button("Already have an account? Log In") {
                            dismiss()
                        }
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .padding(.bottom, 40)
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundColor(.white)
                    }
                }
            }
        }
    }
}

struct FormField: View {
    let icon: String
    let placeholder: String
    @Binding var text: String
    var keyboardType: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .sentences
    var isSecure: Bool = false
    var showToggle: Bool = false
    var showPassword: Binding<Bool> = .constant(false)

    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(.secondary)
                .frame(width: 20)

            Group {
                if isSecure && !showPassword.wrappedValue {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                        .keyboardType(keyboardType)
                        .textInputAutocapitalization(autocapitalization)
                }
            }
            .foregroundColor(.white)

            if showToggle {
                Button(action: { showPassword.wrappedValue.toggle() }) {
                    Image(systemName: showPassword.wrappedValue ? "eye.slash.fill" : "eye.fill")
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(hex: "17191E"))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color.white.opacity(0.1), lineWidth: 1)
                )
        )
    }
}

struct OTPScreen: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var code = ""
    @FocusState private var isFocused: Bool

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "0E0F12").ignoresSafeArea()

                VStack(spacing: 32) {
                    Spacer()

                    VStack(spacing: 16) {
                        Image(systemName: "lock.shield.fill")
                            .font(.system(size: 56))
                            .foregroundColor(Color(hex: "16B97C"))

                        Text("Enter Code")
                            .font(.title)
                            .fontWeight(.bold)
                            .foregroundColor(.white)

                        Text("We sent a 6-digit code to your email")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }

                    // OTP Input
                    HStack(spacing: 12) {
                        ForEach(0..<6, id: \.self) { index in
                            ZStack {
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Color(hex: "17191E"))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(index < code.count ? Color(hex: "16B97C") : Color.white.opacity(0.1), lineWidth: 2)
                                    )
                                    .frame(width: 48, height: 56)

                                if index < code.count {
                                    Text(String(code[code.index(code.startIndex, offsetBy: index)]))
                                        .font(.system(size: 24, weight: .bold, design: .monospaced))
                                        .foregroundColor(.white)
                                }
                            }
                        }
                    }
                    .overlay(
                        TextField("", text: $code)
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                            .focused($isFocused)
                            .foregroundColor(.clear)
                            .accentColor(.clear)
                            .onChange(of: code) { newValue in
                                if newValue.count > 6 {
                                    code = String(newValue.prefix(6))
                                }
                                if newValue.count == 6 {
                                    authVM.confirmOTP(code: code)
                                }
                            }
                    )
                    .frame(height: 56)

                    // Resend
                    Button(action: { authVM.resendOTP() }) {
                        Text("Resend Code")
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(Color(hex: "16B97C"))
                    }
                    .padding(.top, 8)

                    Spacer()
                }
                .padding(.horizontal, 40)
            }
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    isFocused = true
                }
            }
        }
    }
}

extension View {
    func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}