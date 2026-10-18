"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Banknote, CalendarDays, CarFront, Check, Clock3, Info, Pill, ShieldCheck } from "lucide-react";
import { apiPath, useApiQuery } from "@/lib/api-client";
import { useWorkspace } from "./providers";
import { PageScrollReveal } from "./motion-primitives";
import { PageIntro, PrivacyNote } from "./ui";
import { NessieCareCosts } from "./nessie-care-costs";
import { CareRecordsPanel } from "./care-records";
import { CalendarConnector, UberQuoteConnector } from "./care-connectors";
import { CareReminderControl } from "./care-reminder-control";
import { MedicationPdfImport } from "./medication-pdf-import";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

type MedicationReport = "taken" | "skipped" | "unknown";

export function CareView({ patient = false }: { patient?: boolean }) {
  const { mode, space } = useWorkspace();
  const integrationPath = apiPath("care/integrations", { patientId: space.id });
  const { data: integrations } = useApiQuery<{ uberConfigured: boolean; calendarUrl: string | null }>(integrationPath, mode === "live", 30_000);
  const [tab, setTab] = useState("rides");
  const [quotes, setQuotes] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [report, setReport] = useState<MedicationReport>();
  const [pending, setPending] = useState<MedicationReport>();
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  useEffect(() => {
    const syncSection = () => {
      const requested = window.location.hash.slice(1);
      if (["rides", "appointments", "medications", "costs"].includes(requested)) {
        window.requestAnimationFrame(() => setTab(requested));
      }
    };
    syncSection();
    window.addEventListener("hashchange", syncSection);
    return () => window.removeEventListener("hashchange", syncSection);
  }, []);
  const sections = [
    { id: "rides", label: "Rides", icon: CarFront },
    { id: "appointments", label: "Appointments", icon: CalendarDays },
    { id: "medications", label: "Medication records", icon: Pill },
    { id: "costs", label: "Care costs", icon: Banknote },
  ];

  return <PageScrollReveal>
    <PageIntro
      eyebrow="Support for the everyday"
      title={<>A little help,<br /><span className="heading-light">for what’s next.</span></>}
      description="Rides, appointments, medication records, and family-coordinated care costs. Always with your say-so."
    />
    <CareReminderControl patient={patient} />
    <Tabs value={tab} onValueChange={(value) => { if (value) setTab(value); }} className="care-layout">
      <aside className="care-navigation" aria-label="Care sections">
        <TabsList className="care-tab-list" aria-label="Care sections">{sections.map(({ id, label, icon: Icon }) => <TabsTrigger className="care-navigation-tab" key={id} value={id}><Icon aria-hidden className="size-6" /><span>{label}</span><ArrowRight aria-hidden className="care-tab-arrow size-6" /></TabsTrigger>)}</TabsList>
        <PrivacyNote editorial={!patient}>Consequential actions need exact, server-verified approval. External bookings are disabled in this first build.</PrivacyNote>
      </aside>
      <div className="care-content">
        <TabsContent value="rides" className="swap-in">
          <div className="care-section-heading">
            <span className="feature-icon"><CarFront size={23} /></span>
            <div><h2>A way to get there.</h2><p>Review your route. Choose an option. Finish in Uber.</p></div>
            <span className="neutral-pill">Not connected</span>
          </div>
          {mode === "demo" ? <>
            <div className="info-strip"><Info size={17} /><p>These are synthetic quote fixtures, not live fares. No Uber account is linked and no ride can be requested here.</p></div>
            <div className="route-preview"><div><span className="eyebrow">Demo pickup</span><strong>Home · fictional address</strong></div><div className="route-connector" /><div><span className="eyebrow">Demo destination</span><strong>Garden café · fictional location</strong></div></div>
            <Button variant="primary" onClick={() => setQuotes(true)}>{quotes ? "Showing demo options" : "Preview demo ride options"}<ArrowRight aria-hidden /></Button>
            {quotes && <div className="ride-options">
              <p className="eyebrow">Synthetic estimates · USD · No live observation time</p>
              {[{ name: "UberX", price: "14.80", eta: "5" }, { name: "Comfort", price: "21.40", eta: "8" }].map((option) => <div className="ride-option" key={option.name}>
                <CarFront size={23} /><div><h3>{option.name}</h3><span>Example ETA: {option.eta} min · Demo fixture</span></div><strong>${option.price}</strong>
              </div>)}
              <p className="small muted">The cheapest fixture is UberX. Real availability, price, and accessibility options must be verified in Uber.</p>
              <Button asChild variant="primary"><a href="https://m.uber.com/" rel="noopener noreferrer" target="_blank" onClick={() => setHandoff(true)}>Open Uber to choose a real route<ArrowUpRight aria-hidden /></a></Button>
              {handoff && <p role="status" className="small handoff-status"><Check size={16} />Handoff link selected. No booking or ride is confirmed.</p>}
            </div>}
          </> : <UberQuoteConnector configured={Boolean(integrations?.uberConfigured)} />}
          <CareRecordsPanel type="ride" />
        </TabsContent>

        <TabsContent value="appointments" className="swap-in">
          <div className="care-section-heading"><span className="feature-icon"><CalendarDays size={23} /></span><div><h2>A little room in the calendar.</h2><p>Connect scheduling or keep an appointment record here.</p></div></div>
          {mode === "live" ? <CalendarConnector calendarUrl={integrations?.calendarUrl ?? null} /> : <div className="info-strip"><Info size={17} /><p>Demo appointments are fictional and stay on this screen.</p></div>}
          <CareRecordsPanel type="appointment" />
          <div className="info-strip"><ShieldCheck size={18} /><p>A calendar booking is not a medical appointment and does not prove attendance.</p></div>
        </TabsContent>

        <TabsContent value="medications" className="swap-in">
          <div className="care-section-heading"><span className="feature-icon"><Pill size={23} /></span><div><h2>Your recorded instructions.</h2><p>Records and self-reports. Not medication advice.</p></div></div>
          {mode === "demo" ? <>
            <div className="info-strip"><Info size={17} /><p>This is a fictional schedule example, not a prescription. Do not use it for treatment or dosing decisions.</p></div>
            <div className="medication-example">
              <p className="eyebrow">Fictional, unverified source · Demo only</p>
              <h3>Example medication A</h3><p>Example recorded instruction: 1 tablet in the morning.</p>
              <span className="icon-label small muted"><Clock3 size={15} />08:00 · {space.timezone}</span>
              <div className="medication-report"><span>{report ? `Demo self-report: ${report === "taken" ? "You reported taking this dose" : report === "skipped" ? "You reported skipping this dose" : "You reported not remembering"}.` : "No self-report recorded. This does not tell us whether a dose was taken."}</span></div>
              <p className="small muted">Record a fictional self-report:</p>
              <div className="button-group report-buttons">{(["taken", "skipped", "unknown"] as const).map((status) => <Button variant="secondary" key={status} onClick={() => { setPending(status); setReportDialogOpen(true); }}>{status === "taken" ? "I took it" : status === "skipped" ? "I skipped it" : "I don’t remember"}</Button>)}</div>
            </div>
              <p className="small muted">This demo keeps the self-report only while this screen is open. Missing or conflicting logs never mean you should take another dose. Ask your pharmacist or clinician about personal medication questions.</p>
              <CareRecordsPanel type="medication" />
              <MedicationPdfImport />
          </> : <><div className="info-strip"><Info size={17} /><p>No medication or dose is inferred from conversations. Add only information from a source you trust; Hale does not validate prescriptions or provide dosing advice.</p></div><CareRecordsPanel type="medication" /><MedicationPdfImport /></>}
        </TabsContent>

        <TabsContent value="costs" className="swap-in"><NessieCareCosts patient={patient} /><CareRecordsPanel type="care_cost" /></TabsContent>
      </div>
    </Tabs>
    <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
      <DialogContent className={!patient ? "family-editorial-dialog" : undefined} aria-labelledby="medication-report-title" aria-describedby="medication-report-description">
        <DialogHeader><p className="eyebrow">Demo self-report · No external action</p><DialogTitle id="medication-report-title">{pending === "taken" ? "Record that you took it?" : pending === "skipped" ? "Record that you skipped it?" : "Record that you don’t remember?"}</DialogTitle><DialogDescription id="medication-report-description">Example medication A · Fictional morning dose. This records your statement, not verified ingestion. It does not change a prescription.</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setReportDialogOpen(false)}>Go back</Button>
          <Button variant="primary" onClick={() => { if (mode === "demo") setReport(pending); setReportDialogOpen(false); }}>Confirm demo self-report</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </PageScrollReveal>;
}
