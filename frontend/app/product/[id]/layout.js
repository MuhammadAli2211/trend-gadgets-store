import { getProductImageUrl, getPublicProduct } from "../../../lib/publicProductServer";

const cleanDescription = (value) => {
  const description = String(value || "Shop this product from Cart2Door. Order directly through WhatsApp.")
    .replace(/\s+/g, " ")
    .trim();
  return description.length > 155 ? `${description.slice(0, 152).trimEnd()}…` : description;
};

export async function generateMetadata({ params }) {
  const { id } = await params;
  const product = await getPublicProduct(id);
  if (!product) {
    return {
      title: "Product not found",
      robots: { index: false, follow: true },
    };
  }

  const title = product.name || "Shop product";
  const description = cleanDescription(product.description);
  const image = getProductImageUrl(product) || "/cart2door-logo.png";
  const canonical = `/product/${encodeURIComponent(id)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
      images: [{ url: image, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function ProductLayout({ children, params }) {
  const { id } = await params;
  const product = await getPublicProduct(id);
  const images = (product?.images || [])
    .map((image) => typeof image === "string" ? image : image?.url || image?.secure_url)
    .filter(Boolean);
  const price = Number(product?.price);
  const productSchema = product ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: cleanDescription(product.description),
    image: images,
    category: product.category || undefined,
    url: `https://trend-gadgets-storefront.vercel.app/product/${encodeURIComponent(id)}`,
    offers: Number.isFinite(price) ? {
      "@type": "Offer",
      priceCurrency: "PKR",
      price: price.toFixed(2),
      url: `https://trend-gadgets-storefront.vercel.app/product/${encodeURIComponent(id)}`,
    } : undefined,
  } : null;

  return (
    <>
      {productSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema).replace(/</g, "\\u003c") }}
        />
      )}
      {children}
    </>
  );
}
