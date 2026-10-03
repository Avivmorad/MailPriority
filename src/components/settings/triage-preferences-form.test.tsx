/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TRIAGE_CARD_DESCRIPTION,
  TRIAGE_SETTINGS_SAVED_MESSAGE,
  TRIAGE_UPDATE_STARTED_MESSAGE,
} from "@/lib/settings/schedule-copy";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { TriagePreferencesForm } from "@/components/settings/triage-preferences-form";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockReset();
});

function renderForm() {
  return render(
    <TriagePreferencesForm
      vipSenders={["vip@example.com"]}
      ignoredSenders={[]}
      ignoredDomains={["news.example.com"]}
      customAiInstructions=""
      digestEnabled
    />,
  );
}

describe("TriagePreferencesForm", () => {
  it("renders list chips instead of raw multi-line textareas for triage lists", () => {
    renderForm();

    expect(screen.getByText(TRIAGE_CARD_DESCRIPTION)).toBeInTheDocument();
    expect(screen.getByLabelText("Ignore senders & domains")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ignored senders")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ignored domains")).not.toBeInTheDocument();
    expect(screen.getByText("vip@example.com")).toBeInTheDocument();
    expect(screen.getByText("news.example.com")).toBeInTheDocument();
    expect(screen.getByText("Domain")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove vip@example.com" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/one email per line/i)).not.toBeInTheDocument();
    const senderRow = screen.getByTestId("triage-sender-editors");
    expect(senderRow.className).toContain("repeat(auto-fit,minmax(min(100%,18rem),1fr))");
    const vipInput = screen.getByLabelText("VIP senders");
    const ignoreInput = screen.getByLabelText("Ignore senders & domains");
    expect(vipInput).not.toBe(ignoreInput);
    expect(senderRow).toContainElement(vipInput);
    expect(senderRow).toContainElement(ignoreInput);
    expect(vipInput.closest("div.block")).not.toBe(ignoreInput.closest("div.block"));
    expect(screen.getByRole("button", { name: "Update Now" })).toBeEnabled();
    expect(
      screen.getByRole("textbox", { name: /Custom triage instructions/i }),
    ).toBeInTheDocument();
  });

  it("adds a validated VIP chip and rejects invalid email", () => {
    renderForm();

    const vipInput = screen.getByPlaceholderText("vip@example.com");
    fireEvent.change(vipInput, { target: { value: "Boss@Acme.com" } });
    const vipField = vipInput.closest("div")?.parentElement;
    expect(vipField).toBeTruthy();
    fireEvent.click(within(vipField as HTMLElement).getByRole("button", { name: "Add" }));

    expect(screen.getByText("boss@acme.com")).toBeInTheDocument();

    fireEvent.change(vipInput, { target: { value: "not-valid" } });
    fireEvent.click(within(vipField as HTMLElement).getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
  });

  it("saves triage settings without starting a scan", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Save triage settings" }));

    expect(await screen.findByText(TRIAGE_SETTINGS_SAVED_MESSAGE)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          vipSenders: ["vip@example.com"],
          ignoredSenders: [],
          ignoredDomains: ["news.example.com"],
          customAiInstructions: "",
          digestEnabled: true,
        }),
      }),
    );
  });

  it("puts an email and a domain from Ignore senders & domains on the correct lists", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TriagePreferencesForm
        vipSenders={[]}
        ignoredSenders={[]}
        ignoredDomains={[]}
        customAiInstructions=""
        digestEnabled={false}
      />,
    );

    const input = screen.getByLabelText("Ignore senders & domains");
    const section = input.closest("div")?.parentElement;
    expect(section).toBeTruthy();
    const add = () =>
      fireEvent.click(within(section as HTMLElement).getByRole("button", { name: "Add" }));

    fireEvent.change(input, { target: { value: "Noise@Example.com" } });
    add();
    fireEvent.change(input, { target: { value: "Newsletters.Example.com" } });
    add();

    expect(screen.getByText("noise@example.com")).toBeInTheDocument();
    expect(screen.getByText("newsletters.example.com")).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText("Email")).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText("Domain")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "not a domain" } });
    add();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter an email address or a domain (for example newsletters.example.com).",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save triage settings" }));

    expect(await screen.findByText(TRIAGE_SETTINGS_SAVED_MESSAGE)).toBeInTheDocument();
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      ignoredSenders: string[];
      ignoredDomains: string[];
    };
    expect(body.ignoredSenders).toEqual(["noise@example.com"]);
    expect(body.ignoredDomains).toEqual(["newsletters.example.com"]);
  });

  it("Update Now saves settings then starts a default lookback scan", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ scanId: "scan-1", status: "RUNNING" }), { status: 202 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Update Now" }));

    expect(await screen.findByText(TRIAGE_UPDATE_STARTED_MESSAGE)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/settings",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/scans",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ lookbackDays: 7 }),
      }),
    );
  });
});
