import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-8 items-center gap-2 rounded-full border border-border px-3 py-1 text-base font-semibold leading-tight text-text",
  { variants: { variant: {
    neutral: "bg-surface",
    success: "border-success bg-success/10 text-text",
    warning: "border-warning bg-warning/10 text-text",
    danger: "border-danger bg-danger/10 text-text",
  } }, defaultVariants: { variant: "neutral" } },
);

export function Badge({ className, variant, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
