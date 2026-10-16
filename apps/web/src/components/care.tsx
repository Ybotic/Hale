"use client";

import { useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Banknote, CalendarDays, CarFront, Check, Clock3, Info, Pill, ShieldCheck } from "lucide-react";
import { useWorkspace } from "./providers";
import { EmptyState, PageIntro, PrivacyNote } from "./ui";
import { NessieCareCosts } from "./nessie-care-costs";

type MedicationReport = "taken" | "skipped" | "unknown";

export function CareView({ patient = false }: { patient?: boolean }) {
  const { mode, space } = useWorkspace();
  const [tab, setTab] = useState("rides");
  const [quotes, setQuotes] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [report, setReport] = useState<MedicationReport>();
  const [pending, setPending] = useState<MedicationReport>();
  const confirmation = useRef<HTMLDialogElement>(null);
  const sections = [
    { id: "rides", label: "Rides", icon: CarFront },
    { id: "appointments", label: "Appointments", icon: CalendarDays },
    { id: "medications", label: "Medication records", icon: Pill },
    { id: "costs", label: "Care costs", icon: Banknote },
  ];

  return <>
    <PageIntro
      eyebrow="SUPPORT FOR THE EVERYDAY"
      title={<>A little help,<br /><span className="heading-light">for what’s next.</span></>}
      description="Rides, appointments, medication records, and family-coordinated care costs. Always with your say-so."
    />
    <div className="care-layout">
      <aside className="care-navigation" aria-label="Care sections">
        {sections.map(({ id, label, icon: Icon }) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
          <Icon size={19} />{label}<ArrowRight size={16} />
        </button>)}
        <PrivacyNote>Consequential actions need exact, server-verified approval. External bookings are disabled in this first build.</PrivacyNote>
      </aside>
      <section key={tab} className="care-content swap-in">
        {tab === "rides" && <>
          <div className="care-section-heading">
            <span className="feature-icon"><CarFront size={23} /></span>
            <div><h2>A way to get there.</h2><p>Review your route. Choose an option. Finish in Uber.</p></div>
            <span className="neutral-pill">Not connected</span>
          </div>
          {mode === "demo" ? <>
            <div className="info-strip"><Info size={17} /><p>These are synthetic quote fixtures, not live fares. No Uber account is linked and no ride can be requested here.</p></div>
            <div className="route-preview"><div><span className="eyebrow">DEMO PICKUP</span><strong>Home · fictional address</strong></div><div className="route-connector" /><div><span className="eyebrow">DEMO DESTINATION</span><strong>Garden café · fictional location</strong></div></div>
            <button className="btn btn-primary" onClick={() => setQuotes(true)}>{quotes ? "Showing demo options" : "Preview demo ride options"}<ArrowRight size={16} /></button>
            {quotes && <div className="ride-options">
              <p className="eyebrow">SYNTHETIC ESTIMATES · USD · NO LIVE OBSERVATION TIME</p>
              {[{ name: "UberX", price: "14.80", eta: "5" }, { name: "Comfort", price: "21.40", eta: "8" }].map((option) => <div className="ride-option" key={option.name}>
                <CarFront size={23} /><div><h3>{option.name}</h3><span>Example ETA: {option.eta} min · Demo fixture</span></div><strong>${option.price}</strong>
              </div>)}
              <p className="small muted">The cheapest fixture is UberX. Real availability, price, and accessibility options must be verified in Uber.</p>
              <a className="btn btn-ink" href="https://m.uber.com/" rel="noopener noreferrer" target="_blank" onClick={() => setHandoff(true)}>Open Uber to choose a real route<ArrowUpRight size={16} /></a>
              {handoff && <p role="status" className="small handoff-status"><Check size={16} />Handoff link selected. No booking or ride is confirmed.</p>}
            </div>}
          </> : <EmptyState title="Your ride connection starts here." description="The Uber quote connector is not configured in this build. No quotes or account details have been invented.">
            <a className="btn btn-quiet" href="https://m.uber.com/" target="_blank" rel="noopener noreferrer">Open Uber directly<ArrowUpRight size={16} /></a>
          </EmptyState>}
        </>}

        {tab === "appointments" && <>
          <div className="care-section-heading"><span className="feature-icon"><CalendarDays size={23} /></span><div><h2>A little room in the calendar.</h2><p>Connected appointment types, available slots, and receipts.</p></div><span className="neutral-pill">Not connected</span></div>
          <EmptyState title="No appointment calendar is connected." description="Cal.com test-calendar booking and the single-use approval gate are not enabled yet. There are no real clinic slots or bookings to show." />
          <div className="info-strip"><ShieldCheck size={18} /><p>A test-calendar booking is not a medical appointment. Hale will never claim attendance from a booking receipt.</p></div>
        </>}

        {tab === "medications" && <>
          <div className="care-section-heading"><span className="feature-icon"><Pill size={23} /></span><div><h2>Your recorded instructions.</h2><p>Records and self-reports. Not medication advice.</p></div></div>
          {mode === "demo" ? <>
            <div className="info-strip"><Info size={17} /><p>This is a fictional schedule example, not a prescription. Do not use it for treatment or dosing decisions.</p></div>
            <div className="medication-example">
              <p className="eyebrow">FICTIONAL, UNVERIFIED SOURCE · DEMO ONLY</p>
              <h3>Example medication A</h3><p>Example recorded instruction: 1 tablet in the morning.</p>
              <span className="icon-label small muted"><Clock3 size={15} />08:00 · {space.timezone}</span>
              <div className="medication-report"><span>{report ? `Demo self-report: ${report === "taken" ? "You reported taking this dose" : report === "skipped" ? "You reported skipping this dose" : "You reported not remembering"}.` : "No self-report recorded. This does not tell us whether a dose was taken."}</span></div>
              <p className="small muted">Record a fictional self-report:</p>
              <div className="button-group report-buttons">{(["taken", "skipped", "unknown"] as const).map((status) => <button className="btn btn-quiet" key={status} onClick={() => { setPending(status); confirmation.current?.showModal(); }}>{status === "taken" ? "I took it" : status === "skipped" ? "I skipped it" : "I don’t remember"}</button>)}</div>
            </div>
            <p className="small muted">This demo keeps the self-report only while this screen is open. Missing or conflicting logs never mean you should take another dose. Ask your pharmacist or clinician about personal medication questions.</p>
          </> : <EmptyState title="No medication schedule is recorded." description="No medication or dose is inferred from conversations. Verified prescription-source records and server-confirmed self-reports will be added in the care integration milestone." />}
        </>}

        {tab === "costs" && <NessieCareCosts patient={patient} />}
      </section>
    </div>
    <dialog className="confirm-dialog" ref={confirmation} aria-labelledby="medication-report-title">
      <p className="eyebrow">DEMO SELF-REPORT · NO EXTERNAL ACTION</p>
      <h2 id="medication-report-title">{pending === "taken" ? "Record that you took it?" : pending === "skipped" ? "Record that you skipped it?" : "Record that you don’t remember?"}</h2>
      <p>Example medication A · Fictional morning dose. This records your statement, not verified ingestion. It does not change a prescription.</p>
      <div className="dialog-actions">
        <button className="btn btn-quiet" onClick={() => confirmation.current?.close()}>Go back</button>
        <button className="btn btn-primary" onClick={() => { if (mode === "demo") setReport(pending); confirmation.current?.close(); }}>Confirm demo self-report</button>
      </div>
    </dialog>
  </>;
}
