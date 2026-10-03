import type { MetadataRoute } from "next";

import { publicAppOrigin } from "@/lib/seo/public-origin";

export default function robots(): MetadataRoute.Robots {
  const origin = publicAppOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms", "/login"],
      disallow: [
        "/dashboard",
        "/mail",
        "/settings",
        "/onboarding",
        "/thread",
        "/actions",
        "/history",
        "/digests",
        "/login/update-password",
        "/api/",
        "/auth/",
      ],
    },
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
