export type ReminderSchedule = {
  id: string;
  type: "medication" | "appointment";
  title: string;
  scheduledAt: number | null;
  recurrence: string;
  reminderTimes: string[];
  reminderDays: number[];
  reminderOffsets: number[];
  remindersEnabled: boolean;
  timezone: string;
};

export type DueCareReminder = {
  key: string;
  scheduledFor: number;
  type: ReminderSchedule["type"];
  title: string;
};

function localParts(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const year = Number(value("year")), month = Number(value("month")), day = Number(value("day"));
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")), minute: Number(value("minute")),
    weekday: new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay(),
  };
}

export function localDateTimeToUtc(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const actual = localParts(guess, timezone);
    const actualAsUtc = Date.UTC(Number(actual.date.slice(0, 4)), Number(actual.date.slice(5, 7)) - 1,
      Number(actual.date.slice(8, 10)), actual.hour, actual.minute);
    guess += target - actualAsUtc;
  }
  return guess;
}

function shiftLocalDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function upcomingCareReminders(input: {
  records: ReminderSchedule[];
  now?: number;
  horizonMs?: number;
  graceMs?: number;
}): DueCareReminder[] {
  const now = input.now ?? Date.now();
  const horizon = now + (input.horizonMs ?? 60_000);
  const grace = input.graceMs ?? 60_000;
  const output: DueCareReminder[] = [];

  for (const record of input.records) {
    if (!record.remindersEnabled) continue;
    if (record.type === "appointment") {
      if (!record.scheduledAt) continue;
      for (const offset of record.reminderOffsets) {
        if (!Number.isFinite(offset) || offset <= 0) continue;
        const scheduledFor = record.scheduledAt - offset * 60_000;
        if (scheduledFor <= horizon && now - scheduledFor <= grace) {
          output.push({ key: `appointment:${record.scheduledAt}:${offset}`, scheduledFor, type: "appointment", title: record.title });
        }
      }
      continue;
    }

    if (!record.scheduledAt || !["daily", "weekly"].includes(record.recurrence)) continue;
    let currentLocal;
    try { currentLocal = localParts(now, record.timezone); }
    catch { continue; }
    const startDate = localParts(record.scheduledAt, record.timezone).date;
    for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
      const date = shiftLocalDate(currentLocal.date, dayOffset);
      if (date < startDate) continue;
      const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
      if (record.recurrence === "weekly" && !record.reminderDays.includes(weekday)) continue;
      for (const time of record.reminderTimes) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) continue;
        const scheduledFor = localDateTimeToUtc(date, time, record.timezone);
        if (scheduledFor <= horizon && now - scheduledFor <= grace) {
          output.push({ key: `medication:${date}:${time}`, scheduledFor, type: "medication", title: record.title });
        }
      }
    }
  }
  return output.sort((a, b) => a.scheduledFor - b.scheduledFor);
}
