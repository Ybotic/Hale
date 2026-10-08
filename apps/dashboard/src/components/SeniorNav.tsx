"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export function SeniorNav() {
  const { seniorId } = useParams<{ seniorId: string }>();
  const base = `/seniors/${seniorId}`;
  const links = [
    ["Overview", base],
    ["Cognitive", `${base}/cognitive`],
    ["Transcript review", `${base}/transcripts`],
    ["Profile", `${base}/profile`],
    ["Medications", `${base}/medications`],
    ["Emergency contacts", `${base}/contacts`],
    ["Bills", `${base}/bills`],
  ] as const;

  return (
    <nav className="mx-auto flex max-w-6xl flex-wrap gap-2 px-5 pt-6" aria-label="Senior records">
      {links.map(([label, href]) => (
        <Link key={href} href={href} className="rounded-full border border-hale-100 bg-white px-4 py-2 text-sm hover:border-hale-700">{label}</Link>
      ))}
    </nav>
  );
}
