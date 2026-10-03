"use client";

import { Info } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { settingInfoButtonName } from "@/lib/settings/setting-info-copy";
import { cn } from "@/lib/utils";

/**
 * Small info icon. Click, hover, or keyboard focus opens a short explanation.
 * The panel is portaled so card overflow does not clip it.
 */
export function SettingInfo({ label, description }: { label: string; description: string }) {
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    function place() {
      const button = buttonRef.current;
      const tooltip = tooltipRef.current;
      if (!button || !tooltip) {
        return;
      }
      const rect = button.getBoundingClientRect();
      const width = Math.min(288, window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const gap = 8;
      const height = tooltip.offsetHeight || 88;
      const below = rect.bottom + gap;
      const top =
        below + height > window.innerHeight && rect.top > height + gap
          ? Math.max(8, rect.top - gap - height)
          : below;
      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
      tooltip.style.width = `${width}px`;
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  function closeIfBlurred() {
    if (document.activeElement !== buttonRef.current) {
      setOpen(false);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring inline-flex size-5 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
        aria-label={settingInfoButtonName(label)}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={closeIfBlurred}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        <Info aria-hidden="true" className="size-3.5" />
      </button>
      {open
        ? createPortal(
            <span
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              className={cn(
                "bg-popover text-popover-foreground border-border pointer-events-none fixed z-50 w-72 max-w-[calc(100vw-1rem)] rounded-lg border px-3 py-2 text-left text-sm leading-snug font-normal shadow-md",
              )}
            >
              {description}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

export function SettingLabel({
  label,
  htmlFor,
  description,
  children,
}: {
  label: string;
  htmlFor?: string;
  description: string;
  children?: string;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <label htmlFor={htmlFor} className="text-muted-foreground">
        {children ?? label}
      </label>
      <SettingInfo label={label} description={description} />
    </div>
  );
}
