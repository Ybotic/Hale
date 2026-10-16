"use client";

import { ChevronDown } from "lucide-react";
import type { PatientInfo } from "@/lib/api";

export function PatientSwitcher({ patient, patients, onSelect }: { patient: Pick<PatientInfo, "id" | "name">; patients: PatientInfo[]; onSelect: (id: string) => void }) {
  const canSwitch = patients.length > 1;
  return <div className={`patient-selector${canSwitch ? " patient-selector-interactive" : ""}`}>
    <span className="avatar" aria-hidden>{patient.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span>
    <div className="patient-selector-copy">
      <span className="patient-selector-label">Patient space</span>
      {canSwitch ? <div className="patient-select-control"><select aria-label="Switch patient space" value={patient.id} onChange={(event) => onSelect(event.target.value)}>{patients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14} aria-hidden /></div> : <span className="patient-selector-name">{patient.name}</span>}
    </div>
  </div>;
}
