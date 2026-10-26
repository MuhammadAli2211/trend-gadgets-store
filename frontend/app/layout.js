import "./globals.css";
import { AuthProvider } from "../context/AuthContext";

export const metadata = {
  title: "Trend Gadgets & Toys | Shop on WhatsApp",
  description: "Discover toys and gadgets from Trend Gadgets & Toys. Place your order directly on WhatsApp.",
  icons: { icon: "/logo.png", apple: "/logo.png" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
