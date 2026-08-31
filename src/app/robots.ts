import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = env.AUTH_URL.replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/about", "/privacy", "/terms"],
        disallow: [
          "/api/",
          "/dashboard",
          "/applications",
          "/settings",
          "/onboarding",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
