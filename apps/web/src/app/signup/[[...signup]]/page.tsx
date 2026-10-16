import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-form";

export const metadata: Metadata = { title: "Join your circle" };
export default function SignupPage() { return <AuthPage signup />; }
