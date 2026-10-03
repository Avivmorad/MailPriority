"use client";

import type { ReactNode } from "react";

import { SkipToContent } from "@/components/layout/skip-to-content";
import { SIDEBAR_COLLAPSED_PAD_CLASS, SIDEBAR_EXPANDED_PAD_CLASS } from "@/lib/ui/sidebar";
import { useSidebarCollapsed } from "@/lib/ui/use-sidebar-collapsed";
import { cn } from "@/lib/utils";

export function AppShell({
  header,
  banner,
  children,
  width = "wide",
}: {
  header: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
  width?: "wide" | "narrow";
}) {
  const [collapsed] = useSidebarCollapsed();

  return (
    <div
      data-app-shell=""
      className={cn(
        "flex min-h-full min-w-0 flex-col overflow-x-clip motion-safe:lg:transition-[padding] motion-safe:lg:duration-200 motion-safe:lg:ease-out",
        collapsed ? SIDEBAR_COLLAPSED_PAD_CLASS : SIDEBAR_EXPANDED_PAD_CLASS,
      )}
    >
      <SkipToContent />
      {header}
      {banner}
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "mx-auto w-full min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-10",
          width === "wide" ? "max-w-6xl space-y-7 sm:space-y-8" : "max-w-3xl space-y-6",
        )}
      >
        {children}
      </main>
    </div>
  );
}
