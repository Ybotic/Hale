import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-form";

export const metadata: Metadata = { title: "Log in" };
export default function LoginPage() { return <AuthPage />; }
