"use client";

import { useState } from "react";
import { Check, Copy, LoaderCircle, Mail, Trash2, UserPlus } from "lucide-react";
import { apiPath, apiRequest, useApiQuery } from "@/lib/api-client";
import { PrivacyNote } from "./ui";

interface Invitation { id: string; email: string; expiresAt: number; createdAt: number }

export function FamilyInvitations({ patientId, enabled, demo = false }: { patientId: string; enabled: boolean; demo?: boolean }) {
  const [revision, setRevision] = useState(0);
  const path = apiPath("invitations", { patientId, refresh: String(revision) });
  const { data, error: loadError, isLoading } = useApiQuery<{ invitations: Invitation[] }>(path, enabled && !demo);
  const [email, setEmail] = useState("");
  const [allowMedicationRecords, setAllowMedicationRecords] = useState(true);
  const [acceptUrl, setAcceptUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (!enabled) return null;
  if (demo) return <section className="invitation-card"><div className="icon-label"><UserPlus size={21} /><h2>Invite family</h2></div><p>Family invitations are available in live mode. Demo access stays fictional and local to this preview.</p></section>;

  async function createInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create"); setError(""); setNotice(""); setAcceptUrl("");
    try {
      const result = await apiRequest<{ acceptUrl: string }>("invitations", { json: { patientId, email, medicationRecords: allowMedicationRecords } });
      setAcceptUrl(result.acceptUrl);
      setEmail("");
      setNotice("Invitation sent. The link expires in seven days.");
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The invitation could not be sent.");
    } finally { setBusy(""); }
  }

  async function revoke(invitationId: string) {
    if (!window.confirm("Revoke this family invitation? Its link will no longer grant access.")) return;
    setBusy(invitationId); setError(""); setNotice("");
    try {
      await apiRequest(apiPath(`invitations/${invitationId}`, { patientId }), { method: "DELETE" });
      setNotice("Invitation revoked.");
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The invitation could not be revoked.");
    } finally { setBusy(""); }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(acceptUrl); setNotice("Invitation link copied."); }
    catch { setNotice("Copy isn’t available here. Select and copy the invitation link below."); }
  }

  return <section className="invitation-card">
    <div className="icon-label"><UserPlus size={21} /><h2>Invite family</h2></div>
     <p>Clerk sends the invite. Access is granted only after the invitee accepts using the invited, verified email. You can allow this family member to add medication records; send a fresh invite to update an existing family member’s permissions.</p>
    <form className="invitation-form" onSubmit={(event) => void createInvitation(event)}>
      <label htmlFor="family-invite-email">Email address</label>
      <div><input id="family-invite-email" type="email" autoComplete="email" value={email} maxLength={254} required onChange={(event) => setEmail(event.target.value)} placeholder="family@example.com" /><button className="btn btn-primary" disabled={busy === "create"}>{busy === "create" ? <LoaderCircle className="voice-spinner" size={16} /> : <Mail size={16} />}Send invite</button></div>
      <label className="check-label"><input type="checkbox" checked={allowMedicationRecords} onChange={(event) => setAllowMedicationRecords(event.target.checked)} /><span>Allow this person to add medication records and reminders in this patient space.</span></label>
    </form>
    {acceptUrl && <div className="invitation-link"><label htmlFor="family-invite-link">One-time acceptance link</label><div><input id="family-invite-link" readOnly value={acceptUrl} onFocus={(event) => event.currentTarget.select()} /><button type="button" className="btn btn-quiet" onClick={() => void copyLink()}><Copy size={15} />Copy</button></div></div>}
    {loadError && <p className="small muted" role="alert">Pending invitations could not be loaded.</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
    {notice && <p role="status" className="small invitation-status"><Check size={15} />{notice}</p>}
    {isLoading && !data ? <p className="small muted" role="status">Loading invitations…</p> : data?.invitations.length ? <div className="invitation-list">
      <p className="eyebrow">PENDING INVITATIONS</p>
      {data.invitations.map((invitation) => <div className="invitation-row" key={invitation.id}><div><strong>{invitation.email}</strong><span>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span></div><button className="text-link" disabled={busy === invitation.id} onClick={() => void revoke(invitation.id)}><Trash2 size={15} />Revoke</button></div>)}
    </div> : null}
    <PrivacyNote>Invites grant limited family access, never recording consent. TigerData membership checks remain in force after acceptance.</PrivacyNote>
  </section>;
}
