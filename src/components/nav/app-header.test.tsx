/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppHeader } from "@/components/nav/app-header";
import {
  SIDEBAR_COLLAPSED_WIDTH_CLASS,
  SIDEBAR_EXPANDED_WIDTH_CLASS,
  SIDEBAR_MAX_WIDTH_RATIO,
  SIDEBAR_STORAGE_KEY,
  SIDEBAR_TOGGLE_CLASS,
  SIDEBAR_TOGGLE_ICON_CLASS,
  SIDEBAR_WIDTH_STORAGE_KEY,
  sidebarMinWidthPx,
} from "@/lib/ui/sidebar";

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.style.removeProperty("--app-sidebar-width-expanded");
  document.documentElement.style.removeProperty("font-size");
  document.documentElement.removeAttribute("data-sidebar-resizing");
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  vi.restoreAllMocks();
});

describe("AppHeader", () => {
  it("marks the current section and exposes a labeled landmark", () => {
    render(<AppHeader email="user@example.com" current="mail" />);

    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "MailPriority home" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: "Scan" })).toHaveAttribute("href", "/scan");
    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute("href", "/history");
    expect(screen.getByRole("link", { name: "Mail" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("toggles the desktop sidebar collapse preference in localStorage", () => {
    render(<AppHeader email="user@example.com" current="dashboard" />);

    const collapse = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBeNull();

    fireEvent.click(collapse);

    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("1");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("navigation", { name: "Main" })).toHaveAttribute(
      "id",
      "app-sidebar-nav",
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));

    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("0");
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("restores a collapsed preference from localStorage", () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "1");
    render(<AppHeader email="user@example.com" current="settings" />);

    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    expect(screen.queryByText("user@example.com")).not.toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByText("Settings").className).toMatch(/lg:sr-only/);
  });

  it("labels icon-only chrome controls for accessibility", () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "1");
    render(<AppHeader email="user@example.com" current="mail" />);

    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Sign out" }).length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /Switch to (light|dark) mode/ }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Mail" })).toHaveAttribute("aria-label", "Mail");
  });

  it("does not let narrow rows squash nav labels over each other", () => {
    render(<AppHeader email="user@example.com" current="dashboard" />);
    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboard.className).toContain("shrink-0");
    expect(dashboard.className).not.toContain("min-w-0");
  });

  it("keeps section labels at their full width so a narrow row can scroll", () => {
    render(<AppHeader email="user@example.com" current="dashboard" />);

    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboard.className).toContain("shrink-0");
    expect(dashboard.className).not.toContain("min-w-0");
  });

  it("pins the desktop rail to the viewport left edge when fixed", () => {
    render(<AppHeader email="user@example.com" current="dashboard" />);
    const header = screen.getByRole("banner");
    expect(header.className).toMatch(/lg:left-0/);
    expect(header.className).toMatch(/lg:fixed/);
  });

  it("uses one shared size for the collapse and expand chevrons", () => {
    render(<AppHeader email="user@example.com" current="dashboard" />);

    const collapse = screen.getByRole("button", { name: "Collapse sidebar" });
    const collapseIcon = collapse.querySelector("svg");
    expect(collapse).toHaveClass(SIDEBAR_TOGGLE_CLASS);
    expect(collapseIcon).toHaveClass(SIDEBAR_TOGGLE_ICON_CLASS);
    expect(collapseIcon).not.toHaveClass("rotate-180");
    expect(collapseIcon).toHaveAttribute("width", "16");
    expect(collapseIcon).toHaveAttribute("height", "16");
    const collapseClass = collapse.className;

    fireEvent.click(collapse);

    const expand = screen.getByRole("button", { name: "Expand sidebar" });
    const expandIcon = expand.querySelector("svg");
    expect(expand.className).toBe(collapseClass);
    expect(expand).toHaveClass(SIDEBAR_TOGGLE_CLASS);
    expect(expandIcon).toHaveClass(SIDEBAR_TOGGLE_ICON_CLASS, "rotate-180");
    expect(expandIcon).toHaveAttribute("width", "16");
    expect(expandIcon).toHaveAttribute("height", "16");
  });

  it("clamps resize to [label min, 50vw] and does not collapse", () => {
    document.documentElement.style.fontSize = "16px";
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1000,
    });
    const labelPx = 100;
    const labelMin = sidebarMinWidthPx(labelPx, 16);
    const viewportMax = 1000 * SIDEBAR_MAX_WIDTH_RATIO;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(
      this: HTMLElement,
    ) {
      if (this.dataset.sidebarLabelProbe === "true") {
        const width = this.textContent === "Dashboard" ? labelPx : 40;
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: 0,
          right: width,
          width,
          height: 20,
          toJSON() {
            return {};
          },
        } as DOMRect;
      }
      return originalGetBoundingClientRect.call(this);
    };

    render(<AppHeader email="user@example.com" current="dashboard" />);

    const handle = screen.getByRole("separator", { name: "Resize sidebar" });
    expect(handle).toHaveAttribute("aria-valuemin", String(labelMin));
    expect(handle).toHaveAttribute("aria-valuemax", String(viewportMax));
    expect(screen.getByText("Dashboard").className).not.toMatch(/sr-only/);

    fireEvent.pointerDown(handle, { button: 0, clientX: 240, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 0, pointerId: 1 });

    expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe(String(labelMin));
    expect(document.documentElement.style.getPropertyValue("--app-sidebar-width-expanded")).toBe(
      `${labelMin}px`,
    );
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
    expect(screen.getByText("Dashboard").className).not.toMatch(/sr-only/);
    expect(screen.getByRole("banner").className).toContain(SIDEBAR_EXPANDED_WIDTH_CLASS);
    expect(screen.getByRole("banner").className).not.toContain(SIDEBAR_COLLAPSED_WIDTH_CLASS);

    fireEvent.pointerMove(window, { clientX: 4000, pointerId: 1 });

    expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe(String(viewportMax));
    expect(document.documentElement.style.getPropertyValue("--app-sidebar-width-expanded")).toBe(
      `${viewportMax}px`,
    );
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
    expect(handle).toHaveAttribute("aria-valuenow", String(viewportMax));

    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(document.documentElement.hasAttribute("data-sidebar-resizing")).toBe(false);
  });

  it("keeps a resized width when the sidebar is collapsed and restored", () => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "420");
    render(<AppHeader email="user@example.com" current="dashboard" />);

    expect(document.documentElement.style.getPropertyValue("--app-sidebar-width-expanded")).toBe(
      "420px",
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("1");
    expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe("420");
    expect(screen.getByRole("banner").className).toContain(SIDEBAR_COLLAPSED_WIDTH_CLASS);
    expect(screen.queryByRole("separator", { name: "Resize sidebar" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));

    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("0");
    expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe("420");
    expect(screen.getByRole("banner").className).toContain(SIDEBAR_EXPANDED_WIDTH_CLASS);
    expect(document.documentElement.style.getPropertyValue("--app-sidebar-width-expanded")).toBe(
      "420px",
    );
  });
});
