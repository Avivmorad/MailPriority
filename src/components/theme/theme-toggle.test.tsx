/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { THEME_STORAGE_KEY } from "@/lib/ui/theme";
import { mockMatchMedia } from "@/test/match-media";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
});

describe("ThemeToggle", () => {
  it("announces light-mode as not pressed", () => {
    mockMatchMedia(false);
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: "Switch to dark mode" });
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("persists an explicit light or dark choice and does not leave system", async () => {
    mockMatchMedia(false);
    document.documentElement.classList.add("dark");
    render(<ThemeToggle />);

    fireEvent.click(await screen.findByRole("button", { name: "Switch to light mode" }));

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");

    fireEvent.click(await screen.findByRole("button", { name: "Switch to dark mode" }));

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
