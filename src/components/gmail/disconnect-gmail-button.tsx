"use client";

import { type FormEvent } from "react";

import { Button } from "@/components/ui/button";

export function DisconnectGmailButton({ returnTo = "/settings" }: { returnTo?: string }) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        "Disconnect Gmail? MailPriority will stop scanning and remove stored mail from this app. Messages in Gmail stay.",
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <form action="/api/gmail/disconnect" method="post" onSubmit={onSubmit}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button type="submit" variant="destructive" aria-label="Disconnect Gmail from MailPriority">
        Disconnect Gmail
      </Button>
    </form>
  );
}
