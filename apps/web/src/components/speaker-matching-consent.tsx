"use client";

import Link from "next/link";
import { useState } from "react";
import { AudioLines, LoaderCircle, ShieldCheck } from "lucide-react";
import { apiPath, apiRequest, useApiQuery } from "@/lib/api-client";
import { PrivacyNote } from "./ui";

interface VoiceMatchingStatus {
  configured: boolean;
  enrolled: boolean;
  enabled: boolean;
  person: { id: string; name: string } | null;
}

export function SpeakerMatchingConsent({ patientId, demo = false }: { patientId: string; demo?: boolean }) {
  const [revision, setRevision] = useState(0);
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const path = apiPath("voice-matching", { patientId, revision: String(revision) });
  const { data, error: loadError, isLoading } = useApiQuery<VoiceMatchingStatus>(path, !demo);

  if (demo) return <section className="invitation-card">
    <div className="icon-label"><AudioLines size={20} /><h2>Speaker identification</h2></div>
    <p>Demo voices are fictional. Voice matching is disabled in the preview.</p>
  </section>;

  async function updateConsent(enabled: boolean) {
    setBusy(true); setError("");
    try {
      await apiRequest("voice-matching", { json: { patientId, enabled } });
      setOptIn(false);
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Voice matching consent could not be updated.");
    } finally { setBusy(false); }
  }

  return <section className="invitation-card">
    <div className="icon-label"><AudioLines size={20} /><h2>Speaker identification</h2></div>
    <p>Voice enrollment and patient-space matching are separate choices. A match uses an enrolled voiceprint to label that person’s turns; uncertain speakers stay unnamed.</p>
    {loadError && <p role="alert" className="error-text">Voice matching status is unavailable.</p>}
    {isLoading && !data ? <p className="small muted" role="status">Checking your voice profile…</p> : data && <>
      {!data.person && <p className="small muted">This account is not linked to a person in this patient space. Accept a family invitation first.</p>}
      {data.person && !data.enrolled && <p className="small muted">Enroll a voice profile before opting in to matching. Voice profiles are not used unless you enable them here.</p>}
      {data.person && !data.enrolled && <Link className="text-link" href="/signup/voice">Manage voice enrollment<AudioLines size={15} /></Link>}
      {data.person && data.enrolled && !data.enabled && <>
        <label className="check-label voice-consent"><input type="checkbox" checked={optIn} disabled={busy || !data.configured} onChange={(event) => setOptIn(event.target.checked)} /><span>I consent to pyannote.ai matching my enrolled voiceprint in recordings for this patient space. I can withdraw this consent later.</span></label>
        {!data.configured && <p className="small muted">Speaker identification is not configured on this server.</p>}
        <button className="btn btn-primary" disabled={busy || !optIn || !data.configured} onClick={() => void updateConsent(true)}>{busy ? <LoaderCircle className="voice-spinner" size={16} /> : <ShieldCheck size={16} />}Enable matching in this space</button>
      </>}
      {data.person && data.enrolled && data.enabled && <>
        <p className="small handoff-status"><ShieldCheck size={15} />Voice matching is enabled for {data.person.name} in this patient space.</p>
        <button className="btn btn-quiet" disabled={busy} onClick={() => void updateConsent(false)}>{busy ? <LoaderCircle className="voice-spinner" size={16} /> : null}Withdraw matching consent</button>
      </>}
    </>}
    {error && <p role="alert" className="error-text">{error}</p>}
    <PrivacyNote>Voiceprints are never used for authentication and do not grant access to recordings.</PrivacyNote>
  </section>;
}
