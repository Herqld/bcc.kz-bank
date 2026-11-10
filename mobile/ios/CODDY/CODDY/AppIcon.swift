import SwiftUI

struct AppIcon: View {
    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [
                    Color(hex: "0E0F12"),
                    Color(hex: "17191E")
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            // Building icon
            Image(systemName: "building.columns.fill")
                .font(.system(size: 60, weight: .medium))
                .foregroundColor(Color(hex: "16B97C"))
                .shadow(color: Color(hex: "16B97C").opacity(0.5), radius: 10, x: 0, y: 5)
        }
    }
}

#Preview {
    AppIcon()
        .frame(width: 1024, height: 1024)
}