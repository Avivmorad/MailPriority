/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DISPATCH_LEASE_SECONDS } from "@/lib/scans/dispatch-budget";
import { BEST_EFFORT_DAILY_NOTE } from "@/lib/settings/schedule-copy";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

import { InitialScanCard } from "@/components/scans/initial-scan-card";

const NOW = "2026-09-29T12:00:00.000Z";
const STALE_RESUME_MS = (DISPATCH_LEASE_SECONDS + 60) * 1000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function runningScan(id = "scan-1", updatedAt = NOW) {
  return {
    id,
    status: "RUNNING",
    threads_discovered: 4,
    threads_checked: 1,
    updated_at: updatedAt,
  };
}

function staleRunningScan(id = "scan-1") {
  const staleAt = new Date(Date.parse(NOW) - STALE_RESUME_MS).toISOString();
  return runningScan(id, staleAt);
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("InitialScanCard polling", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stops after three null progress responses and does not keep polling", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ scan: null }));
    render(<InitialScanCard connected latestScan={runningScan()} incremental={false} />);

    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    await advance(800);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    await advance(800);
    await settle();

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load scan progress. Please try again.",
    );
    expect(screen.getByRole("button", { name: "Scan now" })).toBeEnabled();
    await advance(5000);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("counts a malformed payload as unavailable", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ nope: true }));
    render(<InitialScanCard connected latestScan={runningScan()} incremental={false} />);

    await settle();
    await advance(800);
    await settle();
    await advance(800);
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load scan progress. Please try again.",
    );
    expect(screen.getByRole("button", { name: "Scan now" })).toBeEnabled();
  });

  it("resets the miss count only for the watched scan and stops after three later misses", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ scan: null }))
      .mockResolvedValueOnce(jsonResponse({ scan: null }))
      .mockResolvedValueOnce(jsonResponse({ scan: runningScan() }))
      .mockResolvedValue(jsonResponse({ scan: null }));
    render(<InitialScanCard connected latestScan={runningScan()} incremental={false} />);

    await settle();
    await advance(800);
    await settle();
    await advance(800);
    await settle();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Three consecutive misses after the matching snapshot must stop polling.
    await advance(800);
    await settle();
    await advance(800);
    await settle();
    await advance(800);
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load scan progress. Please try again.",
    );
    const calls = vi.mocked(fetch).mock.calls.length;
    await advance(5000);
    expect(fetch).toHaveBeenCalledTimes(calls);
  });

  it("does not let an unrelated scan finish the watched scan or clear misses", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ scan: null }))
      .mockResolvedValueOnce(jsonResponse({ scan: null }))
      .mockResolvedValueOnce(
        jsonResponse({
          scan: { ...runningScan("other-scan"), status: "SUCCESS" },
        }),
      )
      .mockResolvedValue(jsonResponse({ scan: null }));
    render(<InitialScanCard connected latestScan={runningScan()} incremental={false} />);

    await settle();
    await advance(800);
    await settle();
    await advance(800);
    await settle();
    expect(push).not.toHaveBeenCalled();

    await advance(800);
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load scan progress. Please try again.",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("navigates once when the watched scan succeeds", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ scan: { ...runningScan(), status: "SUCCESS" } }),
    );
    render(<InitialScanCard connected latestScan={runningScan()} incremental={false} />);

    await settle();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/dashboard?scan=done");
    await advance(5000);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("stops on 401 with a sign-in message and does not ask to reconnect Gmail", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "unauthorized" }, 401));
    render(<InitialScanCard connected latestScan={runningScan()} incremental={false} />);

    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent("Sign in again to follow scan progress.");
    expect(screen.queryByRole("link", { name: "Reconnect Gmail" })).not.toBeInTheDocument();
    const calls = vi.mocked(fetch).mock.calls.length;
    await advance(5000);
    expect(fetch).toHaveBeenCalledTimes(calls);
  });

  it("does not start another poll while one request is still open", async () => {
    let release: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(<InitialScanCard connected latestScan={runningScan()} incremental={false} />);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);

    await advance(800);
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.(jsonResponse({ scan: runningScan() }));
      await Promise.resolve();
    });
    await advance(800);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("aborts a hung progress request at the deadline", async () => {
    vi.mocked(fetch).mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = (init as RequestInit | undefined)?.signal;
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    render(<InitialScanCard connected latestScan={runningScan()} incremental={false} />);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);

    await advance(10_000);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    await advance(800);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not navigate after unmount when a late response arrives", async () => {
    let release: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const view = render(
      <InitialScanCard connected latestScan={runningScan()} incremental={false} />,
    );
    await settle();
    view.unmount();
    await act(async () => {
      release?.(jsonResponse({ scan: { ...runningScan(), status: "SUCCESS" } }));
      await Promise.resolve();
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("leaves no residual poll deadline timers after a successful poll settles", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ scan: runningScan() }));
    render(<InitialScanCard connected latestScan={runningScan()} incremental={false} />);
    await settle();
    // Poll settled; only the 800ms inter-poll wait should remain.
    expect(vi.getTimerCount()).toBe(1);
    await advance(800);
    await settle();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("clears timers and ignores late success after Strict Mode remount cleanup", async () => {
    const releases: Array<(value: Response) => void> = [];
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(resolve);
        }),
    );
    const view = render(
      <InitialScanCard connected latestScan={runningScan()} incremental={false} />,
    );
    await settle();
    expect(releases).toHaveLength(1);
    // Simulate Strict Mode: unmount then remount starts a new generation.
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    render(<InitialScanCard connected latestScan={runningScan()} incremental={false} />);
    await settle();
    expect(releases).toHaveLength(2);
    await act(async () => {
      releases[0]?.(jsonResponse({ scan: { ...runningScan(), status: "SUCCESS" } }));
      await Promise.resolve();
    });
    // The deferred response belonged to the unmounted instance.
    expect(push).not.toHaveBeenCalled();
  });

  it("does not promise that a partial scan queued retries", () => {
    render(
      <InitialScanCard
        connected
        incremental={false}
        lastRunAt={NOW}
        lastRunStatus="PARTIAL"
        messagesProcessed={3}
      />,
    );
    expect(screen.getByText(/Some conversations need another scan/)).toBeInTheDocument();
    expect(screen.queryByText(/Retries queued/)).not.toBeInTheDocument();
  });

  it("keeps progress stats in a min-width auto-fit grid without mid-word breaks", () => {
    render(
      <InitialScanCard
        connected
        incremental={false}
        latestScan={runningScan()}
        messagesProcessed={42}
        breakdown={{
          actions: 1,
          pending: 2,
          forYou: 3,
          ignored: 4,
          important: 0,
        }}
      />,
    );
    const stats = screen.getByTestId("scan-progress-stats");
    expect(stats.className).toContain("minmax(10rem,1fr)");
    expect(stats.className).not.toContain("grid-cols-2");
    expect(stats.className).not.toContain("sm:grid-cols-3");
    for (const label of ["Scanning", "Conversations", "Emails scanned", "Updated"]) {
      const dt = screen.getByText(label);
      expect(dt.tagName).toBe("DT");
      expect(dt.className).toContain("whitespace-nowrap");
      expect(dt.className).not.toContain("break-words");
    }
    expect(screen.getByText(/\d{1,2} [A-Z]{3} - \d{1,2} [A-Z]{3}/)).toBeInTheDocument();
  });

  it("names the lookback control and scan actions", () => {
    render(<InitialScanCard connected incremental={false} />);
    expect(screen.getByRole("combobox", { name: "Lookback window" })).toBeEnabled();
    const scan = screen.getByRole("button", { name: "Scan now" });
    expect(scan).toBeEnabled();
    scan.focus();
    expect(scan).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Cancel scan" })).not.toBeInTheDocument();
  });

  it("disables scan controls and shows cancel while busy", () => {
    render(<InitialScanCard connected latestScan={runningScan()} incremental={false} />);
    expect(screen.getByRole("button", { name: "Scanning…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel scan" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Lookback window" })).toBeDisabled();
    expect(screen.getByRole("progressbar", { name: "Scan progress" })).toBeInTheDocument();
  });

  it("shows a scan already running on the server when the tab opens idle", async () => {
    const scan = {
      id: "scan-live",
      status: "RUNNING",
      threads_discovered: 20,
      threads_checked: 8,
      percent: 40,
      updated_at: NOW,
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ scan }));
    render(<InitialScanCard connected incremental={false} />);

    expect(screen.getByRole("button", { name: "Scan now" })).toBeEnabled();
    expect(screen.getByRole("progressbar", { name: "Scan progress" })).not.toHaveAttribute(
      "aria-valuenow",
    );

    await settle();

    expect(screen.getByRole("progressbar", { name: "Scan progress" })).toHaveAttribute(
      "aria-valuenow",
      "40",
    );
    expect(screen.getByRole("progressbar", { name: "Scan progress" })).toHaveAttribute(
      "aria-valuetext",
      "Checking 8 of 20 conversations (40%). Large scans continue automatically…",
    );
    expect(screen.getByText("8 of 20")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scanning…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Scan now" })).not.toBeInTheDocument();
  });

  it("adopts a running scan when the server snapshot arrives after mount", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ scan: null }));
    const view = render(<InitialScanCard connected incremental={false} />);
    await settle();
    expect(screen.getByRole("button", { name: "Scan now" })).toBeEnabled();

    view.rerender(
      <InitialScanCard
        connected
        incremental={false}
        latestScan={{
          id: "scan-live",
          status: "RUNNING",
          threads_discovered: 20,
          threads_checked: 8,
          updated_at: NOW,
        }}
      />,
    );
    await settle();

    expect(screen.getByRole("progressbar", { name: "Scan progress" })).toHaveAttribute(
      "aria-valuenow",
      "40",
    );
    expect(screen.getByRole("button", { name: "Scanning…" })).toBeDisabled();
  });

  it("does not replace in-progress counts with a stale zero snapshot", async () => {
    const live = {
      id: "scan-live",
      status: "RUNNING",
      threads_discovered: 20,
      threads_checked: 8,
      updated_at: NOW,
    };
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        scan: {
          ...live,
          threads_discovered: 0,
          threads_checked: 0,
        },
      }),
    );
    render(<InitialScanCard connected incremental={false} latestScan={live} />);
    expect(screen.getByRole("progressbar", { name: "Scan progress" })).toHaveAttribute(
      "aria-valuenow",
      "40",
    );

    await settle();
    await advance(800);
    await settle();

    expect(screen.getByRole("progressbar", { name: "Scan progress" })).toHaveAttribute(
      "aria-valuenow",
      "40",
    );
    expect(screen.getByText("8 of 20")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scanning…" })).toBeDisabled();
  });
});

