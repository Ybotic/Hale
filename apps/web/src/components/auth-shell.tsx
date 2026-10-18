import Link from "next/link";
import { ArrowUpRight, AudioLines, Check, Leaf, LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import { FadeIn } from "./motion-primitives";
import { familyEditorialFonts } from "./family-fonts";

export function AuthShell({ children, signup = false, step = 0, patient = false }: { children: ReactNode; signup?: boolean; step?: number; patient?: boolean }) {
  return <div className={`auth-page ${familyEditorialFonts}`}>
    <a className="skip-link" href="#auth-main">Skip to content</a>
    <aside className="auth-story" aria-label="About Hale">
      <Link href="/" className="wordmark"><Leaf size={26} strokeWidth={1.7} aria-hidden />hale.</Link>
      <div className="auth-story-body">
        <p className="eyebrow">The little things are the big things.</p>
        <h2>Some moments<br />deserve to<br /><span>stay with you.</span></h2>
        <p>A familiar voice. A shared story. A little reminder of a day well spent. Keep the people and moments that matter within reach.</p>
        <div className="auth-memory" aria-label="Illustration of a saved conversation, not a real recording">
          <div className="auth-memory-top"><span className="auth-memory-icon"><AudioLines size={24} /></span><span className="eyebrow">A moment to keep</span><span className="mono">00:24</span></div>
          <div className="auth-wave" aria-hidden>{Array.from({ length: 45 }, (_, i) => <i key={i} style={{ height: `${Math.round(8 + Math.abs(Math.sin(i * 1.9) * Math.cos(i * .37)) * 39)}px` }} />)}</div>
          <p>“We should do this more often.”</p>
          <span className="auth-memory-caption">The conversations that bring us closer.</span>
        </div>
      </div>
      <div className="auth-story-footer"><LockKeyhole size={14} /><span>Personal memories. Shared only with permission.</span></div>
    </aside>
    <div className="auth-content">
      <header className="auth-header"><Link className="wordmark auth-mobile-brand" href="/"><Leaf size={22} />hale.</Link><p>{signup ? "Already part of the circle?" : "New to Hale?"} <Link href={signup ? "/login" : "/signup"}>{signup ? "Log in" : "Join us"}<ArrowUpRight size={14} /></Link></p></header>
      <main id="auth-main" className="auth-main">
        {signup && <ol className="auth-steps" aria-label="Signup progress">{["Your account", patient ? "Your space" : "Your voice", "You’re ready"].map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={index <= step ? "is-active" : ""}><span>{index < step ? <Check size={12} /> : `0${index + 1}`}</span>{label}</li>)}</ol>}
        <FadeIn delay={0.05}>{children}</FadeIn>
      </main>
      <footer className="auth-footer"><span>Your memories, always within reach.</span><p>A personal memory aid. Not a medical service.</p></footer>
    </div>
  </div>;
}
