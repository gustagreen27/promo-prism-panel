"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function FlowButton({
  text = "Modern Button",
  className,
  onClick,
}: {
  text?: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full border border-border bg-transparent px-7 py-3 text-sm font-semibold text-foreground transition-colors duration-300 hover:text-background",
        className,
      )}
    >
      {/* Left arrow (arr-2) — slides in on hover */}
      <ArrowRight className="relative z-10 h-4 w-4 -translate-x-6 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />

      {/* Text */}
      <span className="relative z-10 transition-transform duration-300 group-hover:translate-x-2">
        {text}
      </span>

      {/* Circle — expands to fill the button */}
      <span className="absolute right-6 z-0 h-2.5 w-2.5 rounded-full bg-primary transition-all duration-500 ease-out group-hover:scale-[40]" />

      {/* Right arrow (arr-1) — slides out on hover */}
      <ArrowRight className="relative z-10 h-4 w-4 transition-all duration-300 group-hover:translate-x-6 group-hover:opacity-0" />
    </button>
  );
}
