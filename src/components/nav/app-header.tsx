"use client";

import {
  BarChart3,
  ChevronLeft,
  Inbox,
  LayoutDashboard,
  LogOut,
  Newspaper,
  ScanSearch,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

import { Logo } from "@/components/brand/logo";
import { SidebarResizeHandle } from "@/components/nav/sidebar-resize-handle";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { isUsageTelemetryUiEnabled } from "@/lib/config/features";
import { interactiveNavClass } from "@/lib/ui/interactive";
import {
  clampSidebarWidth,
  measureWidestSidebarLabelPx,
  readRootFontPx,
  SIDEBAR_COLLAPSED_WIDTH_CLASS,
  SIDEBAR_EXPANDED_WIDTH_CLASS,
  SIDEBAR_MAX_WIDTH_RATIO,
  SIDEBAR_TOGGLE_CLASS,
  SIDEBAR_TOGGLE_ICON_CLASS,
  sidebarDefaultWidthPx,
  sidebarMinWidthPx,
} from "@/lib/ui/sidebar";
import { useSidebarCollapsed } from "@/lib/ui/use-sidebar-collapsed";
import { useSidebarWidth } from "@/lib/ui/use-sidebar-width";
import { cn } from "@/lib/utils";

const BASE_NAV = [
  { href: "dashboard", label: "Dashboard", path: "/dashboard" },
  { href: "scan", label: "Scan", path: "/scan" },
  { href: "mail", label: "Mail", path: "/mail" },
  { href: "history", label: "History", path: "/history" },
  { href: "settings", label: "Settings", path: "/settings" },
] as const;

const USAGE_NAV = { href: "usage", label: "Usage", path: "/usage" } as const;

const NAV_ICONS = {
  dashboard: LayoutDashboard,
  scan: ScanSearch,
  mail: Inbox,
  history: Newspaper,
  settings: Settings,
  usage: BarChart3,
} as const;

export type AppNavCurrent =
  (typeof BASE_NAV)[number]["href"] | typeof USAGE_NAV.href | "thread" | "onboarding";

function subscribeViewport(onStoreChange: () => void) {
  window.addEventListener("resize", onStoreChange);
  return () => window.removeEventListener("resize", onStoreChange);
}

function subscribeMounted() {
  return () => {};
}

export function AppHeader({ email, current }: { email?: string | null; current: AppNavCurrent }) {
  const nav = isUsageTelemetryUiEnabled() ? [...BASE_NAV, USAGE_NAV] : [...BASE_NAV];
  const labelsKey = nav.map((item) => item.label).join("\0");
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [storedWidth, setStoredWidth] = useSidebarWidth();
  const sidebarRef = useRef<HTMLElement>(null);
  const viewportPx = useSyncExternalStore(
    subscribeViewport,
    () => window.innerWidth,
    () => 0,
  );
  const handleReady = useSyncExternalStore(
    subscribeMounted,
    () => true,
    () => false,
  );
  const minPx = sidebarMinWidthPx(
    handleReady ? measureWidestSidebarLabelPx(labelsKey.split("\0")) : 0,
    handleReady ? readRootFontPx() : 16,
  );
  const viewportForClamp = viewportPx > 0 ? viewportPx : Math.max(minPx * 2, 1);
  const shownWidth =
    storedWidth == null
      ? sidebarDefaultWidthPx(16)
      : clampSidebarWidth(storedWidth, { minPx, viewportPx: viewportForClamp });

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (storedWidth == null) {
      root.style.removeProperty("--app-sidebar-width-expanded");
      return;
    }
    root.style.setProperty("--app-sidebar-width-expanded", `${shownWidth}px`);
  }, [shownWidth, storedWidth]);

  function getWidthPx() {
    const measured = sidebarRef.current?.getBoundingClientRect().width ?? 0;
    if (measured > 0) return measured;
    if (storedWidth != null) return storedWidth;
    return sidebarDefaultWidthPx(readRootFontPx());
  }

  const maxPx = viewportPx > 0 ? viewportPx * SIDEBAR_MAX_WIDTH_RATIO : minPx;

  return (
    <header
      ref={sidebarRef}
      data-app-sidebar=""
      className={cn(
        "border-sidebar-border bg-sidebar text-sidebar-foreground sticky top-0 z-40 border-b lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:border-r lg:border-b-0 motion-safe:lg:transition-[width] motion-safe:lg:duration-200 motion-safe:lg:ease-out",
        collapsed ? SIDEBAR_COLLAPSED_WIDTH_CLASS : SIDEBAR_EXPANDED_WIDTH_CLASS,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-3 px-4 py-3 lg:py-4",
          collapsed ? "lg:flex-col lg:items-center lg:justify-start lg:gap-2 lg:px-1.5" : "lg:px-4",
        )}
      >
        <Link
          href="/dashboard"
          className={cn(
            "focus-visible:ring-ring rounded-lg hover:opacity-90 focus-visible:ring-3 focus-visible:outline-none",
            collapsed
              ? "shrink-0 lg:inline-flex lg:size-10 lg:items-center lg:justify-center"
              : "min-w-0",
          )}
          aria-label="MailPriority home"
        >
          <span className="inline-flex lg:hidden">
            <Logo />
          </span>
          <span className="hidden lg:inline-flex lg:min-w-0">
            <Logo
              showWordmark={!collapsed}
              truncateWordmark={!collapsed}
              className={cn(!collapsed && "min-w-0")}
            />
          </span>
        </Link>
        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle className="size-10" />
          <SignOutForm />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(SIDEBAR_TOGGLE_CLASS, "hidden self-center lg:inline-flex")}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          aria-controls="app-sidebar-nav"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronLeft
            aria-hidden
            size={16}
            className={cn(SIDEBAR_TOGGLE_ICON_CLASS, collapsed && "rotate-180")}
          />
        </Button>
      </div>
      <nav
        id="app-sidebar-nav"
        aria-label="Main"
        className={cn(
          "flex [scrollbar-width:none] gap-1 overflow-x-auto px-3 pb-3 [-ms-overflow-style:none] lg:flex-1 lg:flex-col lg:overflow-x-visible lg:overflow-y-visible lg:pb-0 [&::-webkit-scrollbar]:hidden",
          collapsed ? "lg:items-center lg:gap-1 lg:px-1.5" : "lg:px-3",
        )}
      >
        {nav.map((item) => {
          const Icon = NAV_ICONS[item.href];
          const active = current === item.href;
          return (
            <Link
              key={item.href}
              href={item.path}
              prefetch
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              className={cn(
                interactiveNavClass,
                "inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm whitespace-nowrap lg:min-h-10 lg:w-full",
                collapsed && "lg:size-10 lg:min-h-10 lg:max-w-10 lg:justify-center lg:px-0",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className={cn(collapsed && "lg:sr-only")}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div
        className={cn(
          "border-sidebar-border mt-auto hidden gap-3 border-t py-4 lg:grid",
          collapsed ? "lg:justify-items-center lg:gap-2 lg:px-1.5" : "lg:px-4",
        )}
      >
        {email && !collapsed ? (
          <span className="text-muted-foreground truncate text-sm" title={email}>
            {email}
          </span>
        ) : null}
        <div className={cn("flex items-center gap-2", collapsed ? "flex-col" : "justify-between")}>
          <ThemeToggle className={collapsed ? "size-9" : undefined} />
          <SignOutForm iconOnly={collapsed} />
        </div>
      </div>
      {handleReady && !collapsed ? (
        <SidebarResizeHandle
          minPx={minPx}
          maxPx={maxPx}
          widthPx={shownWidth}
          onWidthPx={setStoredWidth}
          getWidthPx={getWidthPx}
        />
      ) : null}
    </header>
  );
}

function SignOutForm({ iconOnly = false }: { iconOnly?: boolean }) {
  return (
    <form action="/auth/signout" method="post">
      {iconOnly ? (
        <Button type="submit" variant="outline" size="icon" aria-label="Sign out" title="Sign out">
          <LogOut aria-hidden />
        </Button>
      ) : (
        <Button type="submit" variant="outline" size="sm" className="min-h-10 px-3 lg:min-h-8">
          Sign out
        </Button>
      )}
    </form>
  );
}
