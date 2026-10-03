"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  collapsedStorageKey,
  parseCollapsedIds,
  serializeCollapsedIds,
} from "@/lib/ui/collapsed-state";

const listeners = new Map<string, Set<() => void>>();

function subscribeKey(key: string, onStoreChange: () => void) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(onStoreChange);
  return () => {
    set.delete(onStoreChange);
  };
}

function emit(key: string) {
  const set = listeners.get(key);
  if (!set) {
    return;
  }
  for (const listener of set) {
    listener();
  }
}

function readRaw(key: string): string {
  return window.localStorage.getItem(key) ?? "";
}

export function useCollapsedIds(
  storageKey: string,
  options?: { defaultIds?: readonly string[] },
): [string[], (next: string[]) => void] {
  const key = collapsedStorageKey(storageKey);
  const raw = useSyncExternalStore(
    (onChange) => subscribeKey(key, onChange),
    () => readRaw(key),
    () => "",
  );
  const collapsed = raw ? parseCollapsedIds(raw) : [...(options?.defaultIds ?? [])];
  const setCollapsed = useCallback(
    (next: string[]) => {
      window.localStorage.setItem(key, serializeCollapsedIds(next));
      emit(key);
    },
    [key],
  );
  return [collapsed, setCollapsed];
}
