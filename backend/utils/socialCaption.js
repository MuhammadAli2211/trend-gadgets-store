const normalizeHashtag = (value) => String(value || "")
  .trim()
  .replace(/^#/, "")
  .replace(/[^\p{L}\p{N}_]+/gu, "");

const buildProductHashtags = (product) => [...new Set([
  product?.category,
  ...(Array.isArray(product?.tags) ? product.tags : []),
].map(normalizeHashtag).filter(Boolean))].map((tag) => `#${tag}`);

const appendProductHashtags = (caption, product, siteUrl = process.env.FRONTEND_URL || "") => {
  const text = String(caption || "").trim().slice(0, 1500);
  const sections = [text];
  let internationalPhone = String(product?.whatsappNumber || process.env.WHATSAPP_NUMBER || "923442905070").replace(/\D/g, "");
  if (/^0\d{10}$/.test(internationalPhone)) internationalPhone = `92${internationalPhone.slice(1)}`;
  const contactPhone = internationalPhone.startsWith("92")
    ? `0${internationalPhone.slice(2)}`
    : internationalPhone;
  if (!/(?:for order contact|whatsapp orders):/i.test(text)) {
    sections.push(`WhatsApp orders: ${contactPhone}`);
  }
  const configuredSiteUrl = String(siteUrl || "").trim().replace(/\/+$/, "");
  const cleanSiteUrl = /^https:\/\//i.test(configuredSiteUrl)
    ? configuredSiteUrl
    : "https://trend-gadgets-storefront.vercel.app";
  const productId = product?._id?.toString?.() || product?.id || "";
  const productUrl = `${cleanSiteUrl}${productId ? `/product/${encodeURIComponent(productId)}` : ""}`;
  const whatsappUrl = internationalPhone ? `https://wa.me/${internationalPhone}` : "";
  if (whatsappUrl && !text.includes(whatsappUrl)) {
    sections.push(`Chat on WhatsApp: ${whatsappUrl}`);
  }
  if (productUrl && !text.includes(productUrl)) {
    sections.push(`Shop this product: ${productUrl}`);
  }
  const hashtags = buildProductHashtags(product);
  const present = new Set((text.match(/#[\p{L}\p{N}_]+/gu) || []).map((tag) => tag.toLowerCase()));
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
