"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  parseSidebarCollapsed,
  serializeSidebarCollapsed,
  SIDEBAR_STORAGE_KEY,
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
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) ?? "";
}

export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const collapsed = parseSidebarCollapsed(raw || null);
  const setCollapsed = useCallback((next: boolean) => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, serializeSidebarCollapsed(next));
    emit();
  }, []);
  return [collapsed, setCollapsed];
}
