"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowRight, Banknote, Check, FlaskConical, Link2, LoaderCircle, Receipt, Share2, ShieldCheck, Unlink } from "lucide-react";
import { apiPath, apiRequest, useApiQuery } from "@/lib/api-client";
import { useWorkspace } from "./providers";
import { EmptyState, PrivacyNote } from "./ui";

type NessieCost = {
  id: string;
  type: "bill" | "purchase" | "transfer";
  label: string;
  merchant: string;
  amount: number;
  currency: string;
  date: string;
  status: string;
  merchantId?: string;
};
type NessieShare = { id: string; resourceType: "bill" | "purchase"; resourceId: string; amount: number; label: string; canUnshare: boolean };
type SandboxAccount = { id: string; nickname: string; type: string };
type FamilyLedger = {
  configured: boolean;
  connected: boolean;
  connection?: { id: string; accountId: string; nickname: string; type: string };
  account?: { balance: number; type: string };
  availableAccounts?: SandboxAccount[];
  bills?: NessieCost[];
  purchases?: NessieCost[];
  transfers?: NessieCost[];
  recipients?: Array<{ accountId: string; nickname: string }>;
  shares?: NessieShare[];
  transferEvents?: Array<{ shareId: string; status: string; amount: number }>;
};
type SharedLedger = { configured: boolean; items: NessieCost[] };
type TransferResult = { status: "succeeded" | "failed" | "needs_review" | "pending"; message?: string; providerTransferId?: string | null };

const DEMO_COSTS: NessieCost[] = [
  { id: "demo-bill-clinic", type: "bill", label: "Community clinic copay", merchant: "Fictional Community Clinic", amount: 35, currency: "USD", date: "2026-10-20", status: "upcoming" },
  { id: "demo-purchase-pharmacy", type: "purchase", label: "Pharmacy purchase", merchant: "Fictional Neighborhood Pharmacy", amount: 18.5, currency: "USD", date: "2026-10-14", status: "posted" },
];

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

function CostRow({ item, action }: { item: NessieCost; action?: React.ReactNode }) {
  return <article className="nessie-cost-row">
    <span className="feature-icon"><Receipt size={19} /></span>
    <div className="nessie-cost-description"><strong>{item.label}</strong><span>{item.merchant} · {item.date} · {item.status}</span></div>
    <strong className="nessie-cost-amount">{money(item.amount, item.currency)}</strong>
    {action && <div className="nessie-cost-action">{action}</div>}
  </article>;
}

export function NessieCareCosts({ patient = false }: { patient?: boolean }) {
  const { mode, space } = useWorkspace();
  const patientId = space.id;
  const patientPath = apiPath("nessie/shared-costs", { patientId });
  const patientQuery = useApiQuery<SharedLedger>(patientPath, mode === "live" && patient);
  if (mode === "demo") return <NessieDemoCosts />;
  if (patient) {
    if (patientQuery.error) return <EmptyState title="Shared care costs are unavailable." description="Check your connection and try again." />;
    if (!patientQuery.data) return <p className="results-label muted" role="status">Loading shared costs…</p>;
    return <PatientSharedCosts data={patientQuery.data} />;
  }
  return <FamilyNessieCosts patientId={patientId} />;
}

function NessieDemoCosts() {
  return <section className="nessie-panel">
    <div className="care-section-heading"><span className="feature-icon"><Banknote size={22} /></span><div><h2>Care costs, together.</h2><p>Upcoming bills and selected care spending.</p></div><span className="neutral-pill">Demo fixture</span></div>
    <div className="info-strip"><ShieldCheck size={17} /><p>These are fictional examples, not live bank records. Configure the Nessie sandbox in live mode to load its accounts, bills, and merchants.</p></div>
    <div className="nessie-cost-list">{DEMO_COSTS.map((item) => <CostRow item={item} key={item.id} />)}</div>
    <PrivacyNote>A pharmacy purchase does not establish that medication was taken. No demo action moves money.</PrivacyNote>
  </section>;
}

