"use client";

import { useState, type FormEvent } from "react";
import { ArrowUpRight, Plus, Trash2 } from "lucide-react";
import { apiPath, apiRequest, useApiQuery } from "@/lib/api-client";
import { useWorkspace } from "./providers";
import { EmptyState } from "./ui";
import type { CareRecord, CareRecordType, Capability } from "@hale/contracts";
import { canCreateCareRecord, hasSpaceCapability } from "@/lib/ui-permissions";
import { Switch } from "./ui/switch";
import { useToast } from "./ui/toast-provider";
import { Button } from "./ui/button";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

type CareRecordResponse = { items: CareRecord[] };

const displayLocale = "en-US";

const config: Record<CareRecordType, { label: string; heading: string; add: string; detailLabel: string; detailPlaceholder: string; read: string; create: string }> = {
  ride: { label: "Rides", heading: "Ride records", add: "Add a ride", detailLabel: "Pickup and destination", detailPlaceholder: "Pickup → destination, ride provider, or receipt details", read: "rides:prepare", create: "rides:prepare" },
  appointment: { label: "Appointments", heading: "Appointment records", add: "Add an appointment", detailLabel: "Clinic or location", detailPlaceholder: "Clinic, provider, location, or reminder", read: "appointments:book", create: "appointments:book" },
  medication: { label: "Medication records", heading: "Medication records", add: "Add a medication record", detailLabel: "Recorded instructions or note", detailPlaceholder: "Enter information exactly as it appears on your source. This is a record, not medication advice.", read: "medications:read", create: "medications:record" },
  care_cost: { label: "Care costs", heading: "Manually recorded care costs", add: "Add a care cost", detailLabel: "Merchant or provider", detailPlaceholder: "Clinic, pharmacy, transport provider, or other merchant", read: "memories:read", create: "sharing:manage" },
};

