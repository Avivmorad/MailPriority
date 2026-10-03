import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function isUseClientModule(source: string): boolean {
  const firstCodeLine = source
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("//") && !line.startsWith("/*"));
  return firstCodeLine === '"use client";' || firstCodeLine === "'use client';";
}

function resolveAlias(specifier: string): string | null {
  if (!specifier.startsWith("@/")) {
    return null;
  }
  const base = path.join(ROOT, "src", specifier.slice(2));
  for (const extension of [".ts", ".tsx"]) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Mail cards render inside server pages (dashboard, history). Calling a
 * function that lives in a "use client" module crashes those pages with
 * Next's client error boundary.
 */
describe("MailListCard server boundary", () => {
  it("does not call functions exported from client modules", () => {
    const relative = "src/components/mail/mail-list-card.tsx";
    const source = readSource(relative);
    expect(isUseClientModule(source)).toBe(false);

    const violations: string[] = [];
    for (const match of source.matchAll(
      /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+"(@\/[^"]+)"/g,
    )) {
      const specifier = match[2] ?? "";
      const resolved = resolveAlias(specifier);
      if (!resolved || !isUseClientModule(readFileSync(resolved, "utf8"))) {
        continue;
      }
      const names = (match[1] ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0 && !part.startsWith("type "))
        .map((part) => part.split(/\s+as\s+/)[0]?.trim() ?? "")
        .filter((name) => /^[a-z]/.test(name));
      for (const name of names) {
        if (new RegExp(`\\b${name}\\s*\\(`).test(source)) {
          violations.push(`${name} from ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
