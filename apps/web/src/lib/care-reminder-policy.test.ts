import { describe, expect, test } from "bun:test";
import { upcomingCareReminders } from "./care-reminder-policy";

describe("care reminder scheduling", () => {
  test("computes a medication reminder in the patient's local timezone", () => {
    const now = Date.parse("2026-10-20T11:58:00Z");
    const reminders = upcomingCareReminders({
      now,
      horizonMs: 5 * 60_000,
      records: [{
        id: "med-1", type: "medication", title: "Daily medication", scheduledAt: Date.parse("2026-10-01T12:00:00Z"),
        recurrence: "daily", reminderTimes: ["08:00"], reminderDays: [0, 1, 2, 3, 4, 5, 6],
        reminderOffsets: [], remindersEnabled: true, timezone: "America/New_York",
      }],
    });
    expect(reminders).toEqual([{ key: "medication:2026-10-20:08:00", scheduledFor: Date.parse("2026-10-20T12:00:00Z"), type: "medication", title: "Daily medication" }]);
  });

  test("schedules appointment offsets once and skips disabled or as-needed medication records", () => {
    const scheduledAt = Date.parse("2026-10-20T15:00:00Z");
    const now = scheduledAt - 60 * 60_000;
    const reminders = upcomingCareReminders({
      now,
      records: [
        { id: "appointment-1", type: "appointment", title: "Clinic", scheduledAt, recurrence: "none", reminderTimes: [], reminderDays: [], reminderOffsets: [1440, 60], remindersEnabled: true, timezone: "UTC" },
        { id: "as-needed", type: "medication", title: "As needed", scheduledAt, recurrence: "as_needed", reminderTimes: ["14:00"], reminderDays: [], reminderOffsets: [], remindersEnabled: true, timezone: "UTC" },
        { id: "disabled", type: "appointment", title: "Disabled", scheduledAt, recurrence: "none", reminderTimes: [], reminderDays: [], reminderOffsets: [60], remindersEnabled: false, timezone: "UTC" },
      ],
    });
    expect(reminders).toEqual([{ key: `appointment:${scheduledAt}:60`, scheduledFor: now, type: "appointment", title: "Clinic" }]);
  });
});
