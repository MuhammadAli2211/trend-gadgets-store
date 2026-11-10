const normalizeHashtag = (value) => String(value || "")
  .trim()
  .replace(/^#/, "")
  .replace(/[^\p{L}\p{N}_]+/gu, "");

const buildProductHashtags = (product) => [...new Set([
  product?.category,
  ...(Array.isArray(product?.tags) ? product.tags : []),
].map(normalizeHashtag).filter(Boolean))].map((tag) => `#${tag}`);

const appendProductHashtags = (caption, product, siteUrl = process.env.FRONTEND_URL || "") => {
  const numericPrice = Number(product?.price);
  const priceLine = Number.isFinite(numericPrice) && numericPrice >= 0
    ? `Price: Rs. ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(numericPrice)}`
    : "";

  // Keep product name and description, but strip stale/generated links and
  // any old price line so the current product data is authoritative.
  const cleanCaption = String(caption || "")
    .split(/\r?\n/)
    .filter((line) => !/(?:^\s*price\s*:|https?:\/\/|www\.|shop this product\s*:|chat on whatsapp\s*:)/i.test(line))
    .join("\n")
    .trim()
    .slice(0, 1200);

  const configuredSiteUrl = String(siteUrl || "").trim().replace(/\/+$/, "");
  const cleanSiteUrl = /^https:\/\//i.test(configuredSiteUrl)
    ? configuredSiteUrl
    : "https://trend-gadgets-storefront.vercel.app";
  const productId = product?._id?.toString?.() || product?.id || "";
  const productUrl = productId
    ? `${cleanSiteUrl}/product/${encodeURIComponent(productId)}`
    : "";

  let internationalPhone = String(product?.whatsappNumber || process.env.WHATSAPP_NUMBER || "923442905070").replace(/\D/g, "");
  if (/^0\d{10}$/.test(internationalPhone)) internationalPhone = `92${internationalPhone.slice(1)}`;
  const whatsappUrl = internationalPhone ? `https://wa.me/${internationalPhone}` : "";

  const hashtags = buildProductHashtags(product);
  const present = new Set((cleanCaption.match(/#[\p{L}\p{N}_]+/gu) || []).map((tag) => tag.toLowerCase()));
  const missing = hashtags.filter((tag) => !present.has(tag.toLowerCase()));

  // Required post order: name, price, description, WhatsApp link, product link.
  const sections = [
    cleanCaption,
    priceLine,
    whatsappUrl ? `WhatsApp: ${whatsappUrl}` : "",
    productUrl ? `Product: ${productUrl}` : "",
    missing.length ? missing.join(" ") : "",
  ].filter(Boolean);

  return sections.join("\n\n").slice(0, 2100);
};

const createProductSocialCaption = (product, siteUrl = process.env.FRONTEND_URL || "") => {
  const description = String(product?.description || "").trim();
  return appendProductHashtags([
    product?.name,
    description,
  ].filter(Boolean).join("\n\n"), product, siteUrl);
};

module.exports = { buildProductHashtags, appendProductHashtags, createProductSocialCaption };
