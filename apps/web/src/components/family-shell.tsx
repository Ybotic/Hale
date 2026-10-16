"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Leaf, Search, FlaskConical } from "lucide-react";
import { useWorkspace } from "./providers";
import { PatientSwitcher } from "./patient-switcher";

const navigation = [
  ["Overview", "/family/overview"], ["Calendar", "/family/calendar"],
  ["Conversations", "/family/conversations"], ["Care & Tasks", "/family/care"],
  ["People", "/family/people"], ["Ask Hale", "/family/ask"], ["Settings", "/family/settings"],
];

export function FamilyShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { space, mode, patients, selectPatient, account } = useWorkspace();
  return <div className="family-app">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="masthead"><div className="page-wrap"><div className="masthead-top"><div className="masthead-left"><Link className="wordmark" href="/family/overview"><Leaf aria-hidden size={23} strokeWidth={1.8} />hale.</Link><span className="header-divider" /><PatientSwitcher patient={space} patients={patients} onSelect={selectPatient} /></div><div className="masthead-right"><Link href="/patient/today" className="patient-view-link">Patient view<ArrowUpRight size={14} /></Link><Link href="/family/conversations" className="icon-button" aria-label="Search conversations"><Search size={19} /></Link>{account}</div></div>
      <nav className="family-tabs" aria-label="Family navigation">{navigation.map(([label, href]) => <Link key={href} href={href} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}>{label}</Link>)}</nav>
    </div></header>
    {mode === "demo" && <div className="demo-banner"><div className="page-wrap"><span><FlaskConical size={14} /><strong>Demo space</strong><span className="demo-banner-description">Fictional people, synthetic memories. Nothing here is a live patient record.</span></span><Link href="/family/settings">About this demo<ArrowUpRight size={13} /></Link></div></div>}
    <main id="main" className="page-wrap family-main">{children}</main>
    <footer className="site-footer"><div className="page-wrap"><span className="footer-brand">hale. <span>your memories, always within reach.</span></span><p>A memory aid, not a medical service.<br />Recordings may be incomplete or inaccurate.</p></div></footer>
  </div>;
}
