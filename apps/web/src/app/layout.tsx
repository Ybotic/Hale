import type { Metadata, Viewport } from "next";
import { Inter, Libre_Baskerville } from "next/font/google";
import { AppThemeProvider } from "@/components/appearance";
import { AppProviders } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const libreBaskervilleItalic = Libre_Baskerville({
  weight: "400",
  style: "italic",
  subsets: ["latin"],
  variable: "--font-libre-baskerville-italic",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "hale. — your memories, always within reach.", template: "%s · hale." },
  description: "A private, evidence-backed memory aid. Remember the conversations and little moments that matter.",
  robots: { index: false, follow: false },
  manifest: "/patient/manifest.webmanifest",
  appleWebApp: { capable: true, title: "hale.", statusBarStyle: "default" },
  // Keep the iOS-specific opt-in alongside Next.js's mobile-web-app-capable tag.
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: { apple: "/patient/apple-touch-icon.png", icon: "/patient/icon-192.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#F7FBF7" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${libreBaskervilleItalic.variable}`}
    >
      <body><AppThemeProvider><AppProviders>{children}</AppProviders></AppThemeProvider></body>
    </html>
  );
}