describe("InitialScanCard cancel", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("exits busy with a retryable error when cancel is rejected over HTTP", async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      const path = String(url);
      if (path.includes("/cancel")) {
        return Promise.resolve(jsonResponse({ error: "scan_failed" }, 500));
      }
      return Promise.resolve(jsonResponse({ scan: runningScan() }));
    });
    render(<InitialScanCard connected latestScan={runningScan()} incremental={false} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Cancel scan" }));
    await settle();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan now" })).toBeEnabled();
    const calls = vi.mocked(fetch).mock.calls.length;
    await advance(5000);
    expect(fetch).toHaveBeenCalledTimes(calls);
  });

  it("exits busy when cancel times out or fails on the network", async () => {
    vi.mocked(fetch).mockImplementation((url, init) => {
      const path = String(url);
      if (path.includes("/cancel")) {
        return new Promise((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal;
          signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      return Promise.resolve(jsonResponse({ scan: runningScan() }));
    });
    render(<InitialScanCard connected latestScan={runningScan()} incremental={false} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Cancel scan" }));
    await advance(10_000);
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not cancel the scan. Please try again.",
    );
    expect(screen.getByRole("button", { name: "Scan now" })).toBeEnabled();
  });

  it("ignores a second cancel click while the first is in flight and keeps a successful cancel", async () => {
    let releaseCancel: ((value: Response) => void) | undefined;
    let cancelPosts = 0;
    vi.mocked(fetch).mockImplementation((url) => {
      const path = String(url);
      if (path.includes("/cancel")) {
        cancelPosts += 1;
        return new Promise((resolve) => {
          releaseCancel = resolve;
        });
      }
      return Promise.resolve(jsonResponse({ scan: runningScan() }));
    });
    render(<InitialScanCard connected latestScan={runningScan()} incremental={false} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Cancel scan" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Cancel scan" }));
    await settle();
    expect(cancelPosts).toBe(1);

    await act(async () => {
      releaseCancel?.(jsonResponse({ ok: true }));
      await Promise.resolve();
    });
    expect(screen.getByRole("status")).toHaveTextContent(/Scan stopped/);
    expect(screen.getByRole("button", { name: "Scan now" })).toBeEnabled();
  });

  it("does not apply a late cancel success after unmount", async () => {
    let releaseCancel: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation((url) => {
      const path = String(url);
      if (path.includes("/cancel")) {
        return new Promise((resolve) => {
          releaseCancel = resolve;
        });
      }
      return Promise.resolve(jsonResponse({ scan: runningScan() }));
    });
    const view = render(
      <InitialScanCard connected latestScan={runningScan()} incremental={false} />,
    );
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Cancel scan" }));
    await settle();
    view.unmount();
    await act(async () => {
      releaseCancel?.(jsonResponse({ ok: true }));
      await Promise.resolve();
    });
    expect(push).not.toHaveBeenCalled();
  });
});

