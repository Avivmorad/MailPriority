"use client";

import { SIDEBAR_COLLAPSED_PAD_CLASS, SIDEBAR_EXPANDED_PAD_CLASS } from "@/lib/ui/sidebar";
import { useSidebarCollapsed } from "@/lib/ui/use-sidebar-collapsed";
import { useSidebarWidth } from "@/lib/ui/use-sidebar-width";
import { cn } from "@/lib/utils";

export function RouteLoading() {
  const [collapsed] = useSidebarCollapsed();
  useSidebarWidth();

  return (
    <div
      data-app-shell=""
      className={cn(
        "flex min-h-full min-w-0 flex-col",
        collapsed ? SIDEBAR_COLLAPSED_PAD_CLASS : SIDEBAR_EXPANDED_PAD_CLASS,
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <p className="sr-only">Loading</p>
      <div className="border-sidebar-border bg-sidebar h-14 border-b lg:fixed lg:inset-y-0 lg:left-0 lg:h-auto lg:w-[var(--app-sidebar-width-expanded)] lg:border-r lg:border-b-0" />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-10">
        <div className="bg-muted h-8 w-48 animate-pulse rounded-lg motion-reduce:animate-none" />
        <div className="bg-muted h-4 w-72 max-w-full animate-pulse rounded-lg motion-reduce:animate-none" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-muted h-28 animate-pulse rounded-xl motion-reduce:animate-none" />
          <div className="bg-muted h-28 animate-pulse rounded-xl motion-reduce:animate-none" />
        </div>
      </main>
    </div>
  );
}
