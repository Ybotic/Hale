"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, CalendarDays, House, Leaf, MoreHorizontal, Settings, Share, Sparkles, Users, X } from "lucide-react";
import { useWorkspace } from "./providers";
import { RecorderCard, RecordingProvider, useRecordingController } from "./recorder";
import { AppearanceMenu } from "./appearance";
import { Drawer } from "./ui-primitives";

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
  const navigation = [{ href: "/patient/today", label: "Today", icon: House }, { href: "/patient/ask", label: "Ask Hale", icon: Sparkles }, { href: "/patient/memories", label: "Memories", icon: CalendarDays }];
  const peopleActive = pathname === "/patient/people";
  const settingsActive = pathname === "/patient/settings";
  const closeMoreMenu = (event: React.MouseEvent<HTMLAnchorElement>) => event.currentTarget.closest("details")?.removeAttribute("open");
  const moreLinks = <div className="patient-more-panel"><Link href="/patient/people" onClick={closeMoreMenu} aria-current={peopleActive ? "page" : undefined}><Users aria-hidden size={24} /><span>People</span></Link><Link href="/patient/settings" onClick={closeMoreMenu} aria-current={settingsActive ? "page" : undefined}><Settings aria-hidden size={24} /><span>Settings</span></Link></div>;
  return <div className="patient-app"><a className="skip-link" href="#patient-main">Skip to content</a><header className="patient-header"><Link className="wordmark" href="/patient/today"><Leaf aria-hidden size={24} />hale.</Link><nav className="patient-top-nav" aria-label="Patient navigation">{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href || (href === "/patient/memories" && pathname.includes("/conversations/")) ? "page" : undefined}><Icon aria-hidden size={24} /><span>{label}</span></Link>)}</nav><div className="patient-header-tools"><AppearanceMenu /><Drawer className="patient-more-menu patient-header-more" summary={<><MoreHorizontal aria-hidden size={24} /><span>More</span></>} summaryProps={{ "aria-current": peopleActive || settingsActive ? "page" : undefined }}>{moreLinks}</Drawer></div></header>
      {mode === "demo" && <div className="patient-demo-label">Demo space · fictional memories · Oct 15, 2026</div>}
     {offline && <div className="info-strip" role="status">You’re offline. Unsent audio is temporary. Search and live answers need a connection.</div>}
     <div className="persistent-capture">{!pathname.endsWith("/today") && <RecorderCard compact />}</div>
        <main id="patient-main" className="patient-main">{children}</main><footer className="patient-footer"><p className="patient-disclaimer">Hale is a memory aid, not a medical service. Recordings may be incomplete or inaccurate.</p>{!isInstalled && <button className="text-link" onClick={() => void installApp()}>{installPrompt ? "Install Hale" : "Add Hale to your Home Screen"}<ArrowUpRight size={24} /></button>}{showGuide && !isInstalled && <section className="install-guide"><div><h3>A familiar place on your phone.</h3><button className="icon-button" onClick={() => setShowGuide(false)} aria-label="Close install guide" data-visible-label="Close"><X aria-hidden size={24} /></button></div>{isIos ? <p>In Safari, tap <Share size={24} aria-label="Share" /> Share, then <strong>Add to Home Screen</strong>. Use HTTPS. Installation doesn’t enable background recording.</p> : <p>Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>. Use HTTPS. Installation doesn’t enable background recording.</p>}</section>}<Link href="/family/overview" className="small text-link" onClick={(event) => { const snapshot = capture?.getSnapshot(); if (snapshot && (["starting", "recording"].includes(snapshot.phase) || snapshot.segments.length > 0) && !window.confirm("Leaving the patient experience stops recording and discards unsent audio. Download or upload any segments first. Leave anyway?")) event.preventDefault(); }}>Family website<ArrowUpRight size={24} /></Link></footer>
      <nav className="patient-bottom-nav" aria-label="Patient navigation">{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href || (href === "/patient/memories" && pathname.includes("/conversations/")) ? "page" : undefined}><Icon aria-hidden size={24} /><span>{label}</span></Link>)}<Drawer className="patient-more-menu patient-bottom-more" summary={<><MoreHorizontal aria-hidden size={24} /><span>More</span></>} summaryProps={{ "aria-current": peopleActive || settingsActive ? "page" : undefined }}>{moreLinks}</Drawer></nav>
  </div>;
}
