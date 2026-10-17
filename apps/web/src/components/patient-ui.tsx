"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";

export function PatientIconBox({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`patient-icon-box ${className}`.trim()} aria-hidden="true">{children}</span>;
}

export function PatientTileLink({
  href,
  icon,
  title,
  description,
  className = "",
  onClick,
  id,
  ariaCurrent,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description?: string;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  id?: string;
  ariaCurrent?: "page" | undefined;
}) {
  return <Link id={id} href={href} onClick={onClick} aria-current={ariaCurrent} className={`patient-box-tile patient-tile-link ${className}`.trim()}>
    <PatientIconBox>{icon}</PatientIconBox>
    <span className="patient-tile-copy"><strong>{title}</strong>{description && <span>{description}</span>}</span>
    <ChevronRight className="patient-tile-arrow" aria-hidden />
  </Link>;
}

export function PatientTileButton({
  icon,
  title,
  description,
  onClick,
  className = "",
  disabled = false,
  pending = false,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  pending?: boolean;
}) {
  return <Button type="button" variant="secondary" onClick={onClick} disabled={disabled || pending} aria-busy={pending || undefined} className={`patient-box-tile patient-tile-button ${className}`.trim()}>
    <PatientIconBox>{pending ? <LoaderCircle aria-hidden className="patient-pending-spinner" /> : icon}</PatientIconBox>
    <span className="patient-tile-copy"><strong>{pending ? "Opening…" : title}</strong>{description && <span>{description}</span>}</span>
    <ArrowRight className="patient-tile-arrow" aria-hidden />
  </Button>;
}

export function PatientBackLink({ href, onClick }: { href: string; onClick?: React.MouseEventHandler<HTMLAnchorElement> }) {
  return <Link className="patient-back-button" href={href} onClick={onClick}><ArrowLeft aria-hidden />Back</Link>;
}
