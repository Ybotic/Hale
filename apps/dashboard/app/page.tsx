"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HomePage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (isLoaded) router.replace(isSignedIn ? "/seniors" : "/sign-in");
  }, [isLoaded, isSignedIn, router]);
  return <main className="grid min-h-screen place-items-center">Loading Snow…</main>;
}
