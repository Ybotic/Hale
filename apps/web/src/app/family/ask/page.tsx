import { Suspense } from "react";
import { AskView } from "@/components/ask";
export default function AskPage() { return <Suspense fallback={<p className="loading-text">Opening Ask Mnemo…</p>}><AskView /></Suspense>; }
