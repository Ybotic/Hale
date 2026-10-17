"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Banknote, CalendarDays, FlaskConical, Leaf, MessageCircle, MoreHorizontal, Search, Settings, Sparkles, Users, House } from "lucide-react";
import { useWorkspace } from "./providers";
import { PatientSwitcher } from "./patient-switcher";
import { AppearanceMenu } from "./appearance";
import { Drawer } from "./ui-primitives";

const navigation = [
  { label: "Overview", href: "/family/overview", Icon: House },
  { label: "Calendar", href: "/family/calendar", Icon: CalendarDays },
  { label: "Conversations", href: "/family/conversations", Icon: MessageCircle },
  { label: "Care & Tasks", href: "/family/care", Icon: Banknote },
  { label: "People", href: "/family/people", Icon: Users },
  { label: "Ask Hale", href: "/family/ask", Icon: Sparkles },
  { label: "Settings", href: "/family/settings", Icon: Settings },
];

export function FamilyShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { space, mode, patients, selectPatient, account } = useWorkspace();
  const closeMoreMenu = (event: React.MouseEvent<HTMLAnchorElement>) => event.currentTarget.closest("details")?.removeAttribute("open");
  return <div className="family-app">
    <a className="skip-link" href="#main">Skip to content</a>
     <header className="masthead"><div className="page-wrap"><div className="masthead-top"><div className="masthead-left"><Link className="wordmark" href="/family/overview"><Leaf aria-hidden size={23} strokeWidth={1.8} />hale.</Link><span className="header-divider" /><PatientSwitcher patient={space} patients={patients} onSelect={selectPatient} /></div><div className="masthead-right"><Link href="/patient/today" className="patient-view-link">Patient view<ArrowUpRight size={22} /></Link><Link href="/family/conversations" className="family-search" aria-label="Search conversations"><Search aria-hidden size={24} /><span>Search</span></Link><AppearanceMenu />{account}</div></div>
       <nav className="family-tabs" aria-label="Family navigation">{navigation.map(({ label, href, Icon }) => <Link key={href} href={href} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}><Icon aria-hidden size={22} /><span>{label}</span></Link>)}</nav>
     </div></header>
    {mode === "demo" && <div className="demo-banner"><div className="page-wrap"><span><FlaskConical size={14} /><strong>Demo space</strong><span className="demo-banner-description">Fictional people, synthetic memories. Nothing here is a live patient record.</span></span><Link href="/family/settings">About this demo<ArrowUpRight size={13} /></Link></div></div>}
     <main id="main" className="page-wrap family-main">{children}</main>
       <nav className="family-bottom-nav" aria-label="Family navigation">
       {navigation.slice(0, 4).map(({ label, href, Icon }) => <Link key={href} href={href} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}><Icon aria-hidden size={24} /><span>{label}</span></Link>)}
        <Drawer className="family-more-menu" summary={<><MoreHorizontal aria-hidden size={24} /><span>More</span></>} summaryProps={{ "aria-current": navigation.slice(4).some(({ href }) => pathname === href || pathname.startsWith(`${href}/`)) ? "page" : undefined }}><div className="family-more-panel">{navigation.slice(4).map(({ label, href, Icon }) => <Link key={href} href={href} onClick={closeMoreMenu} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}><Icon aria-hidden size={24} /><span>{label}</span></Link>)}</div></Drawer>
     </nav>
     <footer className="site-footer"><div className="page-wrap"><span className="footer-brand">hale. <span>your memories, always within reach.</span></span><p>A memory aid, not a medical service.<br />Recordings may be incomplete or inaccurate.</p></div></footer>
  </div>;
}
