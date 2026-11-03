const normalizeVideoAsset = (asset) => {
  if (typeof asset === "string") {
    const url = asset.trim();
    return url ? { url, publicId: "" } : null;
  }

  if (!asset || typeof asset !== "object") return null;
  const url = asset.url || asset.secure_url || asset.path || asset.videoUrl || "";
  if (typeof url !== "string" || !url.trim()) return null;
  return {
    url: url.trim(),
    publicId: asset.publicId || asset.public_id || "",
  };
};

const getProductVideoAsset = (product) => {
  if (!product || typeof product !== "object") return null;
  const candidates = [
    product.video,
    ...(Array.isArray(product.videos) ? product.videos : []),
    product.videoUrl,
    product.videoURL,
    product.productVideo,
    product.videoAsset,
    ...(Array.isArray(product.videoAssets) ? product.videoAssets : []),
  ];

  for (const candidate of candidates) {
    const asset = normalizeVideoAsset(candidate);
    if (asset) return asset;
  }

  return null;
};

module.exports = { getProductVideoAsset };
