"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Checkbox = forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>>(function Checkbox({ className, ...props }, ref) {
  return <CheckboxPrimitive.Root
    ref={ref}
    className={cn("peer inline-grid size-6 shrink-0 place-items-center rounded-md border border-border bg-surface text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:border-primary data-[state=checked]:bg-primary", className)}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="grid place-items-center"><Check aria-hidden className="size-4" strokeWidth={2.5} /></CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>;
});
Checkbox.displayName = "Checkbox";

export function CheckboxField({ id, label, description, className, ...props }: ComponentPropsWithoutRef<typeof Checkbox> & { label: ReactNode; description?: ReactNode }) {
  return <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 text-base leading-relaxed text-text", className)} htmlFor={id}>
    <Checkbox id={id} {...props} />
    <span className="min-w-0">{label}{description && <span className="mt-1 block text-base text-muted">{description}</span>}</span>
  </label>;
}
