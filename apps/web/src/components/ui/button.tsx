"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { LoaderCircle } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex min-w-0 max-w-full shrink-0 items-center justify-center gap-2 whitespace-normal rounded-control text-center font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-6 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "border border-primary bg-primary text-primary-foreground hover:brightness-[.96]",
        secondary: "border border-border bg-surface text-text hover:bg-surface-2",
        ghost: "border border-transparent bg-transparent text-text hover:bg-surface-2",
        destructive: "border border-danger bg-danger text-danger-foreground hover:brightness-[.96]",
      },
      size: {
        md: "min-h-11 px-4 py-2 text-base",
        lg: "min-h-14 px-5 py-3 text-lg",
        sm: "min-h-11 px-3 py-2 text-base",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  pending?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  asChild = false,
  variant,
  size,
  className,
  children,
  pending = false,
  disabled,
  ...props
}, ref) {
  const Component = asChild ? Slot : "button";
  return <Component
    {...props}
    ref={ref}
    className={cn(buttonVariants({ variant, size }), className)}
    disabled={disabled || pending}
    aria-busy={pending || undefined}
  >
    {asChild ? children : <>{pending && <LoaderCircle aria-hidden className="animate-spin" />}{children}</>}
  </Component>;
});
Button.displayName = "Button";
