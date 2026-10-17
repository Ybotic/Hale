import "server-only";
import webPush from "web-push";
import { getDb } from "./db";
import { upcomingCareReminders, type ReminderSchedule } from "../care-reminder-policy";

function pushConfigured() {
  return Boolean(process.env.WEB_PUSH_VAPID_PUBLIC_KEY && process.env.WEB_PUSH_VAPID_PRIVATE_KEY && process.env.WEB_PUSH_VAPID_SUBJECT);
}

export async function dispatchDueCareReminders() {
  if (!pushConfigured()) return 0;
  webPush.setVapidDetails(process.env.WEB_PUSH_VAPID_SUBJECT!, process.env.WEB_PUSH_VAPID_PUBLIC_KEY!, process.env.WEB_PUSH_VAPID_PRIVATE_KEY!);
  const sql = getDb();
  const rows = await sql`SELECT id::text, patient_id::text, record_type, title, scheduled_at, recurrence,
      reminder_times, reminder_days, reminder_offsets, reminders_enabled, timezone
    FROM care_records WHERE reminders_enabled=TRUE AND record_type IN ('medication','appointment')
    ORDER BY scheduled_at ASC NULLS LAST LIMIT 500`;
  let sent = 0;
  for (const row of rows) {
    const schedule: ReminderSchedule = {
      id: String(row.id), type: String(row.record_type) as ReminderSchedule["type"], title: String(row.title),
      scheduledAt: row.scheduled_at === null ? null : Number(row.scheduled_at), recurrence: String(row.recurrence),
      reminderTimes: ((row.reminder_times ?? []) as string[]).map(String),
      reminderDays: ((row.reminder_days ?? []) as number[]).map(Number),
      reminderOffsets: ((row.reminder_offsets ?? []) as number[]).map(Number),
      remindersEnabled: Boolean(row.reminders_enabled), timezone: String(row.timezone),
    };
    const due = upcomingCareReminders({ records: [schedule], now: Date.now(), horizonMs: 45_000, graceMs: 15 * 60_000 });
    if (!due.length) continue;
    const capability = schedule.type === "medication" ? "medications:read" : "appointments:book";
    const subscriptions = await sql`SELECT s.id::text, s.endpoint, s.p256dh, s.auth, m.role
      FROM web_push_subscriptions s JOIN memberships m ON m.patient_id=s.patient_id AND m.subject=s.subject AND m.active=TRUE
      WHERE s.patient_id=${String(row.patient_id)}::uuid AND ${capability}=ANY(m.capabilities)`;
    for (const reminder of due) {
      for (const subscription of subscriptions) {
        const now = Date.now();
        const delivery = await sql`INSERT INTO care_reminder_deliveries (id, record_id, subscription_id, reminder_key, scheduled_for, state, attempts, created_at)
          VALUES (${crypto.randomUUID()}::uuid, ${String(row.id)}::uuid, ${String(subscription.id)}::uuid, ${reminder.key}, ${reminder.scheduledFor}, 'pending', 0, ${now})
          ON CONFLICT (record_id, subscription_id, reminder_key) DO UPDATE SET state='pending',created_at=EXCLUDED.created_at
          WHERE (care_reminder_deliveries.state='failed' AND care_reminder_deliveries.attempts<3)
            OR (care_reminder_deliveries.state='pending' AND care_reminder_deliveries.created_at<${now - 120_000})
          RETURNING id::text`;
        if (!delivery.length) continue;
        const role = String(subscription.role);
        const section = schedule.type === "medication" ? "medications" : "appointments";
        const body = schedule.type === "medication"
          ? "A medication reminder is due. Open Hale to review your saved record."
          : "An appointment is coming up. Open Hale to review the saved details.";
        try {
          await webPush.sendNotification({
            endpoint: String(subscription.endpoint),
            keys: { p256dh: String(subscription.p256dh), auth: String(subscription.auth) },
          }, JSON.stringify({ title: "Hale reminder", body, url: `/${role === "patient" ? "patient" : "family"}/care#${section}` }), { TTL: 3600 });
          await sql`UPDATE care_reminder_deliveries SET state='sent',sent_at=${Date.now()} WHERE id=${String(delivery[0].id)}::uuid`;
          sent++;
        } catch (error) {
          const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 0;
          await sql`UPDATE care_reminder_deliveries SET state='failed',attempts=attempts+1 WHERE id=${String(delivery[0].id)}::uuid`;
          if (status === 404 || status === 410) await sql`DELETE FROM web_push_subscriptions WHERE id=${String(subscription.id)}::uuid`;
          console.error("Hale push reminder delivery failed", { reminderId: String(row.id), status: status || "unavailable" });
        }
      }
    }
  }
  return sent;
}
