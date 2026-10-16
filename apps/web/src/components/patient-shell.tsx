"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, CalendarDays, House, Leaf, Settings, Share, Sparkles, Users, X } from "lucide-react";
import { useWorkspace } from "./providers";
import { RecorderCard, RecordingProvider, useRecordingController } from "./recorder";

interface DeferredInstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function PatientShell({ children }: { children: React.ReactNode }) {
  const { space } = useWorkspace();
  return <RecordingProvider key={space.id}><PatientFrame>{children}</PatientFrame></RecordingProvider>;
}

function PatientFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { mode } = useWorkspace();
  const capture = useRecordingController();
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [offline, setOffline] = useState(false);
  const [workerError, setWorkerError] = useState(false);
  useEffect(() => {
    const connection = () => setOffline(!navigator.onLine);
    const standalone = () => {
      const iosNavigator = navigator as Navigator & { standalone?: boolean };
      setIsInstalled(window.matchMedia("(display-mode: standalone)").matches || iosNavigator.standalone === true);
    };
    const iosDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const rememberInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as DeferredInstallPrompt);
    };
    const installed = () => { setIsInstalled(true); setInstallPrompt(null); };
    const initialStateTimer = window.setTimeout(() => {
      connection();
      standalone();
      setIsIos(iosDevice);
    }, 0);
    window.addEventListener("online", connection); window.addEventListener("offline", connection);
    window.addEventListener("beforeinstallprompt", rememberInstallPrompt);
    window.addEventListener("appinstalled", installed);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/patient/sw.js", { scope: "/patient/", updateViaCache: "none" }).catch(() => setWorkerError(true));
    }
    return () => {
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      window.removeEventListener("beforeinstallprompt", rememberInstallPrompt);
      window.removeEventListener("appinstalled", installed);
      window.clearTimeout(initialStateTimer);
    };
  }, []);
  async function installApp() {
    if (!installPrompt) { setShowGuide((visible) => !visible); return; }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setIsInstalled(true);
  }
  const navigation = [{ href: "/patient/today", label: "Today", icon: House }, { href: "/patient/ask", label: "Ask Hale", icon: Sparkles }, { href: "/patient/memories", label: "Memories", icon: CalendarDays }];
  return <div className="patient-app"><a className="skip-link" href="#patient-main">Skip to content</a><header className="patient-header"><Link className="wordmark" href="/patient/today"><Leaf size={23} />hale.</Link><div><Link href="/patient/people" className="icon-button" aria-label="People"><Users size={20} /></Link><Link href="/patient/settings" className="icon-button" aria-label="Settings"><Settings size={20} /></Link></div></header>
    {mode === "demo" && <div className="patient-demo-label">DEMO SPACE · FICTIONAL MEMORIES · OCT 15, 2026</div>}
    {offline && <div className="info-strip" role="status">You’re offline. Unsent audio is temporary. Search and live answers need a connection.</div>}
    {workerError && <p className="small muted">Offline shell unavailable. Recording remains foreground-only.</p>}
    <div className="persistent-capture">{!pathname.endsWith("/today") && <RecorderCard compact />}</div>
     <main id="patient-main" className="patient-main">{children}</main><footer className="patient-footer">{!isInstalled && <button className="text-link" onClick={() => void installApp()}>{installPrompt ? "Install Hale" : "Add Hale to your Home Screen"}<ArrowUpRight size={14} /></button>}{showGuide && !isInstalled && <section className="install-guide"><div><h3>A familiar place on your phone.</h3><button className="icon-button" onClick={() => setShowGuide(false)} aria-label="Close install guide"><X size={17} /></button></div>{isIos ? <p>In Safari, tap <Share size={15} aria-label="Share" /> Share, then <strong>Add to Home Screen</strong>. Use HTTPS. Installation doesn’t enable background recording.</p> : <p>Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>. Use HTTPS. Installation doesn’t enable background recording.</p>}</section>}<p>A memory aid, not a medical service.<br />Recordings may be incomplete or inaccurate.</p><Link href="/family/overview" className="small text-link" onClick={(event) => { const snapshot = capture?.getSnapshot(); if (snapshot && (["starting", "recording"].includes(snapshot.phase) || snapshot.segments.length > 0) && !window.confirm("Leaving the patient experience stops recording and discards unsent audio. Download or upload any segments first. Leave anyway?")) event.preventDefault(); }}>Family website<ArrowUpRight size={13} /></Link></footer>
    <nav className="patient-bottom-nav" aria-label="Patient navigation">{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href || (href === "/patient/memories" && pathname.includes("/conversations/")) ? "page" : undefined}><Icon size={22} strokeWidth={1.7} /><span>{label}</span></Link>)}</nav>
  </div>;
}
