"use client";

import { useState, type FormEvent } from "react";
import { ArrowUpRight, CarFront, Crosshair, Info, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { useWorkspace } from "./providers";
import { Button } from "./ui/button";

type UberQuote = { productId: string; name: string; estimate: string; lowEstimate: number | null; highEstimate: number | null; currency: string | null; durationSeconds: number | null; distanceMiles: number | null };

function uberDeepLink(values: { pickupLatitude: string; pickupLongitude: string; dropoffLatitude: string; dropoffLongitude: string; pickup: string; dropoff: string }) {
  const url = new URL("https://m.uber.com/ul/");
  url.searchParams.set("action", "setPickup");
  url.searchParams.set("pickup[latitude]", values.pickupLatitude);
  url.searchParams.set("pickup[longitude]", values.pickupLongitude);
  url.searchParams.set("dropoff[latitude]", values.dropoffLatitude);
  url.searchParams.set("dropoff[longitude]", values.dropoffLongitude);
  if (values.pickup) url.searchParams.set("pickup[nickname]", values.pickup);
  if (values.dropoff) url.searchParams.set("dropoff[nickname]", values.dropoff);
  return url.toString();
}

export function UberQuoteConnector({ configured }: { configured: boolean }) {
  const { space } = useWorkspace();
  const [quotes, setQuotes] = useState<UberQuote[]>([]);
  const [route, setRoute] = useState({ pickup: "", dropoff: "", pickupLatitude: "", pickupLongitude: "", dropoffLatitude: "", dropoffLongitude: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function update(field: keyof typeof route, value: string) { setRoute((current) => ({ ...current, [field]: value })); }

  function useCurrentLocation() {
    setError(""); setMessage("");
    if (!navigator.geolocation) { setError("This browser does not provide location access. Enter pickup coordinates manually."); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => setRoute((current) => ({ ...current, pickupLatitude: position.coords.latitude.toFixed(6), pickupLongitude: position.coords.longitude.toFixed(6) })),
      () => setError("Location was not shared. Enter pickup coordinates manually."),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function requestQuotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage(""); setQuotes([]);
    try {
      const result = await apiRequest<{ quotes: UberQuote[] }>("care/uber-quotes", {
        json: {
          patientId: space.id,
          pickupLatitude: Number(route.pickupLatitude), pickupLongitude: Number(route.pickupLongitude),
          dropoffLatitude: Number(route.dropoffLatitude), dropoffLongitude: Number(route.dropoffLongitude),
        },
      });
      setQuotes(result.quotes);
      if (!result.quotes.length) setMessage("Uber returned no fare options for these coordinates.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Uber could not return an estimate."); }
    finally { setBusy(false); }
  }

  return <section className="uber-connector">
    <div className="care-records-heading"><div><p className="eyebrow">Uber · Live fare estimates</p><h3>Check ride options</h3></div><span className="neutral-pill">{configured ? "Connected" : "Needs setup"}</span></div>
    {!configured ? <div className="info-strip"><Info size={17} /><p>To enable live estimates, configure the server-only <code>UBER_ACCESS_TOKEN</code> or approved legacy <code>UBER_SERVER_TOKEN</code>. Uber must approve this estimates API for your app; credentials are never entered in this browser. <a href="https://developer.uber.com/docs/riders/references/api/v1.2/estimates-price-get" target="_blank" rel="noopener noreferrer">Uber API setup<ArrowUpRight size={13} /></a> <a href="https://m.uber.com/" target="_blank" rel="noopener noreferrer">Open Uber directly<ArrowUpRight size={13} /></a></p></div> : <>
      <p className="small muted">Enter route coordinates or use this device’s location for pickup. Location is sent only when you ask Uber for a quote.</p>
      <form className="uber-route-form" onSubmit={(event) => void requestQuotes(event)}>
        <div className="uber-place-fields"><label>Pickup name or address<input value={route.pickup} onChange={(event) => update("pickup", event.target.value)} maxLength={160} placeholder="Pickup" /></label><label>Destination name or address<input value={route.dropoff} onChange={(event) => update("dropoff", event.target.value)} maxLength={160} placeholder="Destination" /></label></div>
        <Button type="button" variant="ghost" onClick={useCurrentLocation}><Crosshair aria-hidden />Use current location for pickup</Button>
        <div className="uber-coordinate-fields"><label>Pickup latitude<input required type="number" min="-90" max="90" step="any" value={route.pickupLatitude} onChange={(event) => update("pickupLatitude", event.target.value)} /></label><label>Pickup longitude<input required type="number" min="-180" max="180" step="any" value={route.pickupLongitude} onChange={(event) => update("pickupLongitude", event.target.value)} /></label><label>Destination latitude<input required type="number" min="-90" max="90" step="any" value={route.dropoffLatitude} onChange={(event) => update("dropoffLatitude", event.target.value)} /></label><label>Destination longitude<input required type="number" min="-180" max="180" step="any" value={route.dropoffLongitude} onChange={(event) => update("dropoffLongitude", event.target.value)} /></label></div>
        {error && <p className="small error-text" role="alert">{error}</p>}
        {message && <p className="small muted" role="status">{message}</p>}
        <Button variant="primary" pending={busy} disabled={busy}>{busy ? "Getting estimates…" : <><CarFront aria-hidden />Get Uber estimates</>}</Button>
      </form>
      {quotes.length > 0 && <div className="ride-options"><p className="eyebrow">Live provider estimates · Not a booking</p>{quotes.map((quote, index) => <article className="ride-option" key={`${quote.productId}-${index}`}><CarFront aria-hidden size={24} /><div><h3>{quote.name}</h3><span>{quote.durationSeconds === null ? "" : `${Math.round(quote.durationSeconds / 60)} min`}{quote.durationSeconds !== null && quote.distanceMiles !== null ? " · " : ""}{quote.distanceMiles === null ? "" : `${quote.distanceMiles.toFixed(1)} mi`}</span></div><strong>{quote.estimate}</strong></article>)}<p className="small muted">Uber estimates do not guarantee availability, final price, accessibility, or a ride. Review the route and confirm any trip in Uber.</p><Button asChild variant="primary"><a href={uberDeepLink(route)} target="_blank" rel="noopener noreferrer">Review this route in Uber<ArrowUpRight aria-hidden /></a></Button></div>}
    </>}
    <div className="info-strip"><ShieldCheck size={17} /><p>Hale only requests estimates. It never books or dispatches a ride.</p></div>
  </section>;
}

export function CalendarConnector({ calendarUrl }: { calendarUrl: string | null }) {
  return <section className="calendar-connector">
    <div className="care-records-heading"><div><p className="eyebrow">Appointment calendar</p><h3>Connect scheduling</h3></div><span className="neutral-pill">{calendarUrl ? "Connected" : "Optional"}</span></div>
    {calendarUrl ? <><p className="small muted">Choose a time in your connected Cal.com scheduling page, then save the appointment in Hale below.</p><Button asChild variant="secondary"><a href={calendarUrl} target="_blank" rel="noopener noreferrer">Open appointment calendar<ArrowUpRight aria-hidden /></a></Button></>
      : <div className="info-strip"><Info size={17} /><p>Appointment records work without a connection. To add online scheduling, set the public <code>CALCOM_BOOKING_URL</code> on the server to your Cal.com scheduling link. Booking is completed and confirmed by Cal.com.</p></div>}
    <p className="small muted">A calendar booking is not proof of attendance or a medical appointment.</p>
  </section>;
}
