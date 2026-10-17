import { isLocalDate } from "@hale/contracts/time";

export type MedicationProposal = {
  name: string;
  strength: string;
  instructions: string;
  frequency: "none" | "daily" | "weekly" | "as_needed";
  reminderTimes: string[];
  reminderDays: number[];
  prescriber: string;
  startDate: string;
};

function bounded(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parseMedicationProposals(payload: unknown): MedicationProposal[] {
  let value = payload;
  if (typeof value === "string") {
    const text = value.trim();
    try { value = JSON.parse(text) as unknown; }
    catch {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start < 0 || end <= start) throw new Error("The free model did not return a structured medication list.");
      try { value = JSON.parse(text.slice(start, end + 1)) as unknown; }
      catch { throw new Error("The free model returned unreadable medication data."); }
    }
  }
  if (!value || typeof value !== "object" || !Array.isArray((value as { medications?: unknown }).medications)) {
    throw new Error("No structured medication list was found in the document.");
  }
  const rows = (value as { medications: unknown[] }).medications;
  const output = rows.slice(0, 20).flatMap((item): MedicationProposal[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = bounded(record.name, 120);
    if (!name) return [];
    const frequency = record.frequency === "daily" || record.frequency === "weekly" || record.frequency === "as_needed" ? record.frequency : "none";
    const reminderTimes = Array.isArray(record.reminderTimes)
      ? record.reminderTimes.filter((time): time is string => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)).slice(0, 6)
      : [];
    const reminderDays = Array.isArray(record.reminderDays)
      ? [...new Set(record.reminderDays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
      : [];
    const startDate = typeof record.startDate === "string" && isLocalDate(record.startDate) ? record.startDate : "";
    return [{
      name,
      strength: bounded(record.strength, 120),
      instructions: bounded(record.instructions, 800),
      frequency,
      reminderTimes,
      reminderDays,
      prescriber: bounded(record.prescriber, 160),
      startDate,
    }];
  });
  if (!output.length) throw new Error("No medication names could be extracted. No records were saved.");
  return output;
}
