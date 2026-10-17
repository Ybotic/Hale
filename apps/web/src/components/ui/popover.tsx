"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export const PopoverContent = forwardRef<ElementRef<typeof PopoverPrimitive.Content>, ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>>(function PopoverContent({ className, align = "end", sideOffset = 8, ...props }, ref) {
  return <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content ref={ref} data-slot="popover-content" align={align} sideOffset={sideOffset} className={cn("z-50 w-[min(92vw,30rem)] rounded-xl border border-border bg-surface p-4 text-text shadow-soft outline-none", className)} {...props} />
  </PopoverPrimitive.Portal>;
});
PopoverContent.displayName = "PopoverContent";
