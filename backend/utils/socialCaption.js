const normalizeHashtag = (value) => String(value || "")
  .trim()
  .replace(/^#/, "")
  .replace(/[^\p{L}\p{N}_]+/gu, "");

const buildProductHashtags = (product) => [...new Set([
  product?.category,
  ...(Array.isArray(product?.tags) ? product.tags : []),
].map(normalizeHashtag).filter(Boolean))].map((tag) => `#${tag}`);

const appendProductHashtags = (caption, product) => {
  const text = String(caption || "").trim().slice(0, 1500);
  const sections = [text];
  if (!/for order contact:\s*03442905070/i.test(text)) sections.push("For order contact: 03442905070");
  const websiteUrl = String(process.env.FRONTEND_URL || "").trim();
  if (websiteUrl && !text.includes(websiteUrl)) sections.push(websiteUrl);
  const hashtags = buildProductHashtags(product);
  const present = new Set((text.match(/#[\p{L}\p{N}_]+/gu) || []).map((tag) => tag.toLowerCase()));
  const missing = hashtags.filter((tag) => !present.has(tag.toLowerCase()));
  if (missing.length) sections.push(missing.join(" "));
  return sections.filter(Boolean).join("\n\n").slice(0, 2100);
};

const createProductSocialCaption = (product, siteUrl = "") => {
  const description = String(product?.description || "").trim();
  return appendProductHashtags([
    product?.name,
    description,
    siteUrl,
  ].filter(Boolean).join("\n\n"), product);
};

module.exports = { buildProductHashtags, appendProductHashtags, createProductSocialCaption };
