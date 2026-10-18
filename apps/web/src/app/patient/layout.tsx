import { PatientShell } from "@/components/patient-shell";
import { WorkspaceProvider } from "@/components/providers";

export default function PatientLayout({ children }: { children: React.ReactNode }) { return <WorkspaceProvider><PatientShell>{children}</PatientShell></WorkspaceProvider>; }
