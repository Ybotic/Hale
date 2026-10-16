import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create your memory space" };
export default function PatientSignupPage() { return <AuthPage signup patient />; }
