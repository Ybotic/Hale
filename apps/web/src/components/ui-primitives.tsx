"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ChevronRight, Mic, type LucideIcon } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

export function Button({ variant = "primary", className = "", ...props }: ComponentPropsWithoutRef<"button"> & { variant?: ButtonVariant }) {
  const variantClass = variant === "secondary" ? "btn-quiet" : `btn-${variant}`;
  return <button {...props} className={`btn ${variantClass} ${className}`.trim()} />;
}

export function Card({ as: Element = "section", className = "", children, ...props }: {
  as?: "section" | "div";
  className?: string;
  children: ReactNode;
} & ComponentPropsWithoutRef<"section">) {
  return <Element {...props} className={`surface-card ${className}`.trim()}>{children}</Element>;
}

export function SegmentedControl<T extends string>({ label, value, options, onChange, className = "" }: {
  label: string;
  value: T;
  options: Array<{ value: T; label: ReactNode; Icon?: LucideIcon }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return <div className={`segmented-control ${className}`.trim()} role="group" aria-label={label}>
    {options.map(({ value: option, label: optionLabel, Icon }) => <Button key={option} type="button" variant="secondary" className="segmented-option" aria-pressed={value === option} onClick={() => onChange(option)}>{Icon && <Icon aria-hidden size={24} />}{optionLabel}</Button>)}
  </div>;
}

export function Tabs<T extends string>({ label, value, options, onChange, className = "" }: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; Icon?: LucideIcon }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return <div className={`care-tab-list ${className}`.trim()} role="group" aria-label={label}>
    {options.map(({ value: option, label: optionLabel, Icon }) => <button className="care-navigation-tab" type="button" key={option} aria-pressed={value === option} onClick={() => onChange(option)}>{Icon && <Icon aria-hidden size={24} />}{optionLabel}<ChevronRight aria-hidden className="care-tab-arrow" size={24} /></button>)}
  </div>;
}

export function Timeline({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <ol className={`shared-timeline ${className}`.trim()} aria-label={label}>{children}</ol>;
}

export function TimelineItem({ Icon, title, time, dateTime, status, StatusIcon }: { Icon: LucideIcon; title: string; time: ReactNode; dateTime?: string; status: string; StatusIcon?: LucideIcon }) {
  return <li className="shared-timeline-item"><span className="timeline-icon" aria-hidden="true"><Icon size={24} /></span><span className="timeline-content"><strong>{title}</strong><time dateTime={dateTime}>{time}</time></span><span className="timeline-status">{StatusIcon && <StatusIcon aria-hidden size={24} />}{status}</span></li>;
}

export function Toast({ children, className = "", role = "status" }: { children: ReactNode; className?: string; role?: "status" | "alert" }) {
  return <p className={`shared-toast ${className}`.trim()} role={role} aria-live={role === "alert" ? "assertive" : "polite"}>{children}</p>;
}

export function Skeleton({ label }: { label: string }) {
  return <div className="shared-skeleton" role="status" aria-live="polite"><span className="skeleton-label">{label}</span><span className="skeleton-bar skeleton-bar-long" aria-hidden="true" /><span className="skeleton-bar" aria-hidden="true" /></div>;
}

export function Drawer({ summary, className = "", summaryProps, children }: {
  summary: ReactNode;
  className?: string;
  summaryProps?: ComponentPropsWithoutRef<"summary">;
  children: ReactNode;
}) {
  return <details className={`shared-drawer ${className}`.trim()}><summary {...summaryProps}>{summary}</summary>{children}</details>;
}

export function Expander({ summary, className = "", children }: { summary: ReactNode; className?: string; children: ReactNode }) {
  return <details className={`shared-expander ${className}`.trim()}><summary>{summary}</summary>{children}</details>;
}

export const Dialog = forwardRef<HTMLDialogElement, ComponentPropsWithoutRef<"dialog">>(function Dialog({ className = "", ...props }, ref) {
  return <dialog {...props} ref={ref} className={`confirm-dialog ${className}`.trim()} />;
});
Dialog.displayName = "Dialog";

export function RecorderIndicator({ label, duration, elapsedSeconds }: { label: string; duration: string; elapsedSeconds: number }) {
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  return <span className="recording-indicator"><Mic aria-hidden size={24} /><span className="recording-state-label">{label}</span><time className="recording-time" aria-label={`Elapsed time ${duration}`} aria-live="off">{duration}</time><span className="sr-only" aria-live="polite">{label}. {elapsedMinutes} {elapsedMinutes === 1 ? "minute" : "minutes"} elapsed.</span></span>;
}