function formatWhen(value: number | null, timezone: string) {
  if (!value) return "Date not set";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date not set";
  try { return new Intl.DateTimeFormat(displayLocale, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(date); }
  catch { return new Intl.DateTimeFormat(displayLocale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date); }
}

function formatMoney(value: number, currency: string) {
  try { return new Intl.NumberFormat(displayLocale, { style: "currency", currency }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}

function appleReminderHref(item: CareRecord) {
  const payload = JSON.stringify({
    title: item.title,
    notes: item.details,
    dueAt: item.scheduledAt ? new Date(item.scheduledAt).toISOString() : null,
    recurrence: item.recurrence,
    reminderTimes: item.reminderTimes,
    reminderDays: item.reminderDays,
  });
  const url = new URL("shortcuts://run-shortcut");
  url.searchParams.set("name", "Hale Add Reminder");
  url.searchParams.set("input", "text");
  url.searchParams.set("text", payload);
  return url.toString();
}

export function CareRecordsPanel({ type }: { type: CareRecordType }) {
  const { mode, space, careRecords, setCareRecords } = useWorkspace();
  const toast = useToast();
  const settings = config[type];
  const readCapability = settings.read as Capability;
  const createCapability = settings.create as Capability;
  const canRead = hasSpaceCapability(space.capabilities, readCapability);
  const canCreate = canCreateCareRecord(space.capabilities, createCapability, type === "medication" ? readCapability : undefined);
  const [revision, setRevision] = useState(0);
  const path = apiPath("care/records", { patientId: space.id, type, refresh: String(revision) });
  const { data, error, isLoading } = useApiQuery<CareRecordResponse>(path, mode === "live" && canRead, 15_000);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [medicationFrequency, setMedicationFrequency] = useState("daily");
  const [reminderDays, setReminderDays] = useState<number[]>([1, 2, 3, 4, 5]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setErrorMessage("");
    const element = event.currentTarget;
    try {
      const form = new FormData(element);
      const rawDate = String(form.get("scheduledAt") ?? "");
      const dateOnly = type === "care_cost" || type === "medication";
      const scheduledAt = rawDate || null;
      const location = String(form.get("location") ?? "").trim();
      const notes = String(form.get("details") ?? "").trim();
      const details = [location ? `${type === "ride" ? "Route" : "Location"}: ${location}` : "", notes].filter(Boolean).join("\n");
      const record = {
        patientId: space.id,
        type,
        title: String(form.get("title") ?? "").trim(),
        details,
        scheduledAt,
        amount: String(form.get("amount") ?? "") || null,
        currency: String(form.get("currency") ?? "USD"),
        recurrence: type === "medication" ? String(form.get("recurrence") ?? "daily") : "none",
        reminderTimes: String(form.get("reminderTimes") ?? "").split(",").map((time) => time.trim()).filter(Boolean),
        reminderDays: form.getAll("reminderDays").map(Number).filter(Number.isInteger),
        reminderOffsets: String(form.get("reminderOffsets") ?? "1440,60").split(",").map((offset) => Number(offset.trim())).filter(Number.isFinite),
        remindersEnabled: form.get("remindersEnabled") === "on",
      };
      if (mode === "live") {
        await apiRequest("care/records", { json: record });
        setRevision((value) => value + 1);
      } else {
        setCareRecords((items) => [{ ...record, id: crypto.randomUUID(), scheduledAt: scheduledAt ? dateOnly ? new Date(`${scheduledAt}T12:00:00`).getTime() : new Date(scheduledAt).getTime() : null, amount: record.amount === null ? null : Number(record.amount), source: "demo", canDelete: true, timezone: space.timezone }, ...items]);
      }
      element.reset();
      setMedicationFrequency("daily");
      setReminderDays([1, 2, 3, 4, 5]);
      setShowForm(false);
      toast.show({ type: "success", title: `${settings.label.slice(0, -1)} saved in this patient space.` });
    } catch (reason) {
      setErrorMessage(reason instanceof Error ? reason.message : "The record could not be saved.");
    } finally { setBusy(false); }
  }

  async function remove(item: CareRecord) {
    setBusy(true); setErrorMessage("");
    try {
      if (mode === "live") {
        await apiRequest(apiPath(`care/records/${item.id}`, { patientId: space.id }), { method: "DELETE" });
        setRevision((value) => value + 1);
      } else setCareRecords((items) => items.filter((record) => record.id !== item.id));
    } catch (reason) {
      setErrorMessage(reason instanceof Error ? reason.message : "The record could not be removed.");
    } finally { setBusy(false); }
  }

  const items = mode === "demo" ? careRecords.filter((record) => record.type === type && record.source !== "nessie_demo") : data?.items ?? [];
  return <section className="care-records-panel">
     <div className="care-records-heading"><div><p className="eyebrow">Your records</p><h3>{settings.heading}</h3></div>{canCreate && <Button type="button" variant="secondary" onClick={() => setShowForm((value) => !value)}><Plus aria-hidden />{showForm ? "Close form" : settings.add}</Button>}</div>
    {mode === "live" && !canRead && <p className="small muted">Your account does not have permission to read these records.</p>}
    {mode === "live" && error && <p className="small error-text" role="alert">Records could not be loaded. Check your connection and permission.</p>}
    {mode === "live" && isLoading && canRead && <p className="small muted" role="status">Loading records…</p>}
    {!canCreate && <p className="small muted">Ask the patient-space administrator to grant permission before adding records.</p>}
    {showForm && canCreate && <form className="care-record-form" onSubmit={(event) => void submit(event)}>
      <label>{type === "medication" ? "Medication name" : type === "appointment" ? "Appointment" : type === "ride" ? "Ride" : "Cost name"}<input name="title" required maxLength={120} placeholder={type === "medication" ? "Name from the label or source" : type === "appointment" ? "e.g. Clinic follow-up" : type === "ride" ? "e.g. Ride to clinic" : "e.g. Prescription copay"} /></label>
      {type !== "medication" && <label>{settings.detailLabel}<input name="location" maxLength={240} placeholder={settings.detailPlaceholder} /></label>}
      {type === "medication" && <label>Recorded directions / note<textarea name="details" required maxLength={1200} placeholder={settings.detailPlaceholder} rows={3} /></label>}
      {type !== "medication" && <label>Notes<textarea name="details" maxLength={1200} placeholder="Optional notes; only enter what you want shared with this patient space." rows={2} /></label>}
      <label>{type === "care_cost" || type === "medication" ? type === "medication" ? "Schedule start date" : "Date" : "Date and time"}<input name="scheduledAt" type={type === "care_cost" || type === "medication" ? "date" : "datetime-local"} /></label>
      {type === "medication" && <>
        <label>Schedule<select name="recurrence" value={medicationFrequency} onChange={(event) => setMedicationFrequency(event.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="as_needed">As needed · no automatic reminders</option><option value="none">Record only · no repeating schedule</option></select></label>
        {medicationFrequency === "weekly" && <div className="care-reminder-days"><span>Reminder days · Sunday first</span><ToggleGroup type="multiple" value={reminderDays.map(String)} onValueChange={(values) => setReminderDays(values.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day < 7).sort((a, b) => a - b))} className="care-reminder-day-options" aria-label="Reminder days">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => <ToggleGroupItem key={day} value={String(index)} aria-label={day}>{day}</ToggleGroupItem>)}</ToggleGroup>{reminderDays.map((day) => <input key={day} type="hidden" name="reminderDays" value={day} />)}</div>}
        {(medicationFrequency === "daily" || medicationFrequency === "weekly") && <label>Time(s), 24-hour clock, comma-separated<input name="reminderTimes" placeholder="08:00, 20:00" /></label>}
        {(medicationFrequency === "daily" || medicationFrequency === "weekly") && <label className="check-label"><Switch name="remindersEnabled" /><span>Send a PWA notification at these times when this device has reminders enabled.</span></label>}
      </>}
      {type === "appointment" && <><label className="check-label"><Switch name="remindersEnabled" /><span>Send PWA appointment reminders when notifications are enabled.</span></label><label>Reminder offsets (minutes before, comma-separated)<input name="reminderOffsets" defaultValue="1440, 60" /></label></>}
      {(type === "care_cost" || type === "ride") && <div className="care-record-money"><label>{type === "care_cost" ? "Amount" : "Estimated or paid amount (optional)"}<input name="amount" type="number" min="0" step="0.01" required={type === "care_cost"} /></label><label>Currency<select name="currency" defaultValue="USD"><option value="USD">USD</option><option value="CAD">CAD</option><option value="GBP">GBP</option><option value="EUR">EUR</option></select></label></div>}
      {type === "medication" && <p className="small muted">This stores your entry only. It does not validate a prescription, provide dosing advice, or confirm that a dose was taken.</p>}
      {errorMessage && <p className="small error-text" role="alert">{errorMessage}</p>}
       <Button variant="primary" disabled={busy}>{busy ? "Saving…" : "Save record"}</Button>
    </form>}
    {items.length ? <div className="care-record-list">{items.map((item) => <article className="care-record-row" key={item.id}>
      <div><strong>{item.title}</strong><span>{formatWhen(item.scheduledAt, space.timezone)}{item.type === "medication" && item.recurrence !== "none" ? ` · ${item.recurrence}${item.reminderTimes.length ? ` at ${item.reminderTimes.join(", ")}` : ""}` : ""}{item.remindersEnabled ? " · Hale reminders on" : ""}{item.source !== "manual" && item.source !== "demo" ? ` · ${item.source}` : ""}</span>{item.details && <p>{item.details}</p>}</div>
      {item.amount !== null && <strong className="care-record-amount">{formatMoney(item.amount, item.currency)}</strong>}
      {(item.type === "medication" || item.type === "appointment") && item.scheduledAt && <a className="text-link care-apple-reminder" href={appleReminderHref(item)}><ArrowUpRight size={14} />Add to Apple Reminders</a>}
       {item.canDelete && <Button type="button" variant="secondary" className="icon-button" disabled={busy} aria-label={`Remove ${item.title}`} data-visible-label="Remove" onClick={() => void remove(item)}><Trash2 aria-hidden /></Button>}
    </article>)}</div> : !isLoading && (mode === "demo" || canRead) && <EmptyState title={`No ${settings.label.toLowerCase()} yet.`} description={`Use “${settings.add}” to add one to this patient space.`} />}
    {(type === "medication" || type === "appointment") && <details className="apple-shortcut-help"><summary>Add reminders to Apple Reminders</summary><p>Create a Shortcut named <strong>Hale Add Reminder</strong> that accepts Text, uses “Get Dictionary from Input,” then “Add New Reminder” with the title, notes, and dueAt values. Hale passes the schedule details to that shortcut; it only creates reminders and never reads existing Apple Reminders.</p></details>}
    {errorMessage && !showForm && <p className="small error-text" role="alert">{errorMessage}</p>}
  </section>;
}
