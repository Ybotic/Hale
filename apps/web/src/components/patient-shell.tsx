"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, CalendarDays, House, Leaf, Settings, Share, Sparkles, Users, X } from "lucide-react";
import { useWorkspace } from "./providers";
import { RecorderCard, RecordingProvider, useRecordingController } from "./recorder";
import { AppearanceMenu } from "./appearance";
import { MorePopover, MoreSheet } from "./navigation-more";
import { Button } from "./ui/button";

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
      void navigator.serviceWorker.register("/patient/sw.js", { scope: "/patient/", updateViaCache: "none" }).catch(() => {});
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
  const navigation = [{ href: "/patient/today", label: "Today", mobileLabel: "Today", icon: House }, { href: "/patient/ask", label: "Ask Hale", mobileLabel: "Ask", icon: Sparkles }, { href: "/patient/memories", label: "Memories", mobileLabel: "Memories", icon: CalendarDays }];
  const peopleActive = pathname === "/patient/people";
  const settingsActive = pathname === "/patient/settings";
  const moreLinks = [{ href: "/patient/people", label: "People", Icon: Users, current: peopleActive }, { href: "/patient/settings", label: "Settings", Icon: Settings, current: settingsActive }];
  return <div className="patient-app"><a className="skip-link" href="#patient-main">Skip to content</a><header className="patient-header"><Link className="wordmark" href="/patient/today"><Leaf aria-hidden size={24} />hale.</Link><nav className="patient-top-nav" aria-label="Patient navigation">{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href || (href === "/patient/memories" && pathname.includes("/conversations/")) ? "page" : undefined}><Icon aria-hidden size={24} /><span>{label}</span></Link>)}</nav><div className="patient-header-tools"><AppearanceMenu /><MorePopover items={moreLinks} current={peopleActive || settingsActive} /></div></header>
      {mode === "demo" && <div className="patient-demo-label">Demo space · fictional memories · Oct 15, 2026</div>}
     {offline && <div className="info-strip" role="status">You’re offline. Unsent audio is temporary. Search and live answers need a connection.</div>}
     <div className="persistent-capture">{!pathname.endsWith("/today") && <RecorderCard compact />}</div>
        <main id="patient-main" className="patient-main">{children}</main><footer className="patient-footer"><p className="patient-disclaimer">Hale is a memory aid, not a medical service. Recordings may be incomplete or inaccurate.</p>{!isInstalled && <Button variant="ghost" onClick={() => void installApp()}>{installPrompt ? "Install Hale" : "Add Hale to your Home Screen"}<ArrowUpRight aria-hidden /></Button>}{showGuide && !isInstalled && <section className="install-guide"><div><h3>A familiar place on your phone.</h3><Button variant="ghost" className="install-guide-close" onClick={() => setShowGuide(false)}><X aria-hidden />Close</Button></div>{isIos ? <p>In Safari, tap <Share aria-hidden /> Share, then <strong>Add to Home Screen</strong>. Use HTTPS. Installation doesn’t enable background recording.</p> : <p>Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>. Use HTTPS. Installation doesn’t enable background recording.</p>}</section>}<Link href="/family/overview" className="text-link" onClick={(event) => { const snapshot = capture?.getSnapshot(); if (snapshot && (["starting", "recording"].includes(snapshot.phase) || snapshot.segments.length > 0) && !window.confirm("Leaving the patient experience stops recording and discards unsent audio. Download or upload any segments first. Leave anyway?")) event.preventDefault(); }}>Family website<ArrowUpRight aria-hidden /></Link></footer>
      <nav className="patient-bottom-nav" aria-label="Patient navigation">{navigation.map(({ href, label, mobileLabel, icon: Icon }) => <Link key={href} href={href} aria-label={label} title={label} aria-current={pathname === href || (href === "/patient/memories" && pathname.includes("/conversations/")) ? "page" : undefined}><Icon aria-hidden size={24} /><span>{mobileLabel}</span></Link>)}<MoreSheet className="patient-bottom-more" items={moreLinks} current={peopleActive || settingsActive} /></nav>
  </div>;
}
