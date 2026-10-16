import { FamilyShell } from "@/components/family-shell";
import { WorkspaceProvider } from "@/components/providers";

export default function FamilyLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceProvider><FamilyShell>{children}</FamilyShell></WorkspaceProvider>;
}
