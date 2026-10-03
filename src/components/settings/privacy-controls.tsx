"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SettingInfo } from "@/components/settings/setting-info";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DELETE_ACCOUNT_CONFIRMATION,
  DELETE_ANALYSIS_CONFIRMATION,
} from "@/lib/privacy/confirmations";
import {
  DELETE_ACCOUNT_INFO,
  DELETE_ACCOUNT_LABEL,
  DELETE_ANALYSIS_INFO,
  DELETE_ANALYSIS_LABEL,
} from "@/lib/settings/setting-info-copy";

export function PrivacyControls() {
  const router = useRouter();
  const [analysisConfirm, setAnalysisConfirm] = useState("");
  const [accountConfirm, setAccountConfirm] = useState("");
  const [busy, setBusy] = useState<"analysis" | "account" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function deleteAnalysis() {
    setBusy("analysis");
    setMessage(null);
    setError(false);
    try {
      const response = await fetch("/api/privacy/delete-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: analysisConfirm }),
      });
      if (!response.ok) {
        setError(true);
        setMessage("Could not delete analysis data. Type DELETE ANALYSIS exactly.");
        return;
      }
      setAnalysisConfirm("");
      setMessage("Analysis data deleted. Gmail stays connected unless you disconnect it.");
      router.refresh();
    } catch {
      setError(true);
      setMessage("Could not delete analysis data.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    setBusy("account");
    setMessage(null);
    setError(false);
    try {
      const response = await fetch("/api/privacy/delete-account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: accountConfirm }),
      });
      const payload = (await response.json().catch(() => ({}))) as { redirectTo?: string };
      if (!response.ok) {
        setError(true);
        setMessage("Could not delete the account. Type DELETE ACCOUNT exactly.");
        return;
      }
      window.location.assign(payload.redirectTo ?? "/");
    } catch {
      setError(true);
      setMessage("Could not delete the account.");
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy</CardTitle>
        <CardDescription>
          These actions only affect your MailPriority data. Disconnecting Gmail removes stored mail
          from MailPriority and does not delete messages in Gmail. Deleting analysis data removes
          that stored mail while Gmail stays connected. Deleting the account removes everything and
          signs you out. See the{" "}
          <Link
            href="/privacy"
            className="text-foreground font-medium underline underline-offset-4"
          >
            privacy and Gmail data-use page
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-medium">{DELETE_ANALYSIS_LABEL}</h3>
            <SettingInfo label={DELETE_ANALYSIS_LABEL} description={DELETE_ANALYSIS_INFO} />
          </div>
          <p className="text-muted-foreground text-sm">
            Removes stored messages, threads, actions, History entries, and scan history. Does not
            disconnect Gmail or delete your MailPriority login.
          </p>
          <label className="block text-sm" htmlFor="confirm-delete-analysis">
            <span className="text-muted-foreground mb-1.5 block">
              Type {DELETE_ANALYSIS_CONFIRMATION} to confirm
            </span>
            <input
              id="confirm-delete-analysis"
              className="border-input bg-background focus-visible:ring-ring h-9 w-full max-w-md rounded-lg border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none"
              value={analysisConfirm}
              onChange={(event) => setAnalysisConfirm(event.target.value)}
              disabled={busy !== null}
              autoComplete="off"
            />
          </label>
          <Button
            type="button"
            variant="destructive"
            disabled={busy !== null || analysisConfirm !== DELETE_ANALYSIS_CONFIRMATION}
            aria-busy={busy === "analysis"}
            onClick={() => void deleteAnalysis()}
          >
            {busy === "analysis" ? "Deleting…" : "Delete analysis data"}
          </Button>
        </section>
        <section className="space-y-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-medium">{DELETE_ACCOUNT_LABEL}</h3>
            <SettingInfo label={DELETE_ACCOUNT_LABEL} description={DELETE_ACCOUNT_INFO} />
          </div>
          <p className="text-muted-foreground text-sm">
            Revokes Gmail access when possible, deletes all owned product data, and removes your
            login.
          </p>
          <label className="block text-sm" htmlFor="confirm-delete-account">
            <span className="text-muted-foreground mb-1.5 block">
              Type {DELETE_ACCOUNT_CONFIRMATION} to confirm
            </span>
            <input
              id="confirm-delete-account"
              className="border-input bg-background focus-visible:ring-ring h-9 w-full max-w-md rounded-lg border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none"
              value={accountConfirm}
              onChange={(event) => setAccountConfirm(event.target.value)}
              disabled={busy !== null}
              autoComplete="off"
            />
          </label>
          <Button
            type="button"
            variant="destructive"
            disabled={busy !== null || accountConfirm !== DELETE_ACCOUNT_CONFIRMATION}
            aria-busy={busy === "account"}
            onClick={() => void deleteAccount()}
          >
            {busy === "account" ? "Deleting…" : "Delete account"}
          </Button>
        </section>
        {message ? (
          <p
            className={error ? "text-destructive text-sm" : "text-sm"}
            role={error ? "alert" : "status"}
          >
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
