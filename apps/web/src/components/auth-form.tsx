"use client";

import Link from "next/link";
import { useState } from "react";
import { SignIn, SignUp, useAuth } from "@clerk/nextjs";
import { ArrowRight, FlaskConical, LockKeyhole, ShieldCheck } from "lucide-react";
import { AuthShell } from "./auth-shell";
import { appMode } from "@/lib/app-mode";
import { Button } from "./ui/button";
import styles from "./auth-terms.module.css";

const TERMS_VERSION = "2026-10-17";

const appearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorText: "var(--text)",
    colorTextSecondary: "var(--muted)",
    fontFamily: "inherit",
    borderRadius: "var(--radius-control)",
  },
  elements: {
    rootBox: "clerk-auth-root",
    cardBox: "clerk-auth-box",
    card: "clerk-auth-card",
    header: "clerk-auth-header",
    footer: "clerk-auth-footer",
    formFieldLabel: "clerk-auth-label",
    formFieldInput: "clerk-auth-input",
    formFieldAction: "clerk-auth-action",
    formButtonPrimary: "clerk-auth-submit",
    socialButtonsBlockButton: "clerk-auth-social",
    dividerLine: "clerk-auth-divider-line",
    dividerText: "clerk-auth-divider-text",
    footerActionLink: "clerk-auth-link",
  },
};

function LiveAuth({ signup, patient, termsAcceptedAt }: { signup: boolean; patient: boolean; termsAcceptedAt: string | null }) {
  const { isLoaded, isSignedIn } = useAuth();
  const destination = patient ? "/patient/today" : "/signup/voice";
  if (!isLoaded) {
    return <p role="status" className="muted">Opening a secure connection…</p>;
  }

  if (isSignedIn) {
    const nextStep = signup
      ? patient
        ? "Next, create your own private patient space."
        : "Next, introduce yourself and choose whether to set up your voice."
      : "Your private memory space is waiting for you.";

    return (
      <div className="auth-signed-in">
        <ShieldCheck size={28} />
        <h2>You’re signed in.</h2>
        <p className="muted">{nextStep}</p>
        <Button asChild variant="primary" size="lg"><Link href={signup ? destination : "/family/overview"}>
          {signup ? "Continue setup" : "Open my space"}
          <ArrowRight aria-hidden />
        </Link></Button>
      </div>
    );
  }

  return signup
    ? termsAcceptedAt
      ? <SignUp path={patient ? "/signup/patient" : "/signup"} routing="path" signInUrl="/login" forceRedirectUrl={destination} appearance={appearance} unsafeMetadata={{ termsOfServiceVersion: TERMS_VERSION, termsOfServiceAcceptedAt: termsAcceptedAt }} />
      : <p className="auth-terms-required" role="status">Agree to the Terms of Service above to continue creating your account.</p>
    : <SignIn path="/login" routing="path" signUpUrl="/signup" fallbackRedirectUrl="/family/overview" appearance={appearance} />;
}

function DemoAccess() {
  return <div className="auth-setup-notice" role="status">
    <FlaskConical aria-hidden size={24} />
    <h2>Demo account is ready.</h2>
    <p>Explore seeded fictional conversations, memories, appointments, medication notes, and care costs. Demo changes reset on reload; no live patient records or provider connections are used.</p>
    <div className="button-group">
      <Button asChild variant="primary"><Link href="/family/overview">Open family demo<ArrowRight aria-hidden /></Link></Button>
      <Button asChild variant="secondary"><Link href="/patient/today">Open patient demo<ArrowRight aria-hidden /></Link></Button>
    </div>
  </div>;
}

export function AuthPage({ signup = false, patient = false }: { signup?: boolean; patient?: boolean }) {
  const live = appMode === "live";
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);
  const introDescription = !signup
    ? "Log in to reconnect with the conversations, people, and little moments that matter."
    : patient
      ? "Create your own memory space. Keep the moments that matter close, and choose who can join your circle."
      : "Create your family account and help keep the moments that matter close.";

  return (
    <AuthShell signup={signup} patient={patient}>
      <div className="auth-intro">
        <p className="eyebrow">{signup ? "A little closer, even from afar" : "A familiar place to return to"}</p>
        <h1>
          {signup ? <>Good memories.<br /><span>Better together.</span></> : <>Welcome back.<br /><span>Make yourself at home.</span></>}
        </h1>
        <p>{introDescription}</p>
      </div>
      {signup && (
        <nav className="auth-account-type" aria-label="Who is this account for?">
          <Link href="/signup" aria-current={!patient ? "page" : undefined}>I’m a family member</Link>
          <Link href="/signup/patient" aria-current={patient ? "page" : undefined}>I’m here for myself</Link>
        </nav>
      )}
      {signup && <div className={styles.acceptance} role="group" aria-labelledby="terms-acceptance-label">
        <div className={styles.acceptanceControl}>
          <input id={patient ? "patient-terms-acceptance" : "family-terms-acceptance"} type="checkbox" checked={termsAcceptedAt !== null} onChange={(event) => setTermsAcceptedAt(event.currentTarget.checked ? new Date().toISOString() : null)} />
          <label id="terms-acceptance-label" htmlFor={patient ? "patient-terms-acceptance" : "family-terms-acceptance"}>I have read and agree to Hale’s Terms of Service.</label>
        </div>
        <Link href="/terms" target="_blank" rel="noreferrer">Read the Terms of Service<ArrowRight aria-hidden size={16} /></Link>
      </div>}
      {!live && (!signup || termsAcceptedAt !== null) && <DemoAccess />}
      {live && signup && <LiveAuth signup patient={patient} termsAcceptedAt={termsAcceptedAt} />}
      {live && !signup && <LoginPanel patient={patient} />}
      <p className="auth-privacy">
        <ShieldCheck size={15} />
        <span>{signup ? "Joining doesn’t grant access to anyone’s memories. Patient-space permission is always required." : "Your memories stay in your circle. Access is always permission-based."}</span>
      </p>
    </AuthShell>
  );
}

function LoginPanel({ patient }: { patient: boolean }) {
  return (
    <section className="auth-login-card" aria-label="Secure sign-in">
      <header className="auth-login-card-heading">
        <span className="auth-login-lock" aria-hidden="true"><LockKeyhole size={18} /></span>
        <div>
          <p className="eyebrow">Private account</p>
          <h2>Sign in securely</h2>
        </div>
      </header>
      <LiveAuth signup={false} patient={patient} termsAcceptedAt={null} />
    </section>
  );
}
