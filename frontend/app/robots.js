const siteUrl = "https://trend-gadgets-storefront.vercel.app";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin-dashboard/", "/login", "/signup"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
