import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// Public, indexable pages only , everything else is behind sign-in.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.AUTH_URL.replace(/\/$/, "");
  return [
    { url: `${base}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.5 },
  ];
}
