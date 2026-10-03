"use client";

import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";

import {
  parseSidebarWidth,
  serializeSidebarWidth,
  SIDEBAR_MAX_WIDTH_RATIO,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from "@/lib/ui/sidebar";

const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function readRaw(): string {
  return window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) ?? "";
}

function applyExpandedWidth(widthPx: number | null) {
  const root = document.documentElement;
  if (widthPx == null) {
    root.style.removeProperty("--app-sidebar-width-expanded");
    return;
  }
  const viewport = window.innerWidth;
  const maxPx = viewport > 0 ? viewport * SIDEBAR_MAX_WIDTH_RATIO : widthPx;
  const applied = Math.min(widthPx, maxPx);
  root.style.setProperty("--app-sidebar-width-expanded", `${Math.round(applied)}px`);
}

export function useSidebarWidth(): [number | null, (widthPx: number) => void] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const widthPx = parseSidebarWidth(raw || null);
  const setWidthPx = useCallback((next: number) => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, serializeSidebarWidth(next));
    emit();
  }, []);

  useLayoutEffect(() => {
    applyExpandedWidth(widthPx);
  }, [widthPx]);

  return [widthPx, setWidthPx];
}
