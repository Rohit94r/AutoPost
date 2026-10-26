import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./misc";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-linear-to-b from-[#b6f5c9] to-[#6fe3a1] text-ink shadow-[0_8px_30px_-8px_rgba(110,231,161,0.6)] hover:brightness-105 hover:shadow-[0_10px_36px_-8px_rgba(110,231,161,0.8)] active:scale-[0.98]",
        light: "bg-white text-ink hover:bg-white/90 active:scale-[0.98]",
        glass: "glass rounded-xl! text-mist hover:bg-white/15 active:scale-[0.98]",
        ghost: "text-fog hover:text-mist hover:bg-white/8",
        outline: "border border-white/20 text-mist hover:bg-white/8 hover:border-white/30",
        danger: "bg-red-500/85 text-white hover:bg-red-500 active:scale-[0.98]",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-lg",
        md: "h-10 px-4 text-sm rounded-xl",
        lg: "h-12 px-6 text-base rounded-2xl",
        icon: "size-9 rounded-xl",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Spinner className="size-4" />}
          {children}
        </>
      )}
    </Comp>
  );
});
Button.displayName = "Button";

export { buttonVariants };
