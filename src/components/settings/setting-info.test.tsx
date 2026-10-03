/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GmailConnectionCard } from "@/components/gmail/gmail-connection-card";
import { ScanHistoryList } from "@/components/scans/scan-history-list";
import { PrivacyControls } from "@/components/settings/privacy-controls";
import { ScanPreferencesForm } from "@/components/settings/scan-preferences-form";
import { TriagePreferencesForm } from "@/components/settings/triage-preferences-form";
import type { GmailStatusPayload } from "@/lib/gmail/constants";
import {
  CONNECT_GMAIL_INFO,
  CONNECT_GMAIL_LABEL,
  CUSTOM_TRIAGE_INSTRUCTIONS_INFO,
  CUSTOM_TRIAGE_INSTRUCTIONS_LABEL,
  DELETE_ACCOUNT_INFO,
  DELETE_ACCOUNT_LABEL,
  DELETE_ANALYSIS_INFO,
  DELETE_ANALYSIS_LABEL,
  DISCONNECT_GMAIL_INFO,
  DISCONNECT_GMAIL_LABEL,
  HISTORY_AFTER_SCAN_INFO,
  HISTORY_AFTER_SCAN_LABEL,
  IGNORE_SENDERS_DOMAINS_INFO,
  IGNORE_SENDERS_DOMAINS_LABEL,
  RECONNECT_GMAIL_INFO,
  RECONNECT_LABEL,
  SAVE_SCHEDULE_INFO,
  SAVE_SCHEDULE_LABEL,
  SAVE_TRIAGE_INFO,
  SAVE_TRIAGE_LABEL,
  SCAN_HISTORY_INFO,
  SCAN_HISTORY_LABEL,
  SCAN_TIME_INFO,
  SCAN_TIME_LABEL,
  SCAN_TIMEZONE_INFO,
  SCAN_TIMEZONE_LABEL,
  UPDATE_NOW_INFO,
  UPDATE_NOW_LABEL,
  VIP_SENDERS_INFO,
  VIP_SENDERS_LABEL,
  settingInfoButtonName,
} from "@/lib/settings/setting-info-copy";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

afterEach(() => {
  cleanup();
});

function expectInfo(label: string, description: string) {
  const name = settingInfoButtonName(label);
  const button = screen.getByRole("button", { name });
  expect(button).toHaveAccessibleName(name);
  expect(button).not.toHaveTextContent("(i)");
  expect(button.querySelector("svg.lucide-info")).toBeInTheDocument();
  fireEvent.focus(button);
  expect(screen.getByRole("tooltip")).toHaveTextContent(description);
  fireEvent.blur(button);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.click(button);
  expect(screen.getByRole("tooltip")).toHaveTextContent(description);
  fireEvent.keyDown(button, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
}

const disconnectedGmail: GmailStatusPayload = {
  configured: true,
  connection: null,
  loadError: null,
};

const connectedGmail: GmailStatusPayload = {
  configured: true,
  loadError: null,
  connection: {
    id: "connection-1",
    gmailEmail: "ada@example.com",
    status: "CONNECTED",
    lastSuccessfulScanAt: null,
    nextScanAt: null,
  },
};

describe("settings info controls", () => {
  it("gives every triage, schedule, and privacy label an info control", () => {
    render(
      <TriagePreferencesForm
        vipSenders={[]}
        ignoredSenders={[]}
        ignoredDomains={[]}
        customAiInstructions=""
        digestEnabled
      />,
    );
    expect(screen.queryByText("(i)")).not.toBeInTheDocument();
    expectInfo(VIP_SENDERS_LABEL, VIP_SENDERS_INFO);
    expectInfo(IGNORE_SENDERS_DOMAINS_LABEL, IGNORE_SENDERS_DOMAINS_INFO);
    expectInfo(CUSTOM_TRIAGE_INSTRUCTIONS_LABEL, CUSTOM_TRIAGE_INSTRUCTIONS_INFO);
    expectInfo(HISTORY_AFTER_SCAN_LABEL, HISTORY_AFTER_SCAN_INFO);
    expectInfo(SAVE_TRIAGE_LABEL, SAVE_TRIAGE_INFO);
    expectInfo(UPDATE_NOW_LABEL, UPDATE_NOW_INFO);

    cleanup();
    render(<ScanPreferencesForm dailyScanTime="08:00" timezone="Asia/Jerusalem" />);
    expectInfo(SCAN_TIME_LABEL, SCAN_TIME_INFO);
    expectInfo(SCAN_TIMEZONE_LABEL, SCAN_TIMEZONE_INFO);
    expectInfo(SAVE_SCHEDULE_LABEL, SAVE_SCHEDULE_INFO);

    cleanup();
    render(<PrivacyControls />);
    expectInfo(DELETE_ANALYSIS_LABEL, DELETE_ANALYSIS_INFO);
    expectInfo(DELETE_ACCOUNT_LABEL, DELETE_ACCOUNT_INFO);
  });

  it("explains Gmail actions and scan history on Settings", () => {
    const { rerender } = render(<GmailConnectionCard status={disconnectedGmail} withSettingInfo />);
    expectInfo(CONNECT_GMAIL_LABEL, CONNECT_GMAIL_INFO);

    rerender(<GmailConnectionCard status={connectedGmail} withSettingInfo />);
    expectInfo(RECONNECT_LABEL, RECONNECT_GMAIL_INFO);
    expectInfo(DISCONNECT_GMAIL_LABEL, DISCONNECT_GMAIL_INFO);

    cleanup();
    render(<ScanHistoryList scans={[]} />);
    expectInfo(SCAN_HISTORY_LABEL, SCAN_HISTORY_INFO);
  });

  it("does not add Gmail info controls outside Settings", () => {
    render(<GmailConnectionCard status={disconnectedGmail} />);
    expect(
      screen.queryByRole("button", { name: settingInfoButtonName(CONNECT_GMAIL_LABEL) }),
    ).not.toBeInTheDocument();
  });
});
