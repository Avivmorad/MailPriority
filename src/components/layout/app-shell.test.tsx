/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AppShell } from "@/components/layout/app-shell";
import {
  SIDEBAR_COLLAPSED_PAD_CLASS,
  SIDEBAR_EXPANDED_PAD_CLASS,
  SIDEBAR_STORAGE_KEY,
} from "@/lib/ui/sidebar";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("AppShell sidebar padding", () => {
  it("pads main content for the expanded rail by default", () => {
    const { container } = render(
      <AppShell header={<div>header</div>}>
        <p>body</p>
      </AppShell>,
    );

    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain(SIDEBAR_EXPANDED_PAD_CLASS);
    expect(shell.className).toContain("min-w-0");
    expect(shell.className).toContain("overflow-x-clip");
    expect(screen.getByRole("main").className).toContain("min-w-0");
  });

  it("keeps main content pad in sync when the sidebar is collapsed", () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "1");
    const { container } = render(
      <AppShell header={<div>header</div>}>
        <p>body</p>
      </AppShell>,
    );

    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain(SIDEBAR_COLLAPSED_PAD_CLASS);
    expect(shell.className).not.toContain(SIDEBAR_EXPANDED_PAD_CLASS);
  });
});
