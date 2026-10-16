import type { Metadata } from "next";
import { PatientShell } from "@/components/patient-shell";
import { WorkspaceProvider } from "@/components/providers";

export const metadata: Metadata = {
  manifest: "/patient/manifest.webmanifest",
  appleWebApp: { capable: true, title: "hale.", statusBarStyle: "default" },
  icons: { apple: "/patient/apple-touch-icon.png", icon: "/patient/icon-192.png" },
};
export default function PatientLayout({ children }: { children: React.ReactNode }) { return <WorkspaceProvider><PatientShell>{children}</PatientShell></WorkspaceProvider>; }
