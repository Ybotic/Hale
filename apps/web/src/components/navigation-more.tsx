"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";

export type MoreLink = { href: string; label: string; Icon: LucideIcon; current?: boolean };

function LinkList({ items, close = false }: { items: MoreLink[]; close?: boolean }) {
  const links = items.map(({ href, label, Icon, current }) => <Link key={href} className="more-link" href={href} aria-current={current ? "page" : undefined}><Icon aria-hidden className="size-6" /><span>{label}</span></Link>);
  return <nav className="more-link-list" aria-label="More pages">{close ? links.map((link) => <SheetClose key={link.key} asChild>{link}</SheetClose>) : links}</nav>;
}

export function MorePopover({ items, current = false }: { items: MoreLink[]; current?: boolean }) {
  return <Popover>
    <PopoverTrigger asChild><Button type="button" variant="ghost" className="more-trigger" aria-current={current ? "page" : undefined}><MoreHorizontal aria-hidden className="size-6" /><span>More</span></Button></PopoverTrigger>
    <PopoverContent className="more-popover"><LinkList items={items} /></PopoverContent>
  </Popover>;
}

export function MoreSheet({ items, current = false, className = "" }: { items: MoreLink[]; current?: boolean; className?: string }) {
  return <Sheet>
    <SheetTrigger asChild><Button type="button" variant="ghost" className={`more-trigger ${className}`} aria-current={current ? "page" : undefined}><MoreHorizontal aria-hidden className="size-6" /><span>More</span></Button></SheetTrigger>
    <SheetContent side="bottom" className="more-sheet">
      <SheetHeader><SheetTitle>More pages</SheetTitle><SheetDescription>People, Ask Hale, and settings.</SheetDescription></SheetHeader>
      <LinkList items={items} close />
    </SheetContent>
  </Sheet>;
}