function PatientSharedCosts({ data }: { data: SharedLedger }) {
  return <section className="nessie-panel">
    <div className="care-section-heading"><span className="feature-icon"><Banknote size={22} /></span><div><h2>Shared care costs.</h2><p>Only expenses a member chose to share with this patient space.</p></div><span className="neutral-pill">Nessie sandbox</span></div>
    {!data.configured && <div className="info-strip"><ShieldCheck size={17} /><p>The Nessie sandbox is not configured yet. Shared costs will appear here when a member connects an account and chooses to share an item.</p></div>}
    {data.items.length ? <div className="nessie-cost-list">{data.items.map((item) => <CostRow key={`${item.type}-${item.id}`} item={item} />)}</div>
      : <EmptyState title="No care costs have been shared." description="A family member can choose specific Nessie sandbox bills or purchases to share here." />}
    <PrivacyNote>This view never exposes a member’s account balance or unshared transactions. A payment is not evidence that care occurred.</PrivacyNote>
  </section>;
}

function FamilyCareCosts({ data, patientId, onRefresh }: { data: FamilyLedger; patientId: string; onRefresh: () => void }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedShare, setSelectedShare] = useState<NessieShare | null>(null);
  const [recipientAccountId, setRecipientAccountId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [requestId, setRequestId] = useState("");
  const [transferResult, setTransferResult] = useState<TransferResult | null>(null);
  const transferDialog = useRef<HTMLDialogElement>(null);
  const sharedItems = useMemo(() => new Map((data.shares ?? []).map((share) => [`${share.resourceType}:${share.resourceId}`, share])), [data.shares]);

  async function run(action: string, callback: () => Promise<void>) {
    setBusy(action); setError(""); setMessage("");
    try { await callback(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The Nessie action could not be completed."); }
    finally { setBusy(""); }
  }

  async function connect(account: SandboxAccount) {
    await run(`connect:${account.id}`, async () => {
      await apiRequest("nessie/connection", { json: { patientId, accountId: account.id } });
      setMessage(`${account.nickname} linked to this patient space.`);
      onRefresh();
    });
  }

  async function seedTestAccounts() {
    await run("seed", async () => {
      const result = await apiRequest<{ createdCount: number }>("nessie/seed", { json: { patientId } });
      setMessage(result.createdCount ? "Created fictional Nessie sandbox customers and accounts." : "The fictional Nessie test accounts already exist.");
      onRefresh();
    });
  }

  async function unlink() {
    if (!window.confirm("Unlink this Nessie sandbox account from the patient space? Shared cost records will remain visible.")) return;
    await run("unlink", async () => {
      await apiRequest(apiPath("nessie/connection", { patientId }), { method: "DELETE" });
      onRefresh();
    });
  }

  async function shareCost(item: NessieCost) {
    await run(`share:${item.id}`, async () => {
      await apiRequest("nessie/shares", { json: { patientId, resourceType: item.type, resourceId: item.id } });
      setMessage(`${item.label} is now shared with this patient space.`);
      onRefresh();
    });
  }

  async function unshare(shareId: string) {
    if (!window.confirm("Stop sharing this care cost with the patient space?")) return;
    await run(`unshare:${shareId}`, async () => {
      await apiRequest(apiPath(`nessie/shares/${shareId}`, { patientId }), { method: "DELETE" });
      onRefresh();
    });
  }

  function openTransfer(share: NessieShare) {
    setSelectedShare(share);
    setRecipientAccountId(data.recipients?.[0]?.accountId ?? "");
    setTransferAmount(share.amount.toFixed(2));
    setRequestId(crypto.randomUUID());
    setTransferResult(null);
    transferDialog.current?.showModal();
  }

  async function sendTransfer() {
    if (!selectedShare || !recipientAccountId || !requestId) return;
    await run("transfer", async () => {
      const result = await apiRequest<TransferResult>("nessie/transfers", {
        json: { patientId, shareId: selectedShare.id, recipientAccountId, amount: Number(transferAmount), confirm: true, requestId },
      });
      setTransferResult(result);
      if (result.status === "succeeded") {
        setMessage("Sandbox transfer recorded. No real money moved.");
        onRefresh();
      } else if (result.status === "needs_review") {
        setError(result.message ?? "Nessie could not confirm the result. Check sandbox activity before trying again.");
      } else if (result.status === "failed") {
        setError(result.message ?? "The sandbox transfer was not accepted.");
        setRequestId(crypto.randomUUID());
      }
    });
  }

  const allCosts = [...(data.bills ?? []), ...(data.purchases ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const transferByShare = new Map((data.transferEvents ?? []).map((transfer) => [transfer.shareId, transfer]));
  return <section className="nessie-panel">
    <div className="care-section-heading"><span className="feature-icon"><Banknote size={22} /></span><div><h2>Care costs, together.</h2><p>Bills and purchases from your selected sandbox account.</p></div><span className="neutral-pill">Nessie sandbox · no real funds</span></div>
    {error && <p role="alert" className="error-text">{error}</p>}{message && <p role="status" className="small handoff-status"><Check size={16} />{message}</p>}
    {!data.configured && <div className="info-strip"><ShieldCheck size={17} /><p>Nessie is not configured. Add <code>NESSIE_API_KEY</code> to the server environment to connect the sandbox.</p></div>}
    {data.configured && !data.connected && <>
      <div className="info-strip"><ShieldCheck size={17} /><p>Select a fictional Nessie account to link to this patient space. Linking only displays sandbox data; it does not grant access to a real bank account.</p></div>
      {data.availableAccounts?.length ? <div className="nessie-account-list">{data.availableAccounts.map((account) => <article className="nessie-account-option" key={account.id}><div><strong>{account.nickname}</strong><span>{account.type} · sandbox account</span></div><button className="btn btn-quiet" disabled={busy.length > 0} onClick={() => void connect(account)}>{busy === `connect:${account.id}` ? <LoaderCircle className="voice-spinner" size={16} /> : <Link2 size={16} />}Link account</button></article>)}</div>
        : <EmptyState title="No sandbox accounts are available." description="Seed fictional test customers and accounts here. This sends test data only to the Nessie sandbox."><button className="btn btn-primary" disabled={busy.length > 0} onClick={() => void seedTestAccounts()}>{busy === "seed" ? <LoaderCircle className="voice-spinner" size={16} /> : <FlaskConical size={16} />}Create fictional Nessie test accounts</button></EmptyState>}
      </>}
    {data.connected && data.connection && data.account && <>
      <div className="nessie-balance-card"><div><span className="eyebrow">LINKED SANDBOX ACCOUNT</span><strong>{data.connection.nickname}</strong><span>{data.account.type}</span></div><div className="nessie-balance"><span className="eyebrow">MOCK BALANCE</span><strong>{money(data.account.balance, "USD")}</strong></div><button className="btn btn-quiet" onClick={() => void unlink()} disabled={busy.length > 0}><Unlink size={15} />Unlink</button></div>
       <p className="eyebrow nessie-subheading">BILLS & PURCHASES</p>
      {allCosts.length ? <div className="nessie-cost-list">{allCosts.map((item) => {
        const existingShare = item.type === "transfer" ? undefined : sharedItems.get(`${item.type}:${item.id}`);
        const transfer = existingShare ? transferByShare.get(existingShare.id) : undefined;
        return <CostRow key={`${item.type}-${item.id}`} item={item} action={existingShare
          ? <div className="nessie-actions">
            <span className="neutral-pill">Shared</span>
            {transfer && <span className="neutral-pill">{transfer.status === "succeeded" ? "Contribution sent" : transfer.status === "needs_review" || transfer.status === "pending" ? "Transfer review needed" : "Transfer failed"}</span>}
            {existingShare.canUnshare && (!transfer || transfer.status === "failed") && <button className="text-link" disabled={busy.length > 0} onClick={() => void unshare(existingShare.id)}>Unshare</button>}
            {(!transfer || transfer.status === "failed") && data.recipients?.length ? <button className="text-link" disabled={busy.length > 0} onClick={() => openTransfer(existingShare)}>{transfer?.status === "failed" ? "Try transfer again" : "Split cost"}</button> : null}
          </div>
          : item.type !== "transfer" ? <button className="btn btn-quiet" disabled={busy.length > 0} onClick={() => void shareCost(item)}>{busy === `share:${item.id}` ? <LoaderCircle className="voice-spinner" size={15} /> : <Share2 size={15} />}Share with patient</button>
            : <span className="neutral-pill">Sandbox transfer</span>} />;
      })}</div> : <EmptyState title="No bills or purchases found." description="This Nessie account has no mock care-cost activity yet." />}
      {!data.recipients?.length && <p className="small muted">No other Nessie sandbox accounts are available to receive a test contribution.</p>}
      {data.transfers?.length ? <><p className="eyebrow nessie-subheading">RECENT P2P SANDBOX TRANSFERS</p><div className="nessie-cost-list">{data.transfers.map((item) => <CostRow item={item} key={`transfer-${item.id}`} />)}</div></> : null}
      <PrivacyNote>Only share costs the account owner chooses. A purchase is not proof of care, and every transfer requires your confirmation.</PrivacyNote>
    </>}
    <dialog className="confirm-dialog" ref={transferDialog} aria-labelledby="nessie-transfer-title">
      <p className="eyebrow">NESSIE SANDBOX · NO REAL FUNDS</p><h2 id="nessie-transfer-title">Split this care cost?</h2>
      {selectedShare && <p>{selectedShare.label} · {money(selectedShare.amount, "USD")}</p>}
      <label className="nessie-field">Recipient account<select value={recipientAccountId} onChange={(event) => setRecipientAccountId(event.target.value)}>{data.recipients?.map((recipient) => <option key={recipient.accountId} value={recipient.accountId}>{recipient.nickname}</option>)}</select></label>
      <label className="nessie-field">Sandbox contribution<input type="number" min="0.01" max={selectedShare?.amount} step="0.01" value={transferAmount} onChange={(event) => setTransferAmount(event.target.value)} /></label>
      <p className="small muted">Hale will submit this mock P2P transfer only after you confirm. It is not a real payment.</p>
      {transferResult?.status === "succeeded" && <p role="status" className="small handoff-status"><Check size={16} />Sandbox transfer recorded.</p>}
      <div className="dialog-actions"><button className="btn btn-quiet" disabled={busy === "transfer"} onClick={() => transferDialog.current?.close()}>Cancel</button><button className="btn btn-primary" disabled={busy === "transfer" || !recipientAccountId || !Number(transferAmount) || Boolean(transferResult && transferResult.status !== "failed")} onClick={() => void sendTransfer()}>{busy === "transfer" ? "Sending…" : transferResult?.status === "failed" ? "Retry failed request" : "Confirm sandbox transfer"}<ArrowRight size={16} /></button></div>
    </dialog>
  </section>;
}

function FamilyNessieCosts({ patientId }: { patientId: string }) {
  const [revision, setRevision] = useState(0);
  const path = apiPath("nessie/care-costs", { patientId, refresh: String(revision) });
  const { data, error, isLoading } = useApiQuery<FamilyLedger>(path);
  if (error) return <EmptyState title="Nessie is unavailable right now." description="Check the sandbox connection and try again." />;
  if (isLoading || !data) return <p className="results-label muted" role="status">Loading Nessie sandbox costs…</p>;
  return <FamilyCareCosts data={data} patientId={patientId} onRefresh={() => setRevision((value) => value + 1)} />;
}
