import type { ReactNode } from "react";
import { EmergencyAlertBanner } from "../../../src/components/EmergencyAlertBanner";
import { SeniorNav } from "../../../src/components/SeniorNav";

export default function SeniorLayout({ children }: { children: ReactNode }) {
  return <><SeniorNav /><EmergencyAlertBanner />{children}</>;
}
