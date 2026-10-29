import { cache } from "react";

const API_BASE = process.env.NODE_ENV === "production"
  ? "https://trend-gadgets-api.vercel.app/api"
  : process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export const getPublicProduct = cache(async (productId) => {
  if (!productId) return null;
  try {
    const response = await fetch(
      `${API_BASE}/public/products/${encodeURIComponent(productId)}`,
      { next: { revalidate: 3600 } }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data?.success ? data.product : null;
  } catch (error) {
    console.error("Public product metadata fetch failed:", error.message);
    return null;
  }
});

export const getPublicProducts = cache(async () => {
  try {
    const response = await fetch(`${API_BASE}/public/products`, { next: { revalidate: 3600 } });
    if (!response.ok) return [];
    const data = await response.json();
    return data?.success && Array.isArray(data.products) ? data.products : [];
  } catch (error) {
    console.error("Public product sitemap fetch failed:", error.message);
    return [];
  }
});

export const getProductImageUrl = (product) => {
  const image = product?.images?.[0];
  return typeof image === "string" ? image : image?.url || image?.secure_url || "";
};
