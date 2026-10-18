"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Banknote, CalendarDays, Leaf, MessageCircle, Search, Settings, Sparkles, Users, House } from "lucide-react";
import { useWorkspace } from "./providers";
import { PatientSwitcher } from "./patient-switcher";
import { AppearanceMenu, useReducedMotionPreference } from "./appearance";
import { MoreSheet } from "./navigation-more";
import { familyEditorialFonts } from "./family-fonts";

const navigation = [
  { label: "Overview", mobileLabel: "Home", href: "/family/overview", Icon: House },
  { label: "Calendar", mobileLabel: "Dates", href: "/family/calendar", Icon: CalendarDays },
  { label: "Conversations", mobileLabel: "Chats", href: "/family/conversations", Icon: MessageCircle },
  { label: "Care & Tasks", mobileLabel: "Care", href: "/family/care", Icon: Banknote },
  { label: "People", href: "/family/people", Icon: Users },
  { label: "Ask Hale", href: "/family/ask", Icon: Sparkles },
  { label: "Settings", href: "/family/settings", Icon: Settings },
];

export function FamilyShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotionPreference();
  const { space, patients, selectPatient, account } = useWorkspace();

  useEffect(() => {
    const html = document.documentElement;
    const fontClasses = familyEditorialFonts.split(/\s+/).filter(Boolean);
    html.classList.add(...fontClasses);
    return () => html.classList.remove(...fontClasses);
  }, []);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".family-app");
    if (!root) return;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const targets = Array.from(root.querySelectorAll<HTMLElement>(
      ".page-intro h1, .recap-layout, .today-band, .memory-card, .conversation-row, .calendar-panel, .day-heading, .chat-column, .person-card, .settings-card",
    )).map((element) => ({
      element,
      transform: element.style.transform,
      transition: element.style.transition,
    }));
    let offset = 0;
    let animationFrame = 0;
    let settleTimer = 0;
    let transitionCleanupTimer = 0;

    const restoreImmediately = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (settleTimer) window.clearTimeout(settleTimer);
      if (transitionCleanupTimer) window.clearTimeout(transitionCleanupTimer);
      animationFrame = 0;
      settleTimer = 0;
      transitionCleanupTimer = 0;
      for (const target of targets) {
        target.element.style.transform = target.transform;
        target.element.style.transition = target.transition;
      }
    };

    const settle = () => {
      settleTimer = 0;
      for (const target of targets) {
        target.element.style.transition = "transform 260ms cubic-bezier(.2,.8,.2,1)";
        target.element.style.transform = target.transform;
      }
      transitionCleanupTimer = window.setTimeout(() => {
        for (const target of targets) target.element.style.transition = target.transition;
        transitionCleanupTimer = 0;
      }, 280);
    };

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || reduceMotion || motionPreference.matches || document.documentElement.dataset.reduceMotion === "reduce") return;
      event.preventDefault();
      if (transitionCleanupTimer) {
        window.clearTimeout(transitionCleanupTimer);
        transitionCleanupTimer = 0;
      }
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      offset = Math.max(-16, Math.min(16, -event.deltaY * unit * .16));
      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(() => {
          animationFrame = 0;
          targets.forEach((target, index) => {
            const stagger = .58 + (index % 5) * .1;
            target.element.style.transition = "transform 120ms ease-out";
            target.element.style.transform = `translate3d(0, ${offset * stagger}px, 0)`;
          });
        });
      }
      if (settleTimer) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, 160);
    };

    const handleMotionChange = () => {
      if (motionPreference.matches) restoreImmediately();
    };

    root.addEventListener("wheel", handleWheel, { passive: false });
    motionPreference.addEventListener("change", handleMotionChange);
    return () => {
      root.removeEventListener("wheel", handleWheel);
      motionPreference.removeEventListener("change", handleMotionChange);
      restoreImmediately();
    };
  }, [pathname, reduceMotion]);

  return <div className={`family-app ${familyEditorialFonts}`}>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="masthead"><div className="page-wrap"><div className="masthead-top"><div className="masthead-left"><Link className="wordmark" href="/family/overview"><Leaf aria-hidden size={23} strokeWidth={1.8} />hale.</Link><span className="header-divider" /><PatientSwitcher patient={space} patients={patients} onSelect={selectPatient} /></div><div className="masthead-right"><Link href="/patient/today" className="patient-view-link">Patient view<ArrowUpRight size={22} /></Link><Link href="/family/conversations" className="family-search" aria-label="Search conversations"><Search aria-hidden size={24} /><span>Search</span></Link><AppearanceMenu editorial editorialFontClass={familyEditorialFonts} />{account}</div></div>
       <nav className="family-tabs" aria-label="Family navigation">{navigation.map(({ label, href, Icon }) => <Link key={href} href={href} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}><Icon aria-hidden size={22} /><span>{label}</span></Link>)}</nav>
     </div></header>
      <main id="main" className="page-wrap family-main">{children}</main>
       <nav className="family-bottom-nav" aria-label="Family navigation">
        {navigation.slice(0, 4).map(({ label, mobileLabel, href, Icon }) => <Link key={href} href={href} aria-label={label} title={label} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}><Icon aria-hidden size={24} /><span>{mobileLabel}</span></Link>)}
        <MoreSheet className="family-more-sheet" items={navigation.slice(4).map(({ label, href, Icon }) => ({ label, href, Icon, current: pathname === href || pathname.startsWith(`${href}/`) }))} current={navigation.slice(4).some(({ href }) => pathname === href || pathname.startsWith(`${href}/`))} />
     </nav>
      <footer className="site-footer"><div className="page-wrap"><span className="footer-brand">hale. <span>your memories, always within reach.</span></span></div></footer>
  </div>;
}
