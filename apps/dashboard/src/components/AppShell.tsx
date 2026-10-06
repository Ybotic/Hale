"use client";

import Link from "next/link";
import { UserButton, useAuth, useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const ensureCaregiver = useMutation(api.users.ensureCurrentCaregiver);
  const [profileReady, setProfileReady] = useState(false);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }
    if (!user || user.publicMetadata.snowRole !== "caregiver") return;
    setProfileReady(false);
    setProfileError("");
    void ensureCaregiver({ name: user.fullName ?? user.firstName ?? "Caregiver" })
      .then(() => setProfileReady(true))
      .catch((cause: unknown) => setProfileError(cause instanceof Error ? cause.message : "Could not load caregiver profile."));
  }, [ensureCaregiver, isLoaded, isSignedIn, router, user]);

  if (!isLoaded || !isSignedIn) return <main className="grid min-h-screen place-items-center">Loading caregiver account…</main>;
  if (user?.publicMetadata.snowRole !== "caregiver") return <main className="mx-auto grid min-h-screen max-w-md place-items-center p-6 text-center">
    <div><h1 className="text-2xl font-bold">Caregiver role required</h1><p className="mt-3 text-slate-600">Ask the account owner to set <code>publicMetadata.snowRole</code> to <code>caregiver</code> in Clerk.</p><UserButton /></div>
  </main>;
  if (!profileReady) return <main className="grid min-h-screen place-items-center p-6 text-center">
    {profileError ? <p role="alert" className="max-w-lg text-red-800">{profileError}</p> : <p>Loading caregiver profile…</p>}
  </main>;

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-snow-100 bg-white px-6 py-4">
        <Link href="/seniors" className="text-xl font-bold text-snow-900">snow</Link>
        <div className="flex items-center gap-3 text-sm"><span>Caregiver dashboard</span><UserButton /></div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
