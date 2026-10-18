"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, CalendarDays, House, Leaf, MessageCircle, MoreHorizontal, Settings, Share, Smartphone, Users, X } from "lucide-react";
import { dateLabel } from "@hale/contracts/time";
import { useWorkspace } from "./providers";
import { RecorderCard, RecordingProvider, useRecordingController } from "./recorder";
import { AppearanceMenu } from "./appearance";
import { Button } from "./ui/button";
import { PatientBackLink, PatientTileButton, PatientTileLink } from "./patient-ui";
import { familyEditorialFonts } from "./family-fonts";

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
  const { today } = useWorkspace();
  const capture = useRecordingController();
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [installing, setInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installStateReady, setInstallStateReady] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [offline, setOffline] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const pageTitle = patientPageTitle(pathname);
  const isToday = pathname === "/patient/today" || pathname === "/patient";
  const backHref = pathname.includes("/conversations/") ? "/patient/memories" : "/patient/today";
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.dataset.patientApp;
    html.dataset.patientApp = "true";
    return () => {
      if (previous === undefined) delete html.dataset.patientApp;
      else html.dataset.patientApp = previous;
    };
  }, []);
  useEffect(() => {
    const connection = () => setOffline(!navigator.onLine);
    const standalone = () => {
      const iosNavigator = navigator as Navigator & { standalone?: boolean };
      setIsInstalled(window.matchMedia("(display-mode: standalone)").matches || iosNavigator.standalone === true);
      setInstallStateReady(true);
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
  useEffect(() => {
    const closeMore = () => setMoreOpen(false);
    window.addEventListener("popstate", closeMore);
    return () => window.removeEventListener("popstate", closeMore);
  }, []);
  async function installApp() {
    if (!installPrompt) { setShowGuide((visible) => !visible); return; }
    setInstalling(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") setIsInstalled(true);
    } finally { setInstalling(false); }
  }
  const familyWebsiteClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const snapshot = capture?.getSnapshot();
    if (snapshot && (["starting", "recording"].includes(snapshot.phase) || snapshot.segments.length > 0) && !window.confirm("Leaving the patient experience stops recording and discards unsent audio. Download or upload any segments first. Leave anyway?")) { event.preventDefault(); return; }
    setMoreOpen(false);
  };
  const navigation = [{ href: "/patient/today", label: "Today", icon: House }, { href: "/patient/ask", label: "Ask Hale", icon: MessageCircle }, { href: "/patient/memories", label: "Memories", icon: CalendarDays }];
  const peopleActive = pathname === "/patient/people";
  const settingsActive = pathname === "/patient/settings";
  const visibleTabActive = navigation.some(({ href }) => pathname === href || (href === "/patient/memories" && pathname.includes("/conversations/")));
  const moreCurrent = moreOpen || peopleActive || settingsActive || !visibleTabActive;
  const installDescription = "Add Hale to your Home Screen";
  return <div className={`patient-app ${familyEditorialFonts}`}>
    <a className="skip-link" href="#patient-main">Skip to content</a>
    <header className="patient-header">
      <div className="patient-header-top">
        <Link className="wordmark" href="/patient/today"><span className="patient-brand-icon" aria-hidden="true"><Leaf size={19} strokeWidth={2} /></span><span>hale.</span></Link>
        {(!isToday || moreOpen) && <div className="patient-header-context"><strong>{moreOpen ? "More" : pageTitle}</strong></div>}
      </div>
      <div className="patient-date-strip"><strong>Today is {dateLabel(today, { weekday: "long", month: "long", day: "numeric" })}</strong></div>
    </header>
    {installStateReady && !isInstalled && isToday && <aside className="patient-install-prompt" aria-label="Install Hale">
      <div className="patient-install-copy"><span className="patient-install-icon" aria-hidden="true"><Smartphone /></span><div><strong>Hale, right on your Home Screen.</strong><p>Open it full-screen, like an app.</p></div></div>
      <Button type="button" variant="secondary" pending={installing} onClick={() => void installApp()}>{installPrompt ? "Install Hale" : "Show me how"}</Button>
      {showGuide && <InstallGuide isIos={isIos} onClose={() => setShowGuide(false)} />}
    </aside>}
    {offline && <div className="info-strip" role="status">You’re offline. Unsent audio is temporary. Search and live answers need a connection.</div>}
    {(!isToday || moreOpen) && <div className="persistent-capture"><RecorderCard compact /></div>}
    <main id="patient-main" className={`patient-main${moreOpen ? " patient-main-more" : ""}`}>
      {moreOpen ? <PatientMoreScreen
        isInstalled={isInstalled}
        installDescription={installDescription}
        onBack={() => setMoreOpen(false)}
        onNavigate={() => setMoreOpen(false)}
        onInstall={() => void installApp()}
        installing={installing}
        showGuide={showGuide}
        setShowGuide={setShowGuide}
        isIos={isIos}
        familyWebsiteClick={familyWebsiteClick}
        peopleActive={peopleActive}
        settingsActive={settingsActive}
      /> : <>
        {!isToday && <PatientBackLink href={backHref} />}
        {children}
      </>}
    </main>
    <nav className="patient-bottom-nav" aria-label="Patient navigation">
      {navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={!moreOpen && (pathname === href || (href === "/patient/memories" && pathname.includes("/conversations/"))) ? "page" : undefined} onClick={() => setMoreOpen(false)}><Icon aria-hidden /><span>{label}</span></Link>)}
      <button type="button" className="patient-bottom-more" aria-current={moreCurrent ? "page" : undefined} onClick={() => setMoreOpen((open) => !open)}><MoreHorizontal aria-hidden /><span>More</span></button>
    </nav>
  </div>;
}

