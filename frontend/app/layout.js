import "./globals.css";
import { AuthProvider } from "../context/AuthContext";

export const metadata = {
  metadataBase: new URL("https://trend-gadgets-storefront.vercel.app"),
  title: {
    default: "Trend Gadgets & Toys | Shop Online in Pakistan",
    template: "%s | Trend Gadgets & Toys",
  },
  description: "Shop toys, gifts, and gadgets from Trend Gadgets & Toys. Browse products and order directly through WhatsApp.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_PK",
    siteName: "Trend Gadgets & Toys",
    title: "Trend Gadgets & Toys | Shop Online in Pakistan",
    description: "Shop toys, gifts, and gadgets. Browse products and order directly through WhatsApp.",
    url: "/",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "Trend Gadgets & Toys" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Trend Gadgets & Toys | Shop Online in Pakistan",
    description: "Shop toys, gifts, and gadgets. Browse products and order directly through WhatsApp.",
    images: ["/logo.png"],
  },
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
