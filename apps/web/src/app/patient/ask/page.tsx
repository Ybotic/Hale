import { Suspense } from "react";
import { AskView } from "@/components/ask";
export default function PatientAskPage() { return <Suspense fallback={<p className="loading-text">Opening your assistant…</p>}><AskView patient /></Suspense>; }
