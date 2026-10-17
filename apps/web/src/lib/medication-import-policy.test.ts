import { describe, expect, test } from "bun:test";
import { parseMedicationProposals } from "./medication-import-policy";

describe("medication PDF extraction review policy", () => {
  test("accepts explicit fields and drops malformed reminders or missing names", () => {
    expect(parseMedicationProposals({ medications: [
      { name: "Example medicine", strength: "10 mg", instructions: "Take with food", frequency: "daily", reminderTimes: ["08:00", "not-a-time"], reminderDays: [1, 7], startDate: "2026-10-20" },
      { name: "", instructions: "No source name" },
    ] })).toEqual([{
      name: "Example medicine", strength: "10 mg", instructions: "Take with food", frequency: "daily",
      reminderTimes: ["08:00"], reminderDays: [1], prescriber: "", startDate: "2026-10-20",
    }]);
  });

  test("does not invent a record when structured extraction is unusable", () => {
    expect(() => parseMedicationProposals({ medications: [] })).toThrow("No medication names could be extracted");
    expect(() => parseMedicationProposals("not json")).toThrow("did not return a structured medication list");
  });
});
