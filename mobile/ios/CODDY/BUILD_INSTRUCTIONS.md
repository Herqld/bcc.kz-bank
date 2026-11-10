# CODDY iOS Build Instructions

## Prerequisites

- **macOS** with **Xcode 15+** (Apple requirement - cannot build iOS on Windows/Linux)
- **CocoaPods** (optional, for dependencies): `brew install cocoapods`
- **Apple Developer Account** (free account works for 7-day device testing)

## Quick Setup on Mac

### Option 1: Create Xcode Project Manually

1. Open **Xcode** → **Create New Project**
2. Choose **iOS** → **App** → **Next**
3. Configure:
   - **Product Name**: `CODDY`
   - **Organization Identifier**: `kz.bcc`
   - **Bundle Identifier**: `kz.bcc.coddy`
   - **Interface**: **SwiftUI**
   - **Language**: **Swift**
   - **Minimum Deployment**: **iOS 17.0**
   - **Storage**: None (we use Keychain)
4. Save to: `/Users/<yourname>/CODDY-iOS` (or any folder)

### Option 2: Use the Provided Source Files

1. Copy the entire `CODDY/` folder (with all `.swift` files) into your Xcode project
2. In Xcode, drag the `CODDY` folder into the Project Navigator
3. Select **Create Groups** and **Copy items if needed**

## Required Files Structure

```
CODDY/
├── CODDYApp.swift              // App entry point
├── Config.swift                // Server URLs & timeouts
├── Info.plist                  // App configuration
├── LaunchScreen.storyboard     // Launch screen
├── Models/
│   ├── Account.swift
│   ├── Transaction.swift
│   └── OtherModels.swift
├── Services/
│   └── APIService.swift        // Networking with auto-discovery
├── Utils/
│   └── KeychainHelper.swift    // Secure storage
├── ViewModels/
│   ├── AuthViewModel.swift
│   └── DashboardViewModel.swift
└── Views/
    ├── ContentView.swift       // Main tab navigation
    ├── AuthScreens.swift       // Login, Register, OTP
    ├── HomeScreen.swift        // Dashboard with cards, actions
    ├── TransfersScreen.swift   // All transfer types
    ├── PaymentsScreen.swift    // Billers + top-up
    ├── HistoryScreen.swift     // Transaction history with filters
    ├── ServicesScreen.swift    // 6-tab services catalog
    └── OtherScreens.swift      // Profile, Settings, Security, Notifications
```

## Build & Run

1. **Select Team**: In Xcode → Project → Signing & Capabilities → Team: Choose your Apple ID
2. **Connect iPhone**: Plug in via USB (or use Simulator)
3. **Trust Developer**: On iPhone → Settings → General → VPN & Device Management → Trust your Apple ID
4. **Press ▶️ Run** (Cmd+R)

## Server Configuration

The app **auto-discovers** the bank server:

| Priority | Method | Works From |
|----------|--------|------------|
| 1 | Cloudflare Tunnel (HTTPS) | **Any network, any country** |
| 2 | LAN IP (HTTP) | Same Wi-Fi as PC |
| 3 | USB Tethering (HTTP) | `http://127.0.0.1:3000` |

**No manual IP entry needed** — the app tries all URLs in `Config.allURLs` until one responds.

### To Update Cloudflare Tunnel URL

1. Run `SHARE-TUNNEL.bat` on the PC (in `banking-app/`)
2. Copy the new `https://xxxx.trycloudflare.com` URL
3. Update `Config.swift` → `publicURLs` array (top entry)
4. Rebuild

## Features Included

✅ **Full native SwiftUI** — No web wrapper, 60fps animations  
✅ **5-tab bottom navigation** — Home, Transfers, Payments, History, Services  
✅ **All banking features** — Cards, deposits, loans, invest, crypto, Shield, insurance, offers, QR, chat  
✅ **Cross-network access** — Cloudflare tunnel + LAN fallback + USB fallback  
✅ **Auto server discovery** — Self-heals if tunnel restarts  
✅ **60s idle auto-logout** — Security best practice  
✅ **Face ID / Touch ID** — Biometric login with Keychain storage  
✅ **Cookie persistence** — Sessions survive app restarts  
✅ **Pull-to-refresh** — On all data screens  
✅ **Dark theme** — Matches Android app exactly  
✅ **Smooth animations** — Spring physics, press feedback, symbol effects  

## Demo Credentials

- **Email**: `demo@bcc.kz`
- **Password**: `demo123`

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "No such module" | Clean Build Folder (Cmd+Shift+K), restart Xcode |
| Signing error | Select valid Team in Signing & Capabilities |
| App crashes on launch | Check `Info.plist` keys match entitlements |
| Can't connect to server | Ensure PC server is running (`START.bat`) and tunnel is active (`SHARE-TUNNEL.bat`) |
| Network error on device | Check iPhone Settings → CODDY → Local Network = ON |

## Architecture

```
┌─────────────────────────────────────┐
│           SwiftUI Views             │
│  (ContentView, *Screen.swift)       │
└──────────────┬──────────────────────┘
               │ @EnvironmentObject
┌──────────────▼──────────────────────┐
│         ViewModels                  │
│  AuthViewModel, DashboardViewModel  │
└──────────────┬──────────────────────┘
               │ calls
┌──────────────▼──────────────────────┐
│         APIService                  │
│  - Auto-discovers server URL        │
│  - Manages cookies (URLSession)     │
│  - Retries / timeouts               │
└──────────────┬──────────────────────┘
               │ stores
┌──────────────▼──────────────────────┐
│         KeychainHelper              │
│  - Auth tokens                      │
│  - Biometric credentials            │
└─────────────────────────────────────┘
```

## Notes

- **Minimum iOS**: 17.0 (uses modern SwiftUI APIs: `.symbolEffect`, `.refreshable`, etc.)
- **No external dependencies** — Pure Swift/Foundation/SwiftUI
- **Asset catalog**: Add your app icons to `Assets.xcassets` in Xcode (1024×1024 for App Store)
- **Orientation**: Portrait only (banking app standard)

## License

Internal demo app for CODDY 2.2 — not for App Store distribution.