"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";

export function EmergencyAlertBanner() {
  const { seniorId: rawSeniorId } = useParams<{ seniorId: string }>();
  const seniorId = rawSeniorId as Id<"users">;
  const alerts = useQuery(api.alerts.listUnacknowledgedForSenior, { seniorId });
  const acknowledge = useMutation(api.alerts.acknowledge);
  const [savingId, setSavingId] = useState<Id<"alerts"> | null>(null);
  const [error, setError] = useState("");

  async function acknowledgeAlert(alertId: Id<"alerts">) {
    setSavingId(alertId);
    setError("");
    try {
      await acknowledge({ alertId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not acknowledge this alert.");
    } finally {
      setSavingId(null);
    }
  }

  if (!alerts?.length) return error ? <p role="alert" className="mx-auto my-4 max-w-6xl px-5 text-sm text-red-800">{error}</p> : null;

  return <section aria-label="Unacknowledged emergency alerts" className="mx-auto my-5 max-w-6xl space-y-3 px-5">
    {alerts.map((alert) => <article key={alert._id} role="alert" className="rounded-xl border-2 border-red-700 bg-red-50 p-5 text-red-950 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Emergency phrase detected</h2>
          <p className="mt-1">Matched: {alert.matchedPhrases.join(", ")}</p>
          <p className="mt-2 text-sm">{alert.excerpt}</p>
          <p className="mt-2 text-xs">{new Date(alert.createdAt).toLocaleString()}</p>
        </div>
        <button
          type="button"
          disabled={savingId === alert._id}
          onClick={() => void acknowledgeAlert(alert._id)}
          className="rounded-lg border border-red-800 px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {savingId === alert._id ? "Acknowledging…" : "Acknowledge alert"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm font-medium">{error}</p> : null}
    </article>)}
  </section>;
}
