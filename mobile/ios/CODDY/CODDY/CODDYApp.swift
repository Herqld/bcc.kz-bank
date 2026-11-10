import SwiftUI

@main
struct CODDYApp: App {
    @StateObject private var authVM = AuthViewModel.shared
    @StateObject private var dashVM = DashboardViewModel.shared
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authVM)
                .environmentObject(dashVM)
                .preferredColorScheme(.dark)
        }
    }
}

class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Configure URL cache
        URLCache.shared.memoryCapacity = 50 * 1024 * 1024 // 50 MB
        URLCache.shared.diskCapacity = 100 * 1024 * 1024 // 100 MB
        return true
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        AuthViewModel.shared.recordInteraction()
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        AuthViewModel.shared.recordInteraction()
        // Refresh data when app becomes active
        if AuthViewModel.shared.isAuthenticated {
            DashboardViewModel.shared.refreshAll()
        }
    }
}