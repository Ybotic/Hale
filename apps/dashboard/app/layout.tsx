import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "../src/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snow Caregiver",
  description: "Configure care information for Snow voice assistant.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
