"use client";

import { seniorProfileSchema } from "@snow/shared";
import { useAction, useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";

type ProfileState = {
  name: string;
  preferredName: string;
  dateOfBirth: string;
  timezone: string;
  allergies: string;
  primaryDoctor: string;
  pharmacy: string;
  address: string;
  notes: string;
};

const emptyProfile: ProfileState = {
  name: "", preferredName: "", dateOfBirth: "", timezone: "UTC", allergies: "",
  primaryDoctor: "", pharmacy: "", address: "", notes: "",
};

export function SeniorProfileForm() {
  const { seniorId: rawSeniorId } = useParams<{ seniorId: string }>();
  const seniorId = rawSeniorId as Id<"users">;
  const senior = useQuery(api.users.getSeniorProfile, { seniorId });
  const updateProfile = useMutation(api.users.updateSeniorProfile);
  const deleteSenior = useAction(api.users.deleteSenior);
  const createPairingCode = useAction(api.pairing.createPairingCode);
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileState>(emptyProfile);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingExpiresAt, setPairingExpiresAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!senior) return;
    setProfile({
      name: senior.name,
      preferredName: senior.preferredName ?? "",
      dateOfBirth: senior.dateOfBirth ?? "",
      timezone: senior.timezone,
      allergies: senior.allergies.join(", "),
      primaryDoctor: senior.primaryDoctor ?? "",
      pharmacy: senior.pharmacy ?? "",
      address: senior.address ?? "",
      notes: senior.notes ?? "",
    });
  }, [senior]);

  function change<K extends keyof ProfileState>(key: K, value: ProfileState[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const parsed = seniorProfileSchema.parse({
        name: profile.name,
        preferredName: profile.preferredName || undefined,
        dateOfBirth: profile.dateOfBirth || undefined,
        timezone: profile.timezone,
        allergies: profile.allergies.split(",").map((item) => item.trim()).filter(Boolean),
        primaryDoctor: profile.primaryDoctor || undefined,
        pharmacy: profile.pharmacy || undefined,
        address: profile.address || undefined,
        notes: profile.notes || undefined,
      });
      const input = {
        name: parsed.name,
        timezone: parsed.timezone,
        allergies: parsed.allergies,
        ...(parsed.preferredName === undefined ? {} : { preferredName: parsed.preferredName }),
        ...(parsed.dateOfBirth === undefined ? {} : { dateOfBirth: parsed.dateOfBirth }),
        ...(parsed.primaryDoctor === undefined ? {} : { primaryDoctor: parsed.primaryDoctor }),
        ...(parsed.pharmacy === undefined ? {} : { pharmacy: parsed.pharmacy }),
        ...(parsed.address === undefined ? {} : { address: parsed.address }),
        ...(parsed.notes === undefined ? {} : { notes: parsed.notes }),
      };
      await updateProfile({ seniorId, profile: input });
      setNotice("Profile saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  async function pairPhone() {
    setError("");
    try {
      const result = await createPairingCode({ seniorId });
      setPairingCode(result.code);
      setPairingExpiresAt(result.expiresAt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create pairing code.");
    }
  }

  async function removeProfile() {
    if (!window.confirm("Delete this senior profile and all associated records, chat history, and stored audio? This cannot be undone.")) return;
    setError("");
    try {
      await deleteSenior({ seniorId });
      router.push("/seniors");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete senior profile.");
    }
  }

  if (senior === undefined) return <p className="px-5 py-8 text-slate-600">Loading profile…</p>;

  return <section className="mx-auto max-w-3xl space-y-7 px-5 py-6">
    <div><p className="text-sm font-semibold uppercase tracking-wide text-snow-700">Senior profile</p><h1 className="mt-1 text-3xl font-bold">{senior.preferredName || senior.name}</h1></div>
    <form onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-xl border bg-white p-5 shadow-sm sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Full name<input className="rounded border p-2" required value={profile.name} onChange={(event) => change("name", event.target.value)} /></label>
      <label className="grid gap-1 text-sm">Preferred name<input className="rounded border p-2" value={profile.preferredName} onChange={(event) => change("preferredName", event.target.value)} /></label>
      <label className="grid gap-1 text-sm">Date of birth<input type="date" className="rounded border p-2" value={profile.dateOfBirth} onChange={(event) => change("dateOfBirth", event.target.value)} /></label>
      <label className="grid gap-1 text-sm">Timezone<input className="rounded border p-2" required value={profile.timezone} onChange={(event) => change("timezone", event.target.value)} placeholder="America/New_York" /></label>
      <label className="grid gap-1 text-sm sm:col-span-2">Allergies (comma-separated)<input className="rounded border p-2" value={profile.allergies} onChange={(event) => change("allergies", event.target.value)} /></label>
      <label className="grid gap-1 text-sm">Primary doctor<input className="rounded border p-2" value={profile.primaryDoctor} onChange={(event) => change("primaryDoctor", event.target.value)} /></label>
      <label className="grid gap-1 text-sm">Pharmacy<input className="rounded border p-2" value={profile.pharmacy} onChange={(event) => change("pharmacy", event.target.value)} /></label>
      <label className="grid gap-1 text-sm sm:col-span-2">Address<textarea className="rounded border p-2" rows={2} value={profile.address} onChange={(event) => change("address", event.target.value)} /></label>
      <label className="grid gap-1 text-sm sm:col-span-2">Care notes<textarea className="rounded border p-2" rows={4} value={profile.notes} onChange={(event) => change("notes", event.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-800 sm:col-span-2">{notice}</p>}
      <button disabled={saving} className="w-fit rounded-lg bg-snow-700 px-4 py-2 font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save profile"}</button>
    </form>

    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Pair senior’s phone</h2>
      <p className="mt-1 text-sm text-slate-600">Create a code that expires in ten minutes and can be used once. Show it to the senior; it is displayed only now.</p>
      {senior.clerkId ? <p className="mt-3 font-medium text-green-800">This senior’s phone is paired.</p> : <button onClick={() => void pairPhone()} className="mt-4 rounded-lg border border-snow-700 px-4 py-2 font-semibold text-snow-700">Create pairing code</button>}
      {pairingCode && <div className="mt-4 rounded-lg bg-snow-50 p-4">
        <p className="text-2xl font-bold tracking-[0.2em]">{pairingCode}</p>
        <p className="mt-1 text-sm text-slate-600">Expires {pairingExpiresAt ? new Date(pairingExpiresAt).toLocaleTimeString() : "soon"}.</p>
      </div>}
    </section>

    <section className="border-t border-red-200 pt-5">
      <h2 className="font-semibold text-red-800">Delete senior profile</h2>
      <p className="mt-1 text-sm text-slate-600">Permanently removes the profile, care records, chat text, and any audio that has not already expired.</p>
      <button onClick={() => void removeProfile()} className="mt-3 rounded-lg border border-red-700 px-4 py-2 font-semibold text-red-800">Delete profile</button>
    </section>
  </section>;
}
