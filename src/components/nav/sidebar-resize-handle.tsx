"use client";

import { useEffect, useRef } from "react";

import { clampSidebarWidth } from "@/lib/ui/sidebar";

export function SidebarResizeHandle({
  minPx,
  widthPx,
  maxPx,
  onWidthPx,
  getWidthPx,
}: {
  minPx: number;
  widthPx: number;
  maxPx: number;
  onWidthPx: (next: number) => void;
  getWidthPx: () => number;
}) {
  const dragCleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      dragCleanup.current?.();
    };
  }, []);

  function endDrag() {
    dragCleanup.current?.();
    dragCleanup.current = null;
  }

  function applyDelta(startWidth: number, startX: number, clientX: number) {
    const next = clampSidebarWidth(startWidth + clientX - startX, {
      minPx,
      viewportPx: window.innerWidth,
    });
    onWidthPx(next);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={Math.ceil(minPx)}
      aria-valuemax={Math.floor(maxPx)}
      aria-valuenow={Math.round(widthPx)}
      tabIndex={0}
      className="after:bg-sidebar-border hover:after:bg-sidebar-primary focus-visible:after:bg-sidebar-primary absolute inset-y-0 right-0 z-30 hidden w-4 cursor-col-resize touch-none bg-transparent p-0 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-px hover:after:w-0.5 focus-visible:outline-none focus-visible:after:w-0.5 lg:block"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        endDrag();
        const startX = event.clientX;
        const startWidth = getWidthPx();
        const handle = event.currentTarget;
        try {
          handle.setPointerCapture(event.pointerId);
        } catch {
          // jsdom has no active pointer to capture.
        }
        document.documentElement.setAttribute("data-sidebar-resizing", "true");

        const onMove = (move: PointerEvent) => {
          applyDelta(startWidth, startX, move.clientX);
        };
        const onUp = () => {
          endDrag();
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
        dragCleanup.current = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);
          document.documentElement.removeAttribute("data-sidebar-resizing");
        };
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 32 : 16;
        const current = getWidthPx();
        const viewportPx = window.innerWidth;
        let next: number | null = null;
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          next = current - step;
        } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          next = current + step;
        } else if (event.key === "Home") {
          next = minPx;
        } else if (event.key === "End") {
          next = maxPx;
        }
        if (next == null) return;
        event.preventDefault();
        onWidthPx(clampSidebarWidth(next, { minPx, viewportPx }));
      }}
    />
  );
}
