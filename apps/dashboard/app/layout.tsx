import type { Metadata } from "next";
import type { ReactNode } from "react";
import { APP_NAME } from "@care/shared";
import { Providers } from "../src/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP_NAME} Caregiver`,
  description: `Caregiver dashboard for the ${APP_NAME} voice assistant.`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
