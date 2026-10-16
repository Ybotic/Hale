import { Suspense } from "react";
import { CalendarView } from "@/components/calendar";
export default function CalendarPage() { return <Suspense fallback={<p className="loading-text">Opening your calendar…</p>}><CalendarView /></Suspense>; }
