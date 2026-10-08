"use client";

import { emergencyContactInputSchema } from "@care/shared";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";

type ContactForm = { name: string; relationship: string; phone: string; notes: string };
const blank: ContactForm = { name: "", relationship: "", phone: "", notes: "" };

export function ContactsManager() {
  const { seniorId: rawSeniorId } = useParams<{ seniorId: string }>();
  const seniorId = rawSeniorId as Id<"users">;
  const contacts = useQuery(api.emergencyContacts.list, { seniorId });
  const create = useMutation(api.emergencyContacts.create);
  const update = useMutation(api.emergencyContacts.update);
  const remove = useMutation(api.emergencyContacts.remove);
  const [form, setForm] = useState<ContactForm>(blank);
  const [editingId, setEditingId] = useState<Id<"emergencyContacts"> | null>(null);
  const [error, setError] = useState("");

  function edit(id: Id<"emergencyContacts">) {
    const contact = contacts?.find((item) => item._id === id);
    if (!contact) return;
    setEditingId(id);
    setForm({ name: contact.name, relationship: contact.relationship, phone: contact.phone, notes: contact.notes ?? "" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    try {
      const parsed = emergencyContactInputSchema.parse({ ...form, notes: form.notes || undefined, sortOrder: contacts?.length ?? 0 });
      const contact = {
        name: parsed.name,
        relationship: parsed.relationship,
        phone: parsed.phone,
        sortOrder: parsed.sortOrder,
        ...(parsed.notes === undefined ? {} : { notes: parsed.notes }),
      };
      if (editingId) await update({ seniorId, contactId: editingId, contact });
      else await create({ seniorId, contact });
      setForm(blank); setEditingId(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save contact."); }
  }

  async function deleteContact(id: Id<"emergencyContacts">) {
    if (!window.confirm("Delete this emergency contact?")) return;
    try { await remove({ seniorId, contactId: id }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete contact."); }
  }

  return <section className="mx-auto max-w-5xl space-y-7 px-5 py-6">
    <div><p className="text-sm font-semibold uppercase tracking-wide text-hale-700">Care records</p><h1 className="mt-1 text-3xl font-bold">Emergency contacts</h1></div>
    <form onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-xl border bg-white p-5 shadow-sm sm:grid-cols-2">
      <h2 className="text-lg font-semibold sm:col-span-2">{editingId ? "Edit contact" : "Add contact"}</h2>
      <label className="grid gap-1 text-sm">Name<input className="rounded border p-2" required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
      <label className="grid gap-1 text-sm">Relationship<input className="rounded border p-2" required value={form.relationship} onChange={(event) => setForm((current) => ({ ...current, relationship: event.target.value }))} placeholder="Daughter" /></label>
      <label className="grid gap-1 text-sm">Phone<input className="rounded border p-2" required type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label>
      <label className="grid gap-1 text-sm">Notes<input className="rounded border p-2" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
      {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2"><button className="rounded-lg bg-hale-700 px-4 py-2 font-semibold text-white">{editingId ? "Save changes" : "Add contact"}</button>{editingId && <button type="button" className="rounded-lg border px-4 py-2" onClick={() => { setForm(blank); setEditingId(null); }}>Cancel</button>}</div>
    </form>
    {contacts === undefined ? <p>Loading contacts…</p> : contacts.length === 0 ? <p className="rounded-xl border bg-white p-5 text-slate-600">No emergency contacts added.</p> : <div className="grid gap-3 sm:grid-cols-2">{contacts.map((contact) => <article key={contact._id} className="rounded-xl border bg-white p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{contact.name}</h2><p className="text-sm text-slate-600">{contact.relationship}</p><a className="mt-2 inline-block text-sm text-hale-700 underline" href={`tel:${contact.phone}`}>{contact.phone}</a>{contact.notes && <p className="mt-2 text-sm text-slate-600">{contact.notes}</p>}</div><div className="flex gap-2"><button className="text-sm underline" onClick={() => edit(contact._id)}>Edit</button><button className="text-sm text-red-800 underline" onClick={() => void deleteContact(contact._id)}>Delete</button></div></div></article>)}</div>}
  </section>;
}
