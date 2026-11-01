import "./globals.css";
import { AuthProvider } from "../context/AuthContext";

export const metadata = {
  metadataBase: new URL("https://trend-gadgets-storefront.vercel.app"),
  title: {
    default: "Cart2Door | Shop Online in Pakistan",
    template: "%s | Cart2Door",
  },
  description: "Shop products, gifts, and gadgets from Cart2Door. Browse products and order directly through WhatsApp.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_PK",
    siteName: "Cart2Door",
    title: "Cart2Door | Shop Online in Pakistan",
    description: "Shop products, gifts, and gadgets. Browse products and order directly through WhatsApp.",
    url: "/",
    images: [{ url: "/cart2door-logo.png", width: 512, height: 512, alt: "Cart2Door" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cart2Door | Shop Online in Pakistan",
    description: "Shop toys, gifts, and gadgets. Browse products and order directly through WhatsApp.",
    images: ["/cart2door-logo.png"],
  },
  icons: { icon: "/cart2door-logo.png", apple: "/cart2door-logo.png" },
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
