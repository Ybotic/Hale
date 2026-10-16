import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AppProviders } from "@/components/providers";
import "./globals.css";
import "./auth.css";

export const metadata: Metadata = {
  title: { default: "mnemo. — your memories, always within reach.", template: "%s · mnemo." },
  description: "A private, evidence-backed memory aid. Remember the conversations and little moments that matter.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#FFFFFF" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body><AppProviders>{children}</AppProviders></body>
    </html>
  );
}
