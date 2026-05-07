import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://tracker.example.com";
  const lastModified = new Date();

  return [
    { url: `${baseUrl}/`, lastModified, priority: 1 },
    { url: `${baseUrl}/login`, lastModified, priority: 0.8 },
  ];
}