describe("InitialScanCard start", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows a failure message when starting a scan is rejected", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "scan_failed" }, 500));
    render(<InitialScanCard connected incremental={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Scan now" }));
    await settle();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan now" })).toBeEnabled();
  });

  it("shows a failure when the start payload fails schema validation", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ nope: true }));
    render(<InitialScanCard connected incremental={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Scan now" }));
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent("Scan failed.");
    expect(screen.getByRole("button", { name: "Scan now" })).toBeEnabled();
  });

  it("does not apply a late start response after unmount", async () => {
    let releaseStart: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseStart = resolve;
        }),
    );
    const view = render(<InitialScanCard connected incremental={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Scan now" }));
    await settle();
    view.unmount();
    await act(async () => {
      releaseStart?.(jsonResponse({ scanId: "scan-new", status: "RUNNING" }));
      await Promise.resolve();
    });
    expect(push).not.toHaveBeenCalled();
  });
});

describe("InitialScanCard automatic resume", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("resumes a stale RUNNING scan once and does not start a second resume", async () => {
    let resumePosts = 0;
    vi.mocked(fetch).mockImplementation((url, init) => {
      const path = String(url);
      const method = (init as RequestInit | undefined)?.method ?? "GET";
      if (method === "POST" && path === "/api/scans") {
        resumePosts += 1;
        return Promise.resolve(jsonResponse({ scanId: "scan-resumed", status: "RUNNING" }));
      }
      return Promise.resolve(jsonResponse({ scan: staleRunningScan() }));
    });
    render(<InitialScanCard connected latestScan={staleRunningScan()} incremental={false} />);
    await settle();
    expect(resumePosts).toBe(1);
    await advance(800);
    await settle();
    await advance(800);
    await settle();
    expect(resumePosts).toBe(1);
  });

  it("stops with an observation error when resume returns a malformed payload", async () => {
    vi.mocked(fetch).mockImplementation((url, init) => {
      const path = String(url);
      const method = (init as RequestInit | undefined)?.method ?? "GET";
      if (method === "POST" && path === "/api/scans") {
        return Promise.resolve(jsonResponse({ scan: null }));
      }
      return Promise.resolve(jsonResponse({ scan: staleRunningScan() }));
    });
    render(<InitialScanCard connected latestScan={staleRunningScan()} incremental={false} />);
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load scan progress. Please try again.",
    );
    expect(screen.getByRole("button", { name: "Scan now" })).toBeEnabled();
    const calls = vi.mocked(fetch).mock.calls.length;
    await advance(5000);
    expect(fetch).toHaveBeenCalledTimes(calls);
  });

  it("stops with a sign-in message when resume returns 401", async () => {
    vi.mocked(fetch).mockImplementation((url, init) => {
      const path = String(url);
      const method = (init as RequestInit | undefined)?.method ?? "GET";
      if (method === "POST" && path === "/api/scans") {
        return Promise.resolve(jsonResponse({ error: "not_signed_in" }, 401));
      }
      return Promise.resolve(jsonResponse({ scan: staleRunningScan() }));
    });
    render(<InitialScanCard connected latestScan={staleRunningScan()} incremental={false} />);
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent("Sign in again to follow scan progress.");
    expect(screen.queryByRole("link", { name: "Reconnect Gmail" })).not.toBeInTheDocument();
  });

  it("stops with a retryable error when resume is rejected", async () => {
    vi.mocked(fetch).mockImplementation((url, init) => {
      const path = String(url);
      const method = (init as RequestInit | undefined)?.method ?? "GET";
      if (method === "POST" && path === "/api/scans") {
        return Promise.resolve(jsonResponse({ error: "scan_failed" }, 500));
      }
      return Promise.resolve(jsonResponse({ scan: staleRunningScan() }));
    });
    render(<InitialScanCard connected latestScan={staleRunningScan()} incremental={false} />);
    await settle();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan now" })).toBeEnabled();
  });

  it("ignores a late resume response after unmount", async () => {
    let releaseResume: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation((url, init) => {
      const path = String(url);
      const method = (init as RequestInit | undefined)?.method ?? "GET";
      if (method === "POST" && path === "/api/scans") {
        return new Promise((resolve) => {
          releaseResume = resolve;
        });
      }
      return Promise.resolve(jsonResponse({ scan: staleRunningScan() }));
    });
    const view = render(
      <InitialScanCard connected latestScan={staleRunningScan()} incremental={false} />,
    );
    await settle();
    view.unmount();
    await act(async () => {
      releaseResume?.(jsonResponse({ scanId: "scan-late", status: "RUNNING" }));
      await Promise.resolve();
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores a late resume response after cancel", async () => {
    let releaseResume: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation((url, init) => {
      const path = String(url);
      const method = (init as RequestInit | undefined)?.method ?? "GET";
      if (path.includes("/cancel")) {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      if (method === "POST" && path === "/api/scans") {
        return new Promise((resolve) => {
          releaseResume = resolve;
        });
      }
      return Promise.resolve(jsonResponse({ scan: staleRunningScan() }));
    });
    render(<InitialScanCard connected latestScan={staleRunningScan()} incremental={false} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Cancel scan" }));
    await settle();
    expect(screen.getByRole("status")).toHaveTextContent(/Scan stopped/);
    await act(async () => {
      releaseResume?.(jsonResponse({ scanId: "scan-late", status: "RUNNING" }));
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Scan now" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Scanning…" })).not.toBeInTheDocument();
  });

  it("does not promise the next scan at a saved local time", () => {
    render(
      <InitialScanCard
        connected
        incremental={false}
        lastRunAt="2026-09-29T05:00:00.000Z"
        lastRunStatus="SUCCESS"
        nextScanAt="2026-09-30T05:00:00.000Z"
      />,
    );
    expect(screen.getByText(BEST_EFFORT_DAILY_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(/Next scan/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan now" })).toBeEnabled();
  });
});
