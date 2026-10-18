"use client";

import { useState } from "react";
import { Check, Copy, Mail, Trash2, UserPlus } from "lucide-react";
import { apiPath, apiRequest, useApiQuery } from "@/lib/api-client";
import { PrivacyNote } from "./ui";
import { Button } from "./ui/button";

interface Invitation { id: string; email: string; expiresAt: number; createdAt: number }

export function FamilyInvitations({ patientId, enabled, demo = false }: { patientId: string; enabled: boolean; demo?: boolean }) {
  const [revision, setRevision] = useState(0);
  const path = apiPath("invitations", { patientId, refresh: String(revision) });
  const { data, error: loadError, isLoading } = useApiQuery<{ invitations: Invitation[] }>(path, enabled && !demo);
  const [email, setEmail] = useState("");
  const [acceptUrl, setAcceptUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (!enabled) return null;
  if (demo) return <section className="invitation-card" id="family-invitations"><div className="icon-label"><UserPlus size={21} /><h2>Invite family</h2></div></section>;

  async function createInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create"); setError(""); setNotice(""); setAcceptUrl("");
    try {
      const result = await apiRequest<{ acceptUrl: string; email: string }>("invitations", { json: { patientId, email } });
      setAcceptUrl(result.acceptUrl);
      setEmail("");
      setNotice(`Clerk accepted the invitation email for ${result.email}. If it doesn’t arrive, share the one-time link below.`);
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

  return <section className="invitation-card" id="family-invitations">
    <div className="icon-label"><UserPlus size={21} /><h2>Invite family</h2></div>
     <p>We’ll send a one-time invitation link. Access starts only after the invited person accepts using the same verified email. Family members can read shared memories and add medication records and reminders.</p>
    <form className="invitation-form" onSubmit={(event) => void createInvitation(event)}>
      <label htmlFor="family-invite-email">Email address</label>
      <div><input id="family-invite-email" type="email" autoComplete="email" value={email} maxLength={254} required onChange={(event) => setEmail(event.target.value)} placeholder="family@example.com" /><Button variant="primary" pending={busy === "create"}>{busy === "create" ? "Sending invite…" : <><Mail aria-hidden />Send invite</>}</Button></div>
    </form>
    {acceptUrl && <div className="invitation-link"><label htmlFor="family-invite-link">Share this one-time link if the email doesn’t arrive</label><div><input id="family-invite-link" readOnly value={acceptUrl} onFocus={(event) => event.currentTarget.select()} /><Button type="button" variant="secondary" onClick={() => void copyLink()}><Copy aria-hidden />Copy</Button></div></div>}
    {loadError && <p className="small muted" role="alert">Pending invitations could not be loaded.</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
    {notice && <p role="status" className="small invitation-status"><Check size={15} />{notice}</p>}
    {isLoading && !data ? <p className="small muted" role="status">Loading invitations…</p> : data?.invitations.length ? <div className="invitation-list">
       <p className="eyebrow">Pending invitations</p>
      {data.invitations.map((invitation) => <div className="invitation-row" key={invitation.id}><div><strong>{invitation.email}</strong><span>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span></div><Button variant="ghost" disabled={busy === invitation.id} onClick={() => void revoke(invitation.id)}><Trash2 aria-hidden />Revoke</Button></div>)}
    </div> : null}
     <PrivacyNote editorial>Invitations grant limited family access, never recording consent. Access remains limited to this patient space.</PrivacyNote>
  </section>;
}
