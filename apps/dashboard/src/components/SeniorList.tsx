"use client";

import { seniorProfileSchema } from "@care/shared";
import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";

export function SeniorList() {
  const seniors = useQuery(api.users.listMySeniors, {});
  const createSenior = useMutation(api.users.createSenior);
  const deleteSenior = useAction(api.users.deleteSenior);
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingSeniorId, setDeletingSeniorId] = useState<Id<"users"> | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const parsed = seniorProfileSchema.parse({ name, timezone, allergies: [] });
      const profile = {
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
      const seniorId = await createSenior({ profile });
      router.push(`/seniors/${seniorId}/profile`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add senior.");
    } finally {
      setSaving(false);
    }
  }

  async function resumeDelete(seniorId: Id<"users">) {
    setDeletingSeniorId(seniorId); setError("");
    try { await deleteSenior({ seniorId }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not finish deleting profile."); }
    finally { setDeletingSeniorId(null); }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold uppercase tracking-wide text-hale-700">Care team</p><h1 className="mt-1 text-3xl font-bold">Your seniors</h1><p className="mt-2 text-slate-600">Create a profile, then pair the senior’s phone using a one-time code.</p></div>
        <button className="rounded-lg bg-hale-700 px-4 py-2 font-semibold text-white" onClick={() => setShowForm((visible) => !visible)}>{showForm ? "Close" : "Add senior"}</button>
      </div>

      {showForm && <form onSubmit={(event) => void submit(event)} className="grid max-w-xl gap-4 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">New senior profile</h2>
        <label className="grid gap-1 text-sm">Name<input className="rounded border p-2" required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="grid gap-1 text-sm">Timezone<input className="rounded border p-2" required value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="America/New_York" /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={saving} className="w-fit rounded-lg bg-hale-700 px-4 py-2 font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Create profile"}</button>
      </form>}
      {error && !showForm && <p role="alert" className="text-sm text-red-700">{error}</p>}

      {seniors === undefined ? <p className="text-slate-600">Loading seniors…</p> : seniors.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center text-slate-600">No senior profiles yet. Add a senior to get started.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {seniors.map((senior) => senior.deletingAt !== undefined ? (
          <article key={senior._id} className="rounded-xl border border-amber-300 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">{senior.preferredName || senior.name}</h2>
            <p className="mt-2 text-sm text-slate-600">Profile deletion is in progress.</p>
            <button disabled={deletingSeniorId === senior._id} onClick={() => void resumeDelete(senior._id)} className="mt-4 text-sm font-semibold text-hale-700 underline">{deletingSeniorId === senior._id ? "Finishing deletion…" : "Continue deletion"}</button>
          </article>
        ) : (
          <Link key={senior._id} href={`/seniors/${senior._id}`} className="rounded-xl border bg-white p-5 shadow-sm transition hover:border-hale-700">
            <h2 className="text-lg font-semibold">{senior.preferredName || senior.name}</h2>
            <p className="mt-2 text-sm text-slate-600">{senior.paired ? "Phone paired" : "Waiting for phone pairing"}</p>
            <p className="mt-4 text-sm font-semibold text-hale-700">Open overview →</p>
          </Link>
        ))}
        </div>
      )}
    </section>
  );
}
