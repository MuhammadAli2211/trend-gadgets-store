export const PRODUCT_CATEGORIES = [
  "Toys",
  "Photo Frames",
  "Electronics",
  "Clothing",
  "Other",
];

export function normalizeProductCategory(value) {
  const category = String(value || "").trim();
  return PRODUCT_CATEGORIES.find(
    (item) => item.toLowerCase() === category.toLowerCase()
  ) || category || "Other";
}

export function getProductCategoryList(products = []) {
  return [...new Set([
    ...PRODUCT_CATEGORIES,
    ...products.map((product) => normalizeProductCategory(product.category)),
  ].filter(Boolean))];
}
