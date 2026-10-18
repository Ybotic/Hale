import type { Metadata, Viewport } from "next";
import { PatientShell } from "@/components/patient-shell";
import { WorkspaceProvider } from "@/components/providers";

export const metadata: Metadata = {
  manifest: "/patient/manifest.webmanifest",
  appleWebApp: { capable: true, title: "hale.", statusBarStyle: "default" },
  // Next.js emits mobile-web-app-capable; retain the iOS-specific opt-in too.
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: { apple: "/patient/apple-touch-icon.png", icon: "/patient/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F7FBF7",
};

export default function PatientLayout({ children }: { children: React.ReactNode }) { return <WorkspaceProvider><PatientShell>{children}</PatientShell></WorkspaceProvider>; }
