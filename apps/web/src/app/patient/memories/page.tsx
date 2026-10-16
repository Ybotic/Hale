import { Suspense } from "react";
import { CalendarView } from "@/components/calendar";
export default function MemoriesPage() { return <Suspense fallback={<p className="loading-text">Opening your memories…</p>}><CalendarView patient /></Suspense>; }
