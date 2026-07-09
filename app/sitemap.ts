import type { MetadataRoute } from "next";

const BASE = process.env.APP_URL ?? "https://mw-finance-six.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE,                    lastModified: new Date(), changeFrequency: "daily",   priority: 1   },
    { url: `${BASE}/transactions`,  lastModified: new Date(), changeFrequency: "daily",   priority: 0.8 },
    { url: `${BASE}/budgets`,       lastModified: new Date(), changeFrequency: "weekly",  priority: 0.7 },
    { url: `${BASE}/insights`,      lastModified: new Date(), changeFrequency: "weekly",  priority: 0.7 },
    { url: `${BASE}/goals`,         lastModified: new Date(), changeFrequency: "weekly",  priority: 0.6 },
    { url: `${BASE}/simulate`,      lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/assistant`,     lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  ];
}
