import type { ReactNode } from "react";
import { SeniorNav } from "../../../src/components/SeniorNav";

export default function SeniorLayout({ children }: { children: ReactNode }) {
  return <><SeniorNav />{children}</>;
}
