"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Banknote, CalendarDays, CarFront, Clock3, Info, Pill, ShieldCheck } from "lucide-react";
import { apiPath, useApiQuery } from "@/lib/api-client";
import { useWorkspace } from "./providers";
import { PageScrollReveal } from "./motion-primitives";
import { PageIntro, PrivacyNote } from "./ui";
import { NessieCareCosts } from "./nessie-care-costs";
import { CareRecordsPanel } from "./care-records";
import { CalendarConnector, UberRedirect } from "./care-connectors";
import { MedicationPdfImport } from "./medication-pdf-import";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

type MedicationReport = "taken" | "skipped" | "unknown";

export function CareView({ patient = false }: { patient?: boolean }) {
  const { mode, space } = useWorkspace();
  const integrationPath = apiPath("care/integrations", { patientId: space.id });
  const { data: integrations } = useApiQuery<{ calendarUrl: string | null }>(integrationPath, mode === "live" && !patient, 30_000);
  const [tab, setTab] = useState(patient ? "rides" : "appointments");
  const [report, setReport] = useState<MedicationReport>();
  const [pending, setPending] = useState<MedicationReport>();
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  useEffect(() => {
    const syncSection = () => {
      const requested = window.location.hash.slice(1);
      const availableSections = patient ? ["rides", "appointments", "medications", "costs"] : ["appointments", "medications", "costs"];
      if (availableSections.includes(requested)) {
        window.requestAnimationFrame(() => setTab(requested));
      }
    };
    syncSection();
    window.addEventListener("hashchange", syncSection);
    return () => window.removeEventListener("hashchange", syncSection);
  }, [patient]);
  const sections = [
    ...(patient ? [{ id: "rides", label: "Rides", icon: CarFront }] : []),
    { id: "appointments", label: "Appointments", icon: CalendarDays },
    { id: "medications", label: "Medication records", icon: Pill },
    { id: "costs", label: "Care costs", icon: Banknote },
  ];

  return <PageScrollReveal>
    <PageIntro
      eyebrow=""
      title={<>A little help,<br /><span className="heading-light">for what’s next.</span></>}
      description={patient ? "" : ""}
      className="care-page-intro"
    />
    <Tabs value={tab} onValueChange={(value) => { if (value) setTab(value); }} className="care-layout">
      <aside className="care-navigation" aria-label="Care sections">
        <TabsList className="care-tab-list" aria-label="Care sections">{sections.map(({ id, label, icon: Icon }) => <TabsTrigger className="care-navigation-tab" key={id} value={id}><Icon aria-hidden className="size-6" /><span>{label}</span><ArrowRight aria-hidden className="care-tab-arrow size-6" /></TabsTrigger>)}</TabsList>
        {!patient && <PrivacyNote editorial></PrivacyNote>}
      </aside>
      <div className="care-content">
        {patient && <TabsContent value="rides" className="swap-in"><UberRedirect /></TabsContent>}

        <TabsContent value="appointments" className="swap-in">
          <div className="care-section-heading"><div><h2>{patient ? "Appointment records." : "A little room in the calendar."}</h2><p>{patient ? "Keep appointment details together in one place." : "Connect scheduling or keep an appointment record here."}</p></div></div>
          <CareRecordsPanel type="appointment" />
        </TabsContent>

        <TabsContent value="medications" className="swap-in">
          {mode === "demo" ? <>
            <div className="medication-example">
              <p className="eyebrow">Fictional, unverified source · Demo only</p>
              <h3>Example medication A</h3><p>Example recorded instruction: 1 tablet in the morning.</p>
              <span className="icon-label small muted"><Clock3 size={15} />08:00 · {space.timezone}</span>
              <div className="medication-report"><span>{report ? `Demo self-report: ${report === "taken" ? "You reported taking this dose" : report === "skipped" ? "You reported skipping this dose" : "You reported not remembering"}.` : "No self-report recorded. This does not tell us whether a dose was taken."}</span></div>
              <p className="small muted">Record a fictional self-report:</p>
              <div className="button-group report-buttons">{(["taken", "skipped", "unknown"] as const).map((status) => <Button variant="secondary" key={status} onClick={() => { setPending(status); setReportDialogOpen(true); }}>{status === "taken" ? "I took it" : status === "skipped" ? "I skipped it" : "I don’t remember"}</Button>)}</div>
            </div>
            <CareRecordsPanel type="medication" />
            <MedicationPdfImport />
          </> : <>{!patient && <div className="info-strip"><Info size={17} /><p>No medication or dose is inferred from conversations. Add only information from a source you trust; Hale does not validate prescriptions or provide dosing advice.</p></div>}<CareRecordsPanel type="medication" /><MedicationPdfImport /></>}
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
