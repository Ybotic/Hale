"use client";

import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "@/lib/utils";

export const ToggleGroup = ToggleGroupPrimitive.Root;

export const ToggleGroupItem = forwardRef<ElementRef<typeof ToggleGroupPrimitive.Item>, ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>>(function ToggleGroupItem({ className, ...props }, ref) {
  return <ToggleGroupPrimitive.Item ref={ref} className={cn("inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control border border-transparent px-3 py-2 text-base font-semibold text-text transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=on]:border-border data-[state=on]:bg-surface-2 data-[state=on]:text-primary", className)} {...props} />;
});
ToggleGroupItem.displayName = "ToggleGroupItem";
