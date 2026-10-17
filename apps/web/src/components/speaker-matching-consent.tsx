"use client";

import Link from "next/link";
import { useState } from "react";
import { AudioLines, ShieldCheck } from "lucide-react";
import { apiPath, apiRequest, useApiQuery } from "@/lib/api-client";
import { PrivacyNote } from "./ui";
import { Checkbox } from "./ui/checkbox";
import { Button } from "./ui/button";

interface FamilyVoiceProfile {
  personId: string;
  name: string;
  relationship: string;
  isSelf: boolean;
  voiceState: string | null;
  enrolled: boolean;
  matchingEnabled: boolean;
}

interface VoiceManagementStatus {
  configured: boolean;
  workerOnline: boolean;
  identificationAvailable: boolean;
  transcriptionOnly: boolean;
  localGpu: boolean;
  consentedProfileCount: number;
  profiles: FamilyVoiceProfile[];
  person: { id: string; name: string } | null;
  enrolled: boolean;
  enabled: boolean;
}

function profileStatus(profile: FamilyVoiceProfile) {
  if (profile.enrolled) return "Enrolled";
  if (profile.voiceState === "queued" || profile.voiceState === "processing") return "Processing";
  if (profile.voiceState === "failed") return "Needs a new sample";
  if (profile.voiceState === "revoked") return "Deleted";
  return "Not enrolled";
}

function recognitionStatus(data: VoiceManagementStatus) {
  if (!data.workerOnline) return "The audio worker is offline. Recordings will not be identified until the worker is running.";
  if (data.transcriptionOnly) return "The worker is in transcript-only mode. Turn that mode off to identify speakers.";
  if (!data.identificationAvailable) return "The worker is online, but pyannote speaker identification is not configured with a public audio origin.";
  if (!data.consentedProfileCount) return "The worker is ready, but no enrolled profiles have matching consent in this patient space.";
  return `Ready to match ${data.consentedProfileCount} consented voice ${data.consentedProfileCount === 1 ? "profile" : "profiles"} in recordings processed for this space.`;
}

export function SpeakerMatchingConsent({ patientId, demo = false, editorial = false }: { patientId: string; demo?: boolean; editorial?: boolean }) {
  const [revision, setRevision] = useState(0);
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const path = apiPath("voice-matching", { patientId, revision: String(revision) });
  const { data, error: loadError, isLoading } = useApiQuery<VoiceManagementStatus>(path, !demo);

  if (demo) return <section className="settings-card voice-profile-settings">
    <div className="icon-label"><AudioLines size={21} /><h2>Family voice profiles</h2></div>
    <p>Demo voices are fictional. Live voice profiles and matching are unavailable in the demo.</p>
  </section>;

  async function updateConsent(enabled: boolean) {
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest("voice-matching", { json: { patientId, enabled } });
      setOptIn(false);
      setNotice(enabled ? "Matching consent enabled for this patient space." : "Matching consent withdrawn for this patient space.");
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Voice matching consent could not be updated.");
    } finally { setBusy(false); }
  }

  return <section className="settings-card voice-profile-settings">
    <div className="icon-label"><AudioLines size={21} /><h2>Family voice profiles</h2></div>
    <p>Each person’s account profile is automatically connected to their person card when they join this space. Enrollment is account-wide; matching consent is managed separately for each patient space.</p>
    {loadError && <p role="alert" className="error-text">Voice profile status is unavailable.</p>}
    {isLoading && !data ? <p className="small muted" role="status">Checking family voice profiles…</p> : data && <>
      <div className={`voice-readiness ${data.workerOnline && data.identificationAvailable && !data.transcriptionOnly && data.consentedProfileCount > 0 ? "is-ready" : ""}`} role="status">
        <strong>{data.workerOnline && data.identificationAvailable && !data.transcriptionOnly ? "Recording recognition" : "Recognition status"}</strong>
        <span>{recognitionStatus(data)}</span>
        <span>Only recordings processed after consent are matched. Completed recordings aren’t automatically reprocessed.</span>
      </div>
      <div className="voice-profile-list" aria-label="People and voice profile status">
        {data.profiles.length ? data.profiles.map((profile) => <div className="voice-profile-row" key={profile.personId}>
          <div className="voice-profile-person"><strong>{profile.name}{profile.isSelf ? " · You" : ""}</strong><span>{profile.relationship}</span></div>
          <div className="voice-profile-state"><span>Profile: {profileStatus(profile)}</span><span>Matching: {profile.matchingEnabled && profile.enrolled ? "On in this space" : "Off in this space"}</span></div>
          {profile.isSelf && <Link className="text-link" href="/signup/voice">Manage profile<AudioLines size={14} /></Link>}
        </div>) : <p className="small muted">No people are linked to this patient space yet. Accept a family invitation to connect an account and its voice profile.</p>}
      </div>
      {!data.person && <p className="small muted">Your account is not linked to a person in this patient space. Accept a family invitation first.</p>}
      {data.person && !data.enrolled && <p className="small muted">Create your voice profile before enabling matching. An enrolled voiceprint is never used without your separate consent for this space.</p>}
      {data.person && data.enrolled && !data.enabled && <>
         <label className="check-label voice-consent"><Checkbox checked={optIn} disabled={busy} onCheckedChange={(value) => setOptIn(value === true)} /><span>I consent to matching my enrolled voice in recordings processed for this patient space. I can withdraw consent here at any time.</span></label>
        <Button variant="primary" pending={busy} disabled={!optIn} onClick={() => void updateConsent(true)}>{busy ? "Saving consent…" : <><ShieldCheck aria-hidden />Enable matching in this space</>}</Button>
      </>}
      {data.person && data.enrolled && data.enabled && <div className="voice-profile-actions">
        <p className="small handoff-status"><ShieldCheck size={15} />Your voice matching consent is active in this space.</p>
        <Button variant="secondary" pending={busy} onClick={() => void updateConsent(false)}>{busy ? "Withdrawing…" : "Withdraw matching consent"}</Button>
      </div>}
      <Link className="text-link voice-profile-manage" href="/signup/voice">Manage or delete your account voice profile<AudioLines size={14} /></Link>
    </>}
    {notice && <p className="small handoff-status" role="status"><ShieldCheck size={15} />{notice}</p>}
    {error && <p role="alert" className="error-text">{error}</p>}
    <PrivacyNote editorial={editorial}>Voiceprints are never used for authentication. A patient-space owner can view status, but only each person can opt in or withdraw their own voice matching.</PrivacyNote>
  </section>;
}
