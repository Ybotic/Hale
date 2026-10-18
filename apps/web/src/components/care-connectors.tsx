"use client";

import { ArrowUpRight, CarFront, Info } from "lucide-react";
import { Button } from "./ui/button";

export function UberRedirect() {
  return <section className="uber-redirect">
    <div className="care-section-heading"><span className="feature-icon"><CarFront size={23} /></span><div><h2>Choose a ride in Uber.</h2><p>Hale will open Uber so you can choose a pickup, destination, and ride option.</p></div></div>
    <Button asChild variant="primary"><a href="https://m.uber.com/ul/">Open Uber<ArrowUpRight aria-hidden /></a></Button>
  </section>;
}

export function CalendarConnector({ calendarUrl }: { calendarUrl: string | null }) {
  return <section className="calendar-connector">
    <div className="care-records-heading"><div><p className="eyebrow">Appointment calendar</p><h3>Connect scheduling</h3></div><span className="neutral-pill">{calendarUrl ? "Connected" : "Optional"}</span></div>
    {calendarUrl ? <><p className="small muted">Choose a time in your connected scheduling page, then save the appointment in Hale below.</p><Button asChild variant="secondary"><a href={calendarUrl} target="_blank" rel="noopener noreferrer">Open appointment calendar<ArrowUpRight aria-hidden /></a></Button></>
      : <div className="info-strip"><Info size={17} /><p>Appointment records work without a connection. Online scheduling is optional.</p></div>}
    <p className="small muted">A calendar booking is not proof of attendance or a medical appointment.</p>
  </section>;
}