function PatientMoreScreen({ isInstalled, installDescription, onBack, onNavigate, onInstall, installing, showGuide, setShowGuide, isIos, familyWebsiteClick, peopleActive, settingsActive }: {
  isInstalled: boolean;
  installDescription: string;
  onBack: () => void;
  onNavigate: () => void;
  onInstall: () => void;
  installing: boolean;
  showGuide: boolean;
  setShowGuide: (show: boolean) => void;
  isIos: boolean;
  familyWebsiteClick: React.MouseEventHandler<HTMLAnchorElement>;
  peopleActive: boolean;
  settingsActive: boolean;
}) {
  return <section className="patient-more-screen" aria-labelledby="patient-more-title">
    <button type="button" className="patient-back-button" onClick={onBack}><ArrowLeft aria-hidden />Back</button>
    <h1 id="patient-more-title">More</h1>
    <div className="patient-more-tiles">
      <AppearanceMenu patient patientFontClass={familyEditorialFonts} />
      <PatientTileLink href="/family/overview" icon={<Users />} title="Family website" onClick={familyWebsiteClick} />
      {!isInstalled && <PatientTileButton icon={<Smartphone />} title="Install Hale" description={installDescription} pending={installing} onClick={onInstall} />}
      <PatientTileLink href="/patient/people" icon={<Users />} title="People" ariaCurrent={peopleActive ? "page" : undefined} onClick={onNavigate} />
      <PatientTileLink href="/patient/settings" icon={<Settings />} title="Settings" ariaCurrent={settingsActive ? "page" : undefined} onClick={onNavigate} />
    </div>
    {showGuide && !isInstalled && <InstallGuide isIos={isIos} onClose={() => setShowGuide(false)} />}
  </section>;
}

function InstallGuide({ isIos, onClose }: { isIos: boolean; onClose: () => void }) {
  return <section className="install-guide" aria-label="How to install Hale"><div><h3>Open Hale like an app.</h3><Button variant="secondary" className="install-guide-close" onClick={onClose}><X aria-hidden />Close</Button></div>{isIos ? <p>In Safari, tap <Share aria-hidden /> Share, choose <strong>Add to Home Screen</strong>, then open Hale from its new Home Screen icon. Installation doesn’t enable background recording.</p> : <p>Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>, then open Hale from its new icon. Installation doesn’t enable background recording.</p>}</section>;
}

function patientPageTitle(pathname: string) {
  if (pathname === "/patient/ask") return "Ask Hale";
  if (pathname === "/patient/memories") return "Memories";
  if (pathname.includes("/patient/conversations/")) return "Conversation";
  if (pathname === "/patient/care") return "Care & Tasks";
  if (pathname === "/patient/people") return "People";
  if (pathname === "/patient/settings") return "Settings";
  return "Today";
}
