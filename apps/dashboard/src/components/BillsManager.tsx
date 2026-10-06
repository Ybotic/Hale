"use client";

import { billInputSchema } from "@snow/shared";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";

type BillForm = { payee: string; description: string; amount: string; dueDate: string; status: "unpaid" | "paid"; notes: string };
const blank: BillForm = { payee: "", description: "", amount: "", dueDate: "", status: "unpaid", notes: "" };

export function BillsManager() {
  const { seniorId: rawSeniorId } = useParams<{ seniorId: string }>();
  const seniorId = rawSeniorId as Id<"users">;
  const bills = useQuery(api.bills.list, { seniorId });
  const create = useMutation(api.bills.create);
  const update = useMutation(api.bills.update);
  const remove = useMutation(api.bills.remove);
  const [form, setForm] = useState<BillForm>(blank);
  const [editingId, setEditingId] = useState<Id<"bills"> | null>(null);
  const [error, setError] = useState("");

  function edit(id: Id<"bills">) {
    const bill = bills?.find((item) => item._id === id);
    if (!bill) return;
    setEditingId(id);
    setForm({
      payee: bill.payee,
      description: bill.description,
      amount: (bill.amountCents / 100).toFixed(2),
      dueDate: new Date(bill.dueAt).toISOString().slice(0, 10),
      status: bill.status,
      notes: bill.notes ?? "",
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    try {
      const parsed = billInputSchema.parse({
        payee: form.payee,
        description: form.description,
        amountCents: Math.round(Number(form.amount) * 100),
        dueAt: Date.parse(`${form.dueDate}T00:00:00.000Z`),
        status: form.status,
        notes: form.notes || undefined,
      });
      const input = {
        payee: parsed.payee,
        description: parsed.description,
        amountCents: parsed.amountCents,
        dueAt: parsed.dueAt,
        status: parsed.status,
        ...(parsed.paidAt === undefined ? {} : { paidAt: parsed.paidAt }),
        ...(parsed.notes === undefined ? {} : { notes: parsed.notes }),
      };
      if (editingId) await update({ seniorId, billId: editingId, bill: input });
      else await create({ seniorId, bill: input });
      setForm(blank); setEditingId(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save bill."); }
  }

  async function deleteBill(id: Id<"bills">) {
    if (!window.confirm("Delete this bill?")) return;
    try { await remove({ seniorId, billId: id }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete bill."); }
  }

  return <section className="mx-auto max-w-5xl space-y-7 px-5 py-6">
    <div><p className="text-sm font-semibold uppercase tracking-wide text-snow-700">Care records</p><h1 className="mt-1 text-3xl font-bold">Bills</h1></div>
    <form onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-xl border bg-white p-5 shadow-sm sm:grid-cols-2">
      <h2 className="text-lg font-semibold sm:col-span-2">{editingId ? "Edit bill" : "Add bill"}</h2>
      <label className="grid gap-1 text-sm">Payee<input className="rounded border p-2" required value={form.payee} onChange={(event) => setForm((current) => ({ ...current, payee: event.target.value }))} /></label>
      <label className="grid gap-1 text-sm">Description<input className="rounded border p-2" required value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
      <label className="grid gap-1 text-sm">Amount ($)<input className="rounded border p-2" required min="0" step="0.01" type="number" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} /></label>
      <label className="grid gap-1 text-sm">Due date<input className="rounded border p-2" required type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} /></label>
      <label className="grid gap-1 text-sm">Status<select className="rounded border p-2" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as BillForm["status"] }))}><option value="unpaid">Unpaid</option><option value="paid">Paid</option></select></label>
      <label className="grid gap-1 text-sm">Notes<input className="rounded border p-2" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
      {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2"><button className="rounded-lg bg-snow-700 px-4 py-2 font-semibold text-white">{editingId ? "Save changes" : "Add bill"}</button>{editingId && <button type="button" className="rounded-lg border px-4 py-2" onClick={() => { setForm(blank); setEditingId(null); }}>Cancel</button>}</div>
    </form>
    {bills === undefined ? <p>Loading bills…</p> : bills.length === 0 ? <p className="rounded-xl border bg-white p-5 text-slate-600">No bills added.</p> : <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="border-b bg-snow-50"><tr><th className="p-3">Payee</th><th className="p-3">Description</th><th className="p-3">Amount</th><th className="p-3">Due</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody>{bills.map((bill) => <tr key={bill._id} className="border-b last:border-0"><td className="p-3 font-medium">{bill.payee}</td><td className="p-3">{bill.description}</td><td className="p-3">${(bill.amountCents / 100).toFixed(2)}</td><td className="p-3">{new Date(bill.dueAt).toLocaleDateString()}</td><td className="p-3 capitalize">{bill.status}</td><td className="p-3"><div className="flex gap-2"><button className="underline" onClick={() => edit(bill._id)}>Edit</button><button className="text-red-800 underline" onClick={() => void deleteBill(bill._id)}>Delete</button></div></td></tr>)}</tbody></table></div>}
  </section>;
}
