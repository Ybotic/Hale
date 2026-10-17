"use client";

import { useState } from "react";
import { Check, FileUp, LoaderCircle, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { useWorkspace } from "./providers";

type Frequency = "none" | "daily" | "weekly" | "as_needed";
type Proposal = {
  name: string;
  strength: string;
  instructions: string;
  frequency: Frequency;
  reminderTimes: string[];
  reminderDays: number[];
  prescriber: string;
  startDate: string;
  remindersEnabled: boolean;
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MedicationPdfImport() {
  const { mode, space } = useWorkspace();
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canCreate = space.capabilities.includes("medications:read") && space.capabilities.includes("medications:record");

  async function extract() {
    if (!file || !consent) return;
    setBusy(true); setError(""); setMessage(""); setProposals([]);
    try {
      const form = new FormData();
      form.set("patientId", space.id);
      form.set("consent", "true");
      form.set("file", file);
      const result = await apiRequest<{ medications: Omit<Proposal, "remindersEnabled">[] }>("care/medication-import", { body: form });
      setProposals(result.medications.map((item) => ({ ...item, remindersEnabled: false })));
      setMessage(`Found ${result.medications.length} possible medication record${result.medications.length === 1 ? "" : "s"}. Review each field before saving.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The PDF could not be read."); }
    finally { setBusy(false); }
  }

  function update(index: number, patch: Partial<Proposal>) {
    setProposals((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  async function saveApproved() {
    if (!proposals.length) return;
    if (proposals.some((item) => item.remindersEnabled && (!item.startDate || !item.reminderTimes.length || (item.frequency === "weekly" && !item.reminderDays.length)))) {
      setError("For every enabled reminder, add a start date, a valid time, and weekly days when needed.");
      return;
    }
    setSaving(true); setError(""); setMessage("");
    let saved = 0;
    try {
      for (const item of proposals) {
        const details = [
          item.strength ? `Extracted strength (reviewed): ${item.strength}` : "",
          item.instructions ? `Extracted instructions (reviewed): ${item.instructions}` : "",
          item.prescriber ? `Extracted prescriber (reviewed): ${item.prescriber}` : "",
          "Created from an uploaded medication document and reviewed by the patient or family member.",
        ].filter(Boolean).join("\n");
        await apiRequest("care/records", { json: {
          patientId: space.id, type: "medication", title: item.name, details, source: "medication_pdf",
          scheduledAt: item.startDate || null, amount: null, currency: "USD",
          recurrence: item.frequency, reminderTimes: item.reminderTimes, reminderDays: item.reminderDays,
          reminderOffsets: [], remindersEnabled: item.remindersEnabled,
        } });
        saved++;
      }
      setProposals([]); setFile(null);
      setMessage(`Saved ${saved} reviewed medication record${saved === 1 ? "" : "s"}. Hale reminders need a schedule and an enabled device.`);
    } catch (reason) {
      setError(reason instanceof Error ? `${saved} record${saved === 1 ? "" : "s"} saved; remaining records were not saved. ${reason.message}` : "Some records could not be saved.");
    } finally { setSaving(false); }
  }

  if (!canCreate) return <p className="small muted">Ask the patient-space administrator for medication read and record permissions to upload medication documents.</p>;
  if (mode === "demo") return <div className="info-strip"><FileUp size={17} /><p>PDF medication import is available in live mode. Demo files are not uploaded.</p></div>;

  return <section className="medication-pdf-import">
    <div className="care-records-heading"><div><p className="eyebrow">MEDICATION DOCUMENT</p><h3>Import from PDF</h3></div><span className="neutral-pill">Review before saving</span></div>
    <p className="small muted">PyMuPDF extracts text from the PDF. Image-only scans are rendered with PyMuPDF and read by the OpenRouter free vision model. The PDF is not stored; extracted text or rendered pages are sent to OpenRouter only after you opt in.</p>
    <form className="care-record-form" onSubmit={(event) => { event.preventDefault(); void extract(); }}>
      <label>Medication record PDF<input type="file" accept="application/pdf,.pdf" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <label className="check-label"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I agree to send information extracted from this PDF to the OpenRouter free model to prepare a draft. I will review it before adding records.</span></label>
      {error && <p role="alert" className="small error-text">{error}</p>}
      {message && <p role="status" className="small handoff-status"><Check size={15} />{message}</p>}
      <button className="btn btn-primary" disabled={!file || !consent || busy || saving}>{busy ? <LoaderCircle className="voice-spinner" size={16} /> : <FileUp size={16} />}{busy ? "Reading PDF…" : "Extract medication drafts"}</button>
    </form>
    {proposals.length > 0 && <div className="medication-import-proposals"><div className="care-records-heading"><div><p className="eyebrow">DRAFTS · NOT SAVED</p><h3>Review extracted fields</h3></div><button type="button" className="btn btn-primary" disabled={saving} onClick={() => void saveApproved()}>{saving ? "Saving…" : "Save reviewed records"}</button></div>
      {proposals.map((item, index) => <article className="medication-import-row" key={`${index}-${item.name}`}>
         <div className="care-records-heading"><strong>{item.name || "Unnamed medication"}</strong><button type="button" className="icon-button" aria-label={`Remove ${item.name} draft`} data-visible-label="Remove" disabled={saving} onClick={() => setProposals((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 aria-hidden size={24} /></button></div>
        <div className="medication-import-fields">
          <label>Name<input value={item.name} onChange={(event) => update(index, { name: event.target.value })} maxLength={120} /></label>
          <label>Strength as printed<input value={item.strength} onChange={(event) => update(index, { strength: event.target.value })} maxLength={120} /></label>
          <label>Recorded instructions<textarea value={item.instructions} onChange={(event) => update(index, { instructions: event.target.value })} maxLength={800} rows={2} /></label>
          <label>Schedule<select value={item.frequency} onChange={(event) => update(index, { frequency: event.target.value as Frequency, remindersEnabled: false })}><option value="none">Record only / not specified</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="as_needed">As needed</option></select></label>
          <label>Reminder times, 24-hour<input value={item.reminderTimes.join(", ")} onChange={(event) => update(index, { reminderTimes: event.target.value.split(",").map((time) => time.trim()).filter(Boolean) })} placeholder="08:00, 20:00" /></label>
          <label>Start date<input type="date" value={item.startDate} onChange={(event) => update(index, { startDate: event.target.value })} /></label>
        </div>
        {item.frequency === "weekly" && <div className="care-reminder-days"><span>Reminder days</span>{DAYS.map((day, dayIndex) => <label key={day}><input type="checkbox" checked={item.reminderDays.includes(dayIndex)} onChange={(event) => update(index, { reminderDays: event.target.checked ? [...item.reminderDays, dayIndex] : item.reminderDays.filter((value) => value !== dayIndex) })} />{day}</label>)}</div>}
        {(item.frequency === "daily" || item.frequency === "weekly") && <label className="check-label"><input type="checkbox" checked={item.remindersEnabled} onChange={(event) => update(index, { remindersEnabled: event.target.checked })} /><span>Enable Hale reminders for this schedule (requires device notification permission).</span></label>}
        <p className="small muted">AI extraction can be wrong. Compare against the original label or prescription and ask a pharmacist or clinician about medication questions.</p>
      </article>)}
    </div>}
  </section>;
}
