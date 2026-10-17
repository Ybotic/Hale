"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = forwardRef<ElementRef<typeof DialogPrimitive.Overlay>, ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(function DialogOverlay({ className, ...props }, ref) {
  return <DialogPrimitive.Overlay ref={ref} data-slot="dialog-overlay" className={cn("fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]", className)} {...props} />;
});
DialogOverlay.displayName = "DialogOverlay";

export const DialogContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }>(function DialogContent({ className, children, showCloseButton = false, onInteractOutside, ...props }, ref) {
  return <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content ref={ref} data-slot="dialog-content" onInteractOutside={(event) => { onInteractOutside?.(event); if (!event.defaultPrevented) event.preventDefault(); }} className={cn("fixed left-1/2 top-1/2 z-50 grid max-h-[88dvh] w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-panel border border-border bg-surface p-6 text-text shadow-soft focus:outline-none", className)} {...props}>
      {children}
      {showCloseButton && <DialogPrimitive.Close asChild><Button type="button" variant="ghost" className="absolute right-3 top-3" aria-label="Close dialog"><X aria-hidden />Close</Button></DialogPrimitive.Close>}
    </DialogPrimitive.Content>
  </DialogPortal>;
});
DialogContent.displayName = "DialogContent";

export function DialogHeader({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("grid gap-2 pr-10", className)} {...props} />;
}

export const DialogTitle = forwardRef<ElementRef<typeof DialogPrimitive.Title>, ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(function DialogTitle({ className, ...props }, ref) {
  return <DialogPrimitive.Title ref={ref} className={cn("text-xl font-semibold leading-tight tracking-tight text-text sm:text-2xl", className)} {...props} />;
});
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = forwardRef<ElementRef<typeof DialogPrimitive.Description>, ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(function DialogDescription({ className, ...props }, ref) {
  return <DialogPrimitive.Description ref={ref} className={cn("text-base leading-relaxed text-muted", className)} {...props} />;
});
DialogDescription.displayName = "DialogDescription";

export function DialogFooter({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("flex flex-wrap justify-end gap-3", className)} {...props} />;
}
