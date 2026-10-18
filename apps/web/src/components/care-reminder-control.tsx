"use client";

import { useState } from "react";
import { Bell, Check } from "lucide-react";
import { apiPath, apiRequest, useApiQuery } from "@/lib/api-client";
import { useWorkspace } from "./providers";
import { Button } from "./ui/button";

type ReminderConfig = { configured: boolean; publicKey: string | null; subscribed: boolean };

function applicationServerKey(value: string) {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  const decoded = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export function CareReminderControl({ patient = false }: { patient?: boolean }) {
  const { mode, space } = useWorkspace();
  const [revision, setRevision] = useState(0);
  const path = apiPath("care/reminders/config", { patientId: space.id, refresh: String(revision) });
  const { data, error } = useApiQuery<ReminderConfig>(path, mode === "live" && patient, 30_000);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");

  if (!patient) return null;
  if (mode === "demo") return <div className="info-strip"><Bell size={17} /><p>Demo reminders are examples only. Enable real notifications in live mode.</p></div>;

  async function enable() {
    setBusy(true); setProblem(""); setMessage("");
    try {
      if (!data?.configured || !data.publicKey) throw new Error("PWA push is not configured on the server. Add the VAPID public and private keys.");
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser does not support PWA push notifications. On iPhone, install Hale to the Home Screen and use iOS 16.4 or later.");
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications in browser settings to receive reminders.");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(data.publicKey) });
      await apiRequest("care/reminders/subscription", { json: { patientId: space.id, subscription: subscription.toJSON() } });
      setRevision((current) => current + 1);
      setMessage("Reminders are enabled on this device.");
    } catch (reason) { setProblem(reason instanceof Error ? reason.message : "Notifications could not be enabled."); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setProblem(""); setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await apiRequest("care/reminders/subscription", { method: "DELETE", json: { patientId: space.id, endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setRevision((current) => current + 1);
      setMessage("Reminders are disabled on this device.");
    } catch (reason) { setProblem(reason instanceof Error ? reason.message : "This device could not be unsubscribed."); }
    finally { setBusy(false); }
  }

  return <section className="care-reminder-control">
    <div><span className="feature-icon"><Bell size={18} /></span><div><strong>Medication and appointment reminders</strong><p>Notifications are sent to this device for saved schedules you can access.</p></div></div>
    {data?.configured ? <Button type="button" variant={data.subscribed ? "secondary" : "primary"} pending={busy} onClick={() => void (data.subscribed ? disable() : enable())}>{busy ? "Updating…" : data.subscribed ? <><Check aria-hidden />Reminders enabled · turn off</> : <><Bell aria-hidden />Enable PWA reminders</>}</Button>
      : <span className="small muted">Configure the WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, and WEB_PUSH_VAPID_SUBJECT server settings to enable alerts.</span>}
    {error && <p className="small error-text" role="alert">Reminder settings could not be loaded.</p>}
    {problem && <p className="small error-text" role="alert">{problem}</p>}
    {message && <p className="small handoff-status" role="status">{message}</p>}
  </section>;
}
