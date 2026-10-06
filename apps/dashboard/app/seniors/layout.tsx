import type { ReactNode } from "react";
import { AppShell } from "../../src/components/AppShell";

export default function SeniorsLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
