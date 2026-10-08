"use client";

import { APP_NAME, medicationInputSchema } from "@care/shared";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function MedicationManager() {
  const { seniorId: rawSeniorId } = useParams<{ seniorId: string }>();
  const seniorId = rawSeniorId as Id<"users">;
  const medications = useQuery(api.medications.list, { seniorId });
  const logs = useQuery(api.medicationLogs.listForSenior, { seniorId });
  const create = useMutation(api.medications.create);
  const update = useMutation(api.medications.update);
  const remove = useMutation(api.medications.remove);
  const [editingId, setEditingId] = useState<Id<"medications"> | null>(null);
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [instructions, setInstructions] = useState("");
  const [times, setTimes] = useState("08:00");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [active, setActive] = useState(true);
  const [error, setError] = useState("");

  function resetForm() {
    setEditingId(null); setName(""); setDosage(""); setInstructions(""); setTimes("08:00");
    setDays([0, 1, 2, 3, 4, 5, 6]); setActive(true); setError("");
  }

  function editMedication(id: Id<"medications">) {
    const medication = medications?.find((item) => item._id === id);
    if (!medication) return;
    setEditingId(id);
    setName(medication.name);
    setDosage(medication.dosage);
    setInstructions(medication.instructions);
    setTimes(medication.schedule.flatMap((entry) => entry.times).join(", "));
    setDays([...new Set(medication.schedule.flatMap((entry) => entry.daysOfWeek))]);
    setActive(medication.active);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    try {
      const medication = medicationInputSchema.parse({
        name, dosage, instructions,
        schedule: [{ daysOfWeek: days, times: times.split(",").map((time) => time.trim()).filter(Boolean) }],
        active,
      });
      if (editingId) await update({ seniorId, medicationId: editingId, medication });
      else await create({ seniorId, medication });
      resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save medication.");
    }
  }

  async function deleteMedication(id: Id<"medications">) {
    if (!window.confirm("Delete this medication and its dose logs?")) return;
    try { await remove({ seniorId, medicationId: id }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete medication."); }
  }

  return <section className="mx-auto max-w-5xl space-y-7 px-5 py-6">
    <div><p className="text-sm font-semibold uppercase tracking-wide text-hale-700">Care records</p><h1 className="mt-1 text-3xl font-bold">Medications</h1><p className="mt-2 text-slate-600">Set a schedule and instructions {APP_NAME} can read aloud.</p></div>
    <form onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-xl border bg-white p-5 shadow-sm sm:grid-cols-2">
      <h2 className="text-lg font-semibold sm:col-span-2">{editingId ? "Edit medication" : "Add medication"}</h2>
      <label className="grid gap-1 text-sm">Name<input required className="rounded border p-2" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="grid gap-1 text-sm">Dosage<input required className="rounded border p-2" value={dosage} onChange={(event) => setDosage(event.target.value)} placeholder="1 tablet" /></label>
      <label className="grid gap-1 text-sm sm:col-span-2">Instructions<input className="rounded border p-2" value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Take with food" /></label>
      <label className="grid gap-1 text-sm sm:col-span-2">Times (24-hour, comma-separated)<input required className="rounded border p-2" value={times} onChange={(event) => setTimes(event.target.value)} placeholder="08:00, 20:00" /></label>
      <fieldset className="sm:col-span-2"><legend className="mb-2 text-sm">Days</legend><div className="flex flex-wrap gap-3">{weekdays.map((label, day) => <label key={label} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={days.includes(day)} onChange={(event) => setDays((current) => event.target.checked ? [...new Set([...current, day])].sort() : current.filter((value) => value !== day))} />{label}</label>)}</div></fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Active medication</label>
      {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2"><button className="rounded-lg bg-hale-700 px-4 py-2 font-semibold text-white">{editingId ? "Save changes" : "Add medication"}</button>{editingId && <button type="button" onClick={resetForm} className="rounded-lg border px-4 py-2">Cancel edit</button>}</div>
    </form>

    {medications === undefined ? <p>Loading medications…</p> : medications.length === 0 ? <p className="rounded-xl border bg-white p-5 text-slate-600">No medications added.</p> : <div className="grid gap-3">{medications.map((medication) => <article key={medication._id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-4">
      <div><h2 className="font-semibold">{medication.name} <span className="font-normal text-slate-600">· {medication.dosage}</span></h2><p className="mt-1 text-sm text-slate-600">{medication.instructions || "No instructions"} · {medication.schedule.flatMap((entry) => entry.times).join(", ")}</p><p className="mt-1 text-xs text-slate-500">{medication.active ? "Active" : "Inactive"}</p></div>
      <div className="flex gap-2"><button onClick={() => editMedication(medication._id)} className="rounded border px-3 py-1.5 text-sm">Edit</button><button onClick={() => void deleteMedication(medication._id)} className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-800">Delete</button></div>
    </article>)}</div>}

    <section className="space-y-3"><h2 className="text-xl font-semibold">Recent dose logs</h2>{logs === undefined ? <p>Loading logs…</p> : logs.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">No doses logged yet.</p> : <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="border-b bg-hale-50"><tr><th className="p-3">Medication</th><th className="p-3">Status</th><th className="p-3">Time</th></tr></thead><tbody>{logs.map((log) => <tr key={log._id} className="border-b last:border-0"><td className="p-3">{medications?.find((item) => item._id === log.medicationId)?.name ?? "Removed medication"}</td><td className="p-3 capitalize">{log.status}</td><td className="p-3">{new Date(log.occurredAt).toLocaleString()}</td></tr>)}</tbody></table></div>}</section>
  </section>;
}
