import { vi } from "vitest";

export function mockMatchMedia(matches: boolean) {
  const listeners = new Map<string, EventListener>();
  const media = {
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (type: string, listener: EventListener) => {
      listeners.set(type, listener);
    },
    removeEventListener: (type: string) => {
      listeners.delete(type);
    },
    dispatchEvent: () => true,
  };

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation(() => media),
  });

  return {
    media,
    setMatches(next: boolean) {
      media.matches = next;
      listeners.get("change")?.(new Event("change"));
    },
  };
}
