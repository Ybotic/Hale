"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(function TabsList({ className, ...props }, ref) {
  return <TabsPrimitive.List ref={ref} className={cn("flex min-h-11 max-w-full flex-wrap items-center gap-1", className)} {...props} />;
});
TabsList.displayName = "TabsList";

export const TabsTrigger = forwardRef<ElementRef<typeof TabsPrimitive.Trigger>, ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(function TabsTrigger({ className, ...props }, ref) {
  return <TabsPrimitive.Trigger ref={ref} className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-3 py-2 text-base font-semibold text-text transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-surface-2 data-[state=active]:text-primary", className)} {...props} />;
});
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = forwardRef<ElementRef<typeof TabsPrimitive.Content>, ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(function TabsContent({ className, ...props }, ref) {
  return <TabsPrimitive.Content ref={ref} className={cn("focus-visible:outline-none", className)} {...props} />;
});
TabsContent.displayName = "TabsContent";
