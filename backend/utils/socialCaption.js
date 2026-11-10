const normalizeHashtag = (value) => String(value || "")
  .trim()
  .replace(/^#/, "")
  .replace(/[^\p{L}\p{N}_]+/gu, "");

const buildProductHashtags = (product) => [...new Set([
  product?.category,
  ...(Array.isArray(product?.tags) ? product.tags : []),
].map(normalizeHashtag).filter(Boolean))].map((tag) => `#${tag}`);

const appendProductHashtags = (caption, product, siteUrl = process.env.FRONTEND_URL || "") => {
  // Always use the saved product price, not a price guessed by generated copy.
  const numericPrice = Number(product?.price);
  const priceLine = Number.isFinite(numericPrice) && numericPrice >= 0
    ? `Price: Rs. ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(numericPrice)}`
    : "";

  // Keep the post focused on the product: remove generated homepage,
  // WhatsApp, or other URLs. The canonical product URL is added below.
  const cleanCaption = String(caption || "")
    .replace(/^\s*price\s*:\s*.*$/gim, "")
    .replace(/https?:\/\/[^\s]+/gi, "")
    .replace(/www\.[^\s]+/gi, "")
    .trim()
    .slice(0, 1500);

  const sections = [priceLine, cleanCaption].filter(Boolean);
  const internationalPhone = String(product?.whatsappNumber || process.env.WHATSAPP_NUMBER || "923442905070").replace(/\D/g, "");
  const contactPhone = /^0\d{10}$/.test(internationalPhone)
    ? internationalPhone
    : internationalPhone.startsWith("92")
      ? `0${internationalPhone.slice(2)}`
      : internationalPhone;

  if (contactPhone && !/(?:for order contact|whatsapp orders):/i.test(cleanCaption)) {
    sections.push(`WhatsApp orders: ${contactPhone}`);
  }

  const configuredSiteUrl = String(siteUrl || "").trim().replace(/\/+$/, "");
  const cleanSiteUrl = /^https:\/\//i.test(configuredSiteUrl)
    ? configuredSiteUrl
    : "https://trend-gadgets-storefront.vercel.app";
  const productId = product?._id?.toString?.() || product?.id || "";
  const productUrl = productId
    ? `${cleanSiteUrl}/product/${encodeURIComponent(productId)}`
    : "";

  if (productUrl) {
    sections.push(`Shop this product: ${productUrl}`);
  }

  const hashtags = buildProductHashtags(product);
  const present = new Set((cleanCaption.match(/#[\p{L}\p{N}_]+/gu) || []).map((tag) => tag.toLowerCase()));
  const missing = hashtags.filter((tag) => !present.has(tag.toLowerCase()));
  if (missing.length) sections.push(missing.join(" "));

  return sections.filter(Boolean).join("\n\n").slice(0, 2100);
};

const createProductSocialCaption = (product, siteUrl = process.env.FRONTEND_URL || "") => {
  const description = String(product?.description || "").trim();
  return appendProductHashtags([
    product?.name,
    description,
  ].filter(Boolean).join("\n\n"), product, siteUrl);
};

module.exports = { buildProductHashtags, appendProductHashtags, createProductSocialCaption };
