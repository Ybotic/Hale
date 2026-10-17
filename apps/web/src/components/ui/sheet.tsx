"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export const SheetContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: "top" | "bottom" }>(function SheetContent({ className, children, side = "bottom", ...props }, ref) {
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay data-slot="sheet-overlay" className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
    <DialogPrimitive.Content ref={ref} data-slot="sheet-content" className={cn(
      "fixed z-50 max-h-[88dvh] w-full overflow-y-auto border border-border bg-surface p-5 text-text shadow-soft focus:outline-none",
      side === "bottom" ? "inset-x-0 bottom-0 rounded-t-2xl" : "inset-x-0 top-0 rounded-b-2xl",
      className,
    )} {...props}>
      <div aria-hidden className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-border" />
      {children}
      <DialogPrimitive.Close asChild><Button type="button" variant="ghost" className="sheet-close"><X aria-hidden />Close</Button></DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>;
});
SheetContent.displayName = "SheetContent";

export function SheetHeader({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("mb-5 grid gap-2 pr-20", className)} {...props} />;
}

export const SheetTitle = forwardRef<ElementRef<typeof DialogPrimitive.Title>, ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(function SheetTitle({ className, ...props }, ref) {
  return <DialogPrimitive.Title ref={ref} className={cn("text-xl font-semibold leading-tight tracking-tight text-text", className)} {...props} />;
});
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = forwardRef<ElementRef<typeof DialogPrimitive.Description>, ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(function SheetDescription({ className, ...props }, ref) {
  return <DialogPrimitive.Description ref={ref} className={cn("text-base leading-relaxed text-muted", className)} {...props} />;
});
SheetDescription.displayName = "SheetDescription";
