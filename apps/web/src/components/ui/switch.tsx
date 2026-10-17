"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Switch = forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(function Switch({ className, ...props }, ref) {
  return <SwitchPrimitive.Root
    ref={ref}
    className={cn("peer relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-border bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:border-primary data-[state=checked]:bg-primary", className)}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-5 translate-x-0.5 rounded-full bg-surface shadow-sm transition-transform data-[state=checked]:translate-x-[1.35rem] data-[state=checked]:bg-primary-foreground" />
  </SwitchPrimitive.Root>;
});
Switch.displayName = "Switch";

export function SwitchField({ id, label, description, className, ...props }: ComponentPropsWithoutRef<typeof Switch> & { label: ReactNode; description?: ReactNode }) {
  return <label className={cn("flex min-h-11 cursor-pointer items-center justify-between gap-4 text-base leading-relaxed text-text", className)} htmlFor={id}>
    <span className="min-w-0">{label}{description && <span className="mt-1 block text-base text-muted">{description}</span>}</span>
    <Switch id={id} {...props} />
  </label>;
}
