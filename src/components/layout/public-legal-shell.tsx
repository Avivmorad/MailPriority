import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { SkipToContent } from "@/components/layout/skip-to-content";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function PublicLegalShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <SkipToContent />
      <header className="border-border/60 border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            aria-label="MailPriority home"
            className="focus-visible:ring-ring rounded-lg focus-visible:ring-3 focus-visible:outline-none"
          >
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 [overflow-wrap:anywhere]"
      >
        {children}
      </main>
    </div>
  );
}
