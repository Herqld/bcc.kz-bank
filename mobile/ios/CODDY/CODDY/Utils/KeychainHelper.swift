import Foundation
import Security

class KeychainHelper {
    static let shared = KeychainHelper()
    private let service = "kz.bcc.coddy"

    private init() {}

    func save(_ data: Data, forKey key: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data
        ]

        // Delete existing
        SecItemDelete(query as CFDictionary)

        // Add new
        let status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    func load(forKey key: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }
        return data
    }

    func delete(forKey key: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]

        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess
    }

    // Convenience methods for strings
    func saveString(_ string: String, forKey key: String) -> Bool {
        guard let data = string.data(using: .utf8) else { return false }
        return save(data, forKey: key)
    }

    func loadString(forKey key: String) -> String? {
        guard let data = load(forKey: key) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    // Auth token
    var authToken: String? {
        get { loadString(forKey: "auth_token") }
        set {
            if let token = newValue {
                _ = saveString(token, forKey: "auth_token")
            } else {
                _ = delete(forKey: "auth_token")
            }
        }
    }

    // User credentials for biometric login
    var savedEmail: String? {
        get { loadString(forKey: "saved_email") }
        set {
            if let email = newValue {
                _ = saveString(email, forKey: "saved_email")
            } else {
                _ = delete(forKey: "saved_email")
            }
        }
    }

    var savedPassword: String? {
        get { loadString(forKey: "saved_password") }
        set {
            if let password = newValue {
                _ = saveString(password, forKey: "saved_password")
            } else {
                _ = delete(forKey: "saved_password")
            }
        }
    }

    // Biometric enabled flag
    var biometricEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: "biometric_enabled") }
        set { UserDefaults.standard.set(newValue, forKey: "biometric_enabled") }
    }
}