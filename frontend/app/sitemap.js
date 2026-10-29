import { getPublicProducts } from "../lib/publicProductServer";

const siteUrl = "https://trend-gadgets-storefront.vercel.app";

export const revalidate = 3600;

export default async function sitemap() {
  const products = await getPublicProducts();
  const productEntries = products
    .filter((product) => product?._id)
    .map((product) => ({
      url: `${siteUrl}/product/${encodeURIComponent(product._id)}`,
      lastModified: product.updatedAt || product.createdAt
        ? new Date(product.updatedAt || product.createdAt)
        : undefined,
      changeFrequency: "weekly",
      priority: 0.8,
    }));

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    ...productEntries,
  ];
}
