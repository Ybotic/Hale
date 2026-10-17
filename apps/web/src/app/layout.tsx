import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import { AppearanceProvider } from "@/components/appearance";
import { AppProviders } from "@/components/providers";
import "./globals.css";
import "./auth.css";
import "./redesign.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const appearanceBootstrap = `(()=>{try{const m=localStorage.getItem('hale-theme');const c=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';const h=matchMedia('(prefers-contrast: more)').matches;const t=m==='light'||m==='dark'||m==='high-contrast'?m:(h?'high-contrast':c);const s=localStorage.getItem('hale-text-size');const z=['small','default','large','extra-large'].includes(s)?s:'default';const r=localStorage.getItem('hale-reduce-motion');const q=r===null?matchMedia('(prefers-reduced-motion: reduce)').matches:r==='true';document.documentElement.dataset.theme=t;document.documentElement.dataset.colorScheme=c;document.documentElement.dataset.textSize=z;document.documentElement.dataset.reduceMotion=q?'reduce':'full'}catch(e){document.documentElement.dataset.theme='light';document.documentElement.dataset.textSize='default'}})();`;

export const metadata: Metadata = {
  title: { default: "hale. — your memories, always within reach.", template: "%s · hale." },
  description: "A private, evidence-backed memory aid. Remember the conversations and little moments that matter.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "var(--ground)" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={inter.variable}
    >
      <Script id="hale-appearance-bootstrap" strategy="beforeInteractive">{appearanceBootstrap}</Script>
      <body><AppearanceProvider><AppProviders>{children}</AppProviders></AppearanceProvider></body>
    </html>
  );
}
