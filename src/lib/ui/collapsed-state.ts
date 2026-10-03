const STORAGE_PREFIX = "mailpilot.collapsed.v2.";

export function collapsedStorageKey(id: string): string {
  return `${STORAGE_PREFIX}${id}`;
}

export function parseCollapsedIds(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((value): value is string => typeof value === "string" && value.length > 0);
  } catch {
    return [];
  }
}

export function serializeCollapsedIds(ids: Iterable<string>): string {
  return JSON.stringify([...new Set(ids)]);
}

export function toggleCollapsedId(
  ids: readonly string[],
  id: string,
  collapsed: boolean,
): string[] {
  const next = new Set(ids);
  if (collapsed) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return [...next];
}
