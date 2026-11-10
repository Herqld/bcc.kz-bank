import Foundation

enum Config {
    // Public Cloudflare tunnel — works from any network, any country
    // The tunnel must keep running on the PC (banking-app/SHARE-TUNNEL.bat)
    // URL changes each run — update the top entry from the SHARE-TUNNEL.bat output
    static let publicURLs = [
        "https://smooth-overnight-relying-starring.trycloudflare.com",
        "https://shipped-gnome-rogers-winner.trycloudflare.com",
        "https://sam-minneapolis-applied-proceedings.trycloudflare.com",
        "https://thursday-martin-template-awarded.trycloudflare.com"
    ]

    // LAN addresses — used when the phone is on the same Wi-Fi as the PC
    static let lanURLs = [
        "http://127.0.0.1:3000",      // for real phone via USB + network tethering
        "http://10.175.179.245:3000", // PC Wi-Fi IP
        "http://10.64.198.245:3000",
        "http://192.168.0.14:3000",
        "http://192.168.0.20:3000",
        "http://192.168.0.7:3000",
        "http://192.168.1.7:3000",
        "http://192.168.1.20:3000",
        "http://192.168.0.100:3000"
    ]

    static let allURLs = publicURLs + lanURLs

    static let connectTimeout: TimeInterval = 15
    static let readTimeout: TimeInterval = 20
    static let autoLogoutInterval: TimeInterval = 60
    static let sessionCheckInterval: TimeInterval = 30
    static let maxRetries = 2
}