import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

import { sentryInstrumentationTurbopackRules } from "./src/lib/observability/sentry-turbopack-rules.mjs";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/digests",
        destination: "/history",
        permanent: true,
      },
      {
        source: "/digests/:path*",
        destination: "/history/:path*",
        permanent: true,
      },
    ];
  },
  // Pin the workspace root so Turbopack doesn't get confused by unrelated
  // lockfiles that may exist in parent directories.
  // Own Sentry's instrumentation matchers so Turbopack does not require
  // @sentry/nextjs/build/.../valueInjectionLoader.js (not in package exports).
  turbopack: {
    root: process.cwd(),
    rules: sentryInstrumentationTurbopackRules(),
  },
};

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: sentryAuthToken,
  silent: !process.env.CI,
  sourcemaps: {
    disable: !sentryAuthToken,
  },
  telemetry: false,
});
