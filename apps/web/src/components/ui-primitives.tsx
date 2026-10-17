"use client";

import type { ComponentType, ReactNode } from "react";
import { Mic } from "lucide-react";

export function Timeline({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <ol className={`shared-timeline ${className}`.trim()} aria-label={label}>{children}</ol>;
}

export function TimelineItem({ Icon, title, time, dateTime, status, StatusIcon }: {
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  time: ReactNode;
  dateTime?: string;
  status: string;
  StatusIcon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return <li className="shared-timeline-item"><span className="timeline-icon" aria-hidden="true"><Icon className="size-6" /></span><span className="timeline-content"><strong>{title}</strong><time dateTime={dateTime}>{time}</time></span><span className="timeline-status">{StatusIcon && <StatusIcon aria-hidden className="size-6" />}{status}</span></li>;
}

export function Skeleton({ label }: { label: string }) {
  return <div className="shared-skeleton" role="status" aria-live="polite"><span className="skeleton-label">{label}</span><span className="skeleton-bar skeleton-bar-long" aria-hidden="true" /><span className="skeleton-bar" aria-hidden="true" /></div>;
}

export function Expander({ summary, className = "", children }: { summary: ReactNode; className?: string; children: ReactNode }) {
  return <details className={`shared-expander ${className}`.trim()}><summary>{summary}</summary>{children}</details>;
}

export function RecorderIndicator({ label, duration, elapsedSeconds }: { label: string; duration: string; elapsedSeconds: number }) {
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  return <span className="recording-indicator"><Mic aria-hidden className="size-6" /><span className="recording-state-label">{label}</span><time className="recording-time" aria-label={`Elapsed time ${duration}`} aria-live="off">{duration}</time><span className="sr-only" aria-live="polite">{label}. {elapsedMinutes} {elapsedMinutes === 1 ? "minute" : "minutes"} elapsed.</span></span>;
}
