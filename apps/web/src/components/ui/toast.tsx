"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "@/lib/utils";

export const ToastProvider = ToastPrimitive.Provider;

export const ToastViewport = forwardRef<ElementRef<typeof ToastPrimitive.Viewport>, ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>>(function ToastViewport({ className, ...props }, ref) {
  return <ToastPrimitive.Viewport ref={ref} data-slot="toast-viewport" className={cn("fixed bottom-4 right-4 z-[100] flex max-h-[80vh] w-[min(92vw,26rem)] flex-col gap-3 outline-none", className)} {...props} />;
});
ToastViewport.displayName = "ToastViewport";

export const Toast = forwardRef<ElementRef<typeof ToastPrimitive.Root>, ComponentPropsWithoutRef<typeof ToastPrimitive.Root>>(function Toast({ className, ...props }, ref) {
  return <ToastPrimitive.Root ref={ref} data-slot="toast" className={cn("grid gap-1 rounded-xl border border-border bg-surface p-4 text-text shadow-soft data-[state=open]:animate-in data-[state=closed]:animate-out", className)} {...props} />;
});
Toast.displayName = "Toast";

export const ToastTitle = forwardRef<ElementRef<typeof ToastPrimitive.Title>, ComponentPropsWithoutRef<typeof ToastPrimitive.Title>>(function ToastTitle({ className, ...props }, ref) {
  return <ToastPrimitive.Title ref={ref} className={cn("font-semibold", className)} {...props} />;
});
ToastTitle.displayName = "ToastTitle";

export const ToastDescription = forwardRef<ElementRef<typeof ToastPrimitive.Description>, ComponentPropsWithoutRef<typeof ToastPrimitive.Description>>(function ToastDescription({ className, ...props }, ref) {
  return <ToastPrimitive.Description ref={ref} className={cn("text-base leading-relaxed text-muted", className)} {...props} />;
});
ToastDescription.displayName = "ToastDescription";
