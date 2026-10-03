/**
 * User-facing strings must never render as blank, the literal "null", or
 * "undefined" when a title or summary is expected.
 */
export function usableDisplayText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  if (lower === "null" || lower === "undefined") {
    return null;
  }
  return trimmed;
}

/**
 * Do and Why this tab must be English. Latin letters (including accents in
 * names) are allowed. Hebrew and any other non-Latin script is not.
 */
export function isEnglishDisplayText(value: string | null | undefined): boolean {
  const usable = usableDisplayText(value);
  if (!usable) {
    return false;
  }
  for (const char of usable) {
    if (/\p{L}/u.test(char) && !/\p{Script=Latin}/u.test(char)) {
      return false;
    }
  }
  return true;
}

/** Usable text that is safe to show on an English Do or Why this tab line. */
export function englishDisplayText(value: string | null | undefined): string | null {
  const usable = usableDisplayText(value);
  if (!usable || !isEnglishDisplayText(usable)) {
    return null;
  }
  return usable;
}

export function displayThreadTitle(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const usable = usableDisplayText(candidate);
    if (usable) {
      return usable;
    }
  }
  return "Thread";
}

export function displayActionTitle(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const usable = usableDisplayText(candidate);
    if (usable) {
      return usable;
    }
  }
  return "Action";
}
