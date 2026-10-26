"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Fades/slides content in when it scrolls into view (respects reduced motion via CSS). */
export function Reveal({ children, className, delay = 0, as: Tag = "div" }: { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "section" | "li" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement & HTMLLIElement>}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn("transition-all duration-1000 ease-[cubic-bezier(.2,.8,.2,1)]", shown ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0", className)}
    >
      {children}
    </Tag>
  );
}
