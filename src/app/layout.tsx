import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { ThemeSync } from "@/components/theme/theme-sync";
import { THEME_INIT_SCRIPT } from "@/lib/ui/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: "MailPriority",
  description:
    "Turn your inbox into a triage system that tells you what happened, your Actions, and what's pending.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // Do not put a React `className` on `<html>`. Hydration replaces that
    // attribute wholesale and would wipe the `dark` class set by the bootstrap
    // script (sudden light/dark flip). Height/antialias live in CSS / body.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeSync />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
