import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { IBM_Plex_Mono, Libre_Baskerville } from "next/font/google";
import { AppProviders } from "@/components/providers";
import "./globals.css";
import "./auth.css";

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-libre-baskerville",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: { default: "hale. — your memories, always within reach.", template: "%s · hale." },
  description: "A private, evidence-backed memory aid. Remember the conversations and little moments that matter.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#FAF7F5" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${libreBaskerville.variable} ${ibmPlexMono.variable}`}
    >
      <body><AppProviders>{children}</AppProviders></body>
    </html>
  );
}
